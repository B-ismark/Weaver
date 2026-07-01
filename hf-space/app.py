"""
Weaver — OpenCLIP embedding service (§9, discovery v2 §10.4).

ONE free hosted model (HF Spaces, Docker, CPU) serving the whole vector space:
  - POST /embed         text  -> 512-vec   (search queries, §8.4)
  - POST /embed-image   image URLs -> 512-vecs (taste backfill + discovery candidates)
  - GET  /health

Text and images MUST share one space (that's CLIP) — so one service, both jobs.
This removes any need for a local machine / Colab: the Space embeds everything.

Deploy: Space (SDK: Docker), push this folder, set EMBED_TOKEN as a secret, point
the app's EMBED_ENDPOINT at https://<user>-<space>.hf.space

All vectors are OpenCLIP ViT-B/32, L2-normalized, 512-dim — matching the image
embedding pipeline.
"""

import io
import os
from urllib.parse import urlsplit

import numpy as np
import open_clip
import requests
import torch
from fastapi import FastAPI, Header, HTTPException
from PIL import Image
from pydantic import BaseModel

MODEL_NAME = "ViT-B-32"
PRETRAINED = "laion2b_s34b_b79k"
EMBED_TOKEN = os.environ.get("EMBED_TOKEN")  # optional shared secret
MAX_IMAGES = 64  # per request (batch to amortize cold start + HTTP)
FETCH_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120 Safari/537.36"
)

app = FastAPI(title="Weaver OpenCLIP encoder")

device = "cuda" if torch.cuda.is_available() else "cpu"
model, _, preprocess = open_clip.create_model_and_transforms(MODEL_NAME, pretrained=PRETRAINED)
model = model.to(device).eval()
tokenizer = open_clip.get_tokenizer(MODEL_NAME)


def _check_auth(authorization: str | None) -> None:
    if EMBED_TOKEN and authorization != f"Bearer {EMBED_TOKEN}":
        raise HTTPException(status_code=401, detail="unauthorized")


class TextRequest(BaseModel):
    text: str


class ImageRequest(BaseModel):
    urls: list[str]


@app.get("/health")
def health():
    return {"ok": True, "device": device}


@app.post("/embed")
def embed_text(req: TextRequest, authorization: str | None = Header(default=None)):
    _check_auth(authorization)
    if not req.text.strip():
        raise HTTPException(status_code=422, detail="empty text")
    tokens = tokenizer([req.text]).to(device)
    with torch.no_grad():
        feat = model.encode_text(tokens)
        feat = feat / feat.norm(dim=-1, keepdim=True)
    return {"embedding": feat.cpu().numpy()[0].astype(np.float32).tolist()}


@app.post("/embed-image")
def embed_image(req: ImageRequest, authorization: str | None = Header(default=None)):
    """
    Batch image embedding. Returns one entry per input URL, in order. Failed
    fetches/decodes return null (caller filters) so one bad image never fails
    the batch.
    """
    _check_auth(authorization)
    urls = req.urls[:MAX_IMAGES]
    if not urls:
        raise HTTPException(status_code=422, detail="no urls")

    tensors, slots = [], []
    dims: list[list[int] | None] = [None] * len(urls)
    for i, url in enumerate(urls):
        try:
            # Send a same-origin Referer alongside the browser UA. Some image hosts
            # (e.g. artic.edu's IIIF server) 403 a UA-only request but serve fine
            # when a Referer is present; deriving it from the image's own origin is
            # generic and harmless to hosts that ignore it.
            parts = urlsplit(url)
            referer = f"{parts.scheme}://{parts.netloc}/" if parts.scheme and parts.netloc else url
            r = requests.get(url, headers={"User-Agent": FETCH_UA, "Referer": referer}, timeout=30)
            r.raise_for_status()
            img = Image.open(io.BytesIO(r.content)).convert("RGB")
            dims[i] = [img.width, img.height]  # source-agnostic dims (no layout shift)
            tensors.append(preprocess(img))
            slots.append(i)
        except Exception:  # noqa: BLE001 — skip bad image, keep batch
            pass

    out: list[list[float] | None] = [None] * len(urls)
    if tensors:
        batch = torch.stack(tensors).to(device)
        with torch.no_grad():
            feats = model.encode_image(batch)
            feats = feats / feats.norm(dim=-1, keepdim=True)
        feats = feats.cpu().numpy().astype(np.float32)
        for slot, vec in zip(slots, feats):
            out[slot] = vec.tolist()

    return {"embeddings": out, "dims": dims}
