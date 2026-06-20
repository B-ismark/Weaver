/**
 * Decide whether a remote image should go through next/image optimization.
 *
 * Only our own cached thumbnails (Supabase storage) are optimized — they're a
 * known, bounded host. Discovery candidates are hotlinked from arbitrary CC /
 * platform hosts (Openverse, Are.na, i.pinimg.com, …); optimizing those would
 * require either a `**` wildcard remotePattern (an open-proxy + Vercel image
 * quota/cost risk on a $0 budget) or an ever-growing whitelist. Instead we mark
 * them `unoptimized`, which bypasses the optimizer entirely — so ANY host renders
 * with no whitelist, no cost, and no exposure. (Research: next/image docs warn
 * against wildcard hosts; unoptimized images skip remotePatterns checks.)
 */
export function shouldOptimize(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}
