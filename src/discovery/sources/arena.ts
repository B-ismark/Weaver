import "server-only";
import type { CandidateItem, CandidateSource } from "../types";
import { getTasteSeeds } from "../seeds";

/**
 * Are.na discovery source (free, public API, no auth). Are.na is curated visual
 * "blocks" in channels — the closest analogue to Pinterest boards, so a strong
 * aesthetic fit (discovery spec §4).
 *
 * Strategy: for each taste seed term, search for the most image-rich channels,
 * then pull their contents. This finds large active channels dynamically instead
 * of hard-coding slugs (which mostly point at small/text channels). Seeds are
 * DERIVED from the user's taste (captions + positive keywords) so the wells
 * follow taste drift — seed-guided pull (§5.2). See discovery/seeds.ts.
 */
const CHANNELS_PER_SEED = 2;
const BLOCKS_PER_CHANNEL = 25;
const MIN_CHANNEL_LENGTH = 50; // skip tiny channels
const UA = "weaver-personal-aggregator/0.1";

type ArenaChannel = { slug: string; length: number };
type ArenaBlock = {
  class: string;
  id: number;
  title: string | null;
  generated_title: string | null;
  source: { url: string | null } | null;
  image: { content_type?: string; display?: { url: string }; large?: { url: string } } | null;
};

// No video/animated formats (no autoplay, for now).
const VIDEO_OR_GIF = /\.(gif|gifv|mp4|webm|mov)(\?|$)/i;
function isStaticImage(url: string, contentType?: string): boolean {
  if (contentType && /(video|gif)/i.test(contentType)) return false;
  return !VIDEO_OR_GIF.test(url);
}

async function topChannels(seed: string): Promise<string[]> {
  const res = await fetch(`https://api.are.na/v2/search/channels?q=${encodeURIComponent(seed)}&per=8`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { channels?: ArenaChannel[] };
  return (json.channels ?? [])
    .filter((c) => (c.length ?? 0) >= MIN_CHANNEL_LENGTH)
    .slice(0, CHANNELS_PER_SEED)
    .map((c) => c.slug);
}

async function pullChannel(slug: string): Promise<CandidateItem[]> {
  const res = await fetch(
    `https://api.are.na/v2/channels/${slug}/contents?per=${BLOCKS_PER_CHANNEL}&direction=desc`,
    { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) }
  );
  if (!res.ok) return [];
  const json = (await res.json()) as { contents?: ArenaBlock[] };
  const out: CandidateItem[] = [];
  for (const b of json.contents ?? []) {
    if (b.class !== "Image") continue; // images only (§3)
    const url = b.image?.display?.url ?? b.image?.large?.url;
    if (!url || !isStaticImage(url, b.image?.content_type)) continue; // no video/gif
    out.push({
      imageUrl: url,
      sourceLink: b.source?.url ?? `https://www.are.na/block/${b.id}`,
      caption: (b.title || b.generated_title || "").slice(0, 300),
      source: "arena",
      // Dims unknown from Are.na → the Space fills them at embed time.
    });
  }
  return out;
}

export const arenaSource: CandidateSource = {
  name: "arena",
  async pull(): Promise<CandidateItem[]> {
    const seeds = await getTasteSeeds(6);
    const slugLists = await Promise.all(seeds.map((s) => topChannels(s).catch(() => [])));
    const slugs = [...new Set(slugLists.flat())]; // dedup channels across seeds
    const batches = await Promise.all(slugs.map((s) => pullChannel(s).catch(() => [])));
    return batches.flat();
  },
};
