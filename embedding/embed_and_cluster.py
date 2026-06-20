#!/usr/bin/env python3
"""
Weaver — offline image embedding + taste clustering (Phase 2, §8.2/§8.3).

Runs on your own compute or a free Colab GPU. Steps:
  1. Pull items with no embedding from Supabase (REST, secret key).
  2. Embed each thumbnail with OpenCLIP ViT-B/32, L2-normalize (512-dim).
  3. Write embeddings back to items.embedding.
  4. K-means over ALL embeddings -> taste centroids (multi-interest, not an
     averaged blur). Replace taste_centroids with the fresh set.

Why offline/batched: embeddings are the one real compute cost (§8.7); the app
never blocks on them. Re-run after each import.

Setup:
  python -m venv .venv && . .venv/Scripts/activate   # (Windows: .venv\\Scripts\\activate)
  pip install -r embedding/requirements.txt
  python embedding/embed_and_cluster.py
"""

import io
import math
import os
import sys
from pathlib import Path

import numpy as np
import requests
import torch
import open_clip
from PIL import Image
from sklearn.cluster import KMeans

MODEL_NAME = "ViT-B-32"
PRETRAINED = "laion2b_s34b_b79k"  # open community weights (§6.2)
EMBED_DIM = 512
BATCH = 32


def load_env() -> dict:
    env_path = Path(__file__).resolve().parent.parent / ".env.local"
    env = {}
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()
    return env


ENV = load_env()
BASE = ENV["NEXT_PUBLIC_SUPABASE_URL"] + "/rest/v1"
KEY = ENV["SUPABASE_SECRET_KEY"]
HEADERS = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
}


def vec_to_pg(v: np.ndarray) -> str:
    """pgvector text literal: '[a,b,c]'."""
    return "[" + ",".join(f"{x:.7f}" for x in v.tolist()) + "]"


def fetch_unembedded() -> list[dict]:
    r = requests.get(
        f"{BASE}/items",
        headers=HEADERS,
        params={"embedding": "is.null", "select": "id,thumb_url,image_url"},
        timeout=60,
    )
    r.raise_for_status()
    return r.json()


def fetch_all_embeddings() -> list[dict]:
    r = requests.get(
        f"{BASE}/items",
        headers=HEADERS,
        params={"embedding": "not.is.null", "select": "id,embedding"},
        timeout=120,
    )
    r.raise_for_status()
    return r.json()


def patch_embedding(item_id: str, vec: np.ndarray) -> None:
    r = requests.patch(
        f"{BASE}/items",
        headers=HEADERS,
        params={"id": f"eq.{item_id}"},
        json={"embedding": vec_to_pg(vec)},
        timeout=60,
    )
    r.raise_for_status()


def replace_centroids(centroids: np.ndarray, sizes: list[int]) -> None:
    requests.delete(f"{BASE}/taste_centroids", headers=HEADERS,
                    params={"id": "not.is.null"}, timeout=60).raise_for_status()
    rows = [{"centroid": vec_to_pg(c), "size": int(s)} for c, s in zip(centroids, sizes)]
    requests.post(f"{BASE}/taste_centroids", headers=HEADERS, json=rows, timeout=60).raise_for_status()


def main() -> int:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Device: {device}")
    model, _, preprocess = open_clip.create_model_and_transforms(
        MODEL_NAME, pretrained=PRETRAINED
    )
    model = model.to(device).eval()

    pending = fetch_unembedded()
    print(f"Items to embed: {len(pending)}")

    embedded = 0
    for item in pending:
        url = item.get("thumb_url") or item.get("image_url")
        if not url:
            continue
        try:
            resp = requests.get(url, timeout=60)
            resp.raise_for_status()
            img = Image.open(io.BytesIO(resp.content)).convert("RGB")
            tensor = preprocess(img).unsqueeze(0).to(device)
            with torch.no_grad():
                feat = model.encode_image(tensor)
                feat = feat / feat.norm(dim=-1, keepdim=True)  # L2-normalize
            patch_embedding(item["id"], feat.cpu().numpy()[0].astype(np.float32))
            embedded += 1
            print(f"  embedded {embedded}/{len(pending)}: {item['id']}")
        except Exception as e:  # noqa: BLE001 — skip a bad image, keep going
            print(f"  SKIP {item['id']}: {e}", file=sys.stderr)

    # --- taste centroids over ALL embeddings (§8.3) ---
    rows = fetch_all_embeddings()
    if len(rows) < 2:
        print("Not enough embeddings to cluster; skipping centroids.")
        return 0

    X = np.array(
        [np.fromstring(r["embedding"].strip("[]"), sep=",") for r in rows],
        dtype=np.float32,
    )
    # Heuristic k: ~sqrt(n/2), clamped to [1, 8]; never more clusters than items.
    k = max(1, min(8, int(round(math.sqrt(len(X) / 2))), len(X)))
    km = KMeans(n_clusters=k, n_init=10, random_state=42).fit(X)

    centroids = km.cluster_centers_
    centroids = centroids / np.linalg.norm(centroids, axis=1, keepdims=True)  # renormalize
    sizes = np.bincount(km.labels_, minlength=k).tolist()
    replace_centroids(centroids.astype(np.float32), sizes)
    print(f"Wrote {k} taste centroids (sizes={sizes}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
