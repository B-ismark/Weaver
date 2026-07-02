import "server-only";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * Dynamic discovery seeds (discovery spec §5.2 "seed-guided pull").
 *
 * Sources used to hard-code a fixed seed list (photography / architecture / …),
 * so they drew from the same wells forever and never followed the user's taste as
 * it drifted. This derives seeds from the actual taste set instead:
 *   - the most frequent meaningful words in taste-item captions, plus
 *   - the user's positive taste keywords (the /taste page),
 * blended with a few evergreen defaults so breadth never collapses to one term.
 *
 * Cheap (one small query, in-memory count) and cached per server instance for a
 * few minutes so a multi-source sweep doesn't re-query for every source.
 */

// Evergreen fallbacks — used when there's no taste data yet (cold start) and
// blended in for breadth so discovery never tunnels into a single niche.
const EVERGREEN = [
  "photography",
  "architecture",
  "art",
  "design",
  "landscape",
  "minimalism",
];

// Common English + platform noise words to drop from caption tokenisation.
const STOP = new Set([
  "the", "and", "for", "with", "from", "this", "that", "your", "you", "our",
  "was", "are", "has", "have", "had", "not", "but", "all", "any", "can", "her",
  "his", "its", "out", "who", "get", "got", "how", "why", "new", "one", "two",
  "via", "img", "image", "images", "photo", "photos", "pic", "pics", "picture",
  "jpg", "jpeg", "png", "webp", "file", "untitled", "com", "www", "http", "https",
  "pinterest", "instagram", "twitter", "tumblr", "reddit", "flickr", "board",
  "saved", "pin", "post", "posts", "see", "more", "best", "top", "ideas", "idea",
  // Instagram/CDN URL fragments that leak into captions.
  "scontent", "cdninstagram", "fbcdn", "https", "http",
  // Generic caption filler + hashtag noise seen in the taste set (not interests).
  "fits", "shirt", "deadline", "stunning", "blast", "artblast", "project",
  "personal", "piece", "full", "used", "made", "check", "team", "stuff",
  "thing", "things", "want", "love", "feel", "here", "just", "like", "make",
  "when", "what", "which", "they", "been", "over", "into", "also", "your",
]);

let cache: { at: number; seeds: string[] } | null = null;
const TTL_MS = 5 * 60 * 1000;
// No Date.now in workflow scripts, but this runs in the app/runner (allowed here).
const now = () => Date.now();

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
}

/**
 * @param max how many seeds to return (default 8). The result always mixes in at
 *            least a couple of evergreen terms so a sweep stays broad.
 */
export async function getTasteSeeds(max = 8): Promise<string[]> {
  if (cache && now() - cache.at < TTL_MS) return cache.seeds.slice(0, max);

  const seeds: string[] = [];
  try {
    const supabase = getServerSupabase();

    // Positive taste keywords are the strongest explicit signal — take them first.
    const { data: kw } = await supabase
      .from("taste_keywords")
      .select("text")
      .eq("polarity", "positive")
      .limit(20);
    for (const row of kw ?? []) {
      const k = String((row as { text?: string }).text ?? "").trim().toLowerCase();
      if (k && !seeds.includes(k)) seeds.push(k);
    }

    // Frequent words across taste-item captions.
    const { data: items } = await supabase
      .from("items")
      .select("caption")
      .eq("role", "taste")
      .not("caption", "is", null)
      .limit(500);
    const freq = new Map<string, number>();
    for (const row of items ?? []) {
      for (const w of tokenize(String((row as { caption?: string }).caption ?? ""))) {
        freq.set(w, (freq.get(w) ?? 0) + 1);
      }
    }
    const top = [...freq.entries()]
      .filter(([, n]) => n >= 2) // needs to recur to count as a theme
      .sort((a, b) => b[1] - a[1])
      .map(([w]) => w);
    for (const w of top) if (!seeds.includes(w)) seeds.push(w);
  } catch {
    // env/table missing → fall through to evergreen
  }

  // Always fold in a couple of evergreen terms for breadth, then dedup + cap.
  for (const e of EVERGREEN) if (!seeds.includes(e)) seeds.push(e);
  const result = (seeds.length ? seeds : EVERGREEN).slice(0, max);
  cache = { at: now(), seeds: result };
  return result;
}
