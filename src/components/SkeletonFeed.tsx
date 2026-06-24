/**
 * Placeholder masonry while a feed/search loads. Mirrors the real grid — many
 * varied-height cards (with a caption line) in auto-fitting columns — so it
 * reads as "cards loading", not a couple of giant slabs. Pure CSS shimmer (no
 * JS, no GSAP) so it renders instantly in a Next `loading.tsx` boundary and
 * degrades gracefully under prefers-reduced-motion.
 */
const HEIGHTS = [200, 270, 170, 320, 230, 190, 290, 150, 250, 210, 300, 180, 240, 160, 280, 220];

export function SkeletonFeed({ count = 16, label }: { count?: number; label?: string }) {
  return (
    <div aria-hidden="true">
      {label && <p className="mb-4 text-sm text-muted">{label}</p>}
      {/* auto-fitting columns ≈ the real masonry widths */}
      <div className="columns-[180px] gap-4 sm:columns-[200px] lg:columns-[220px]">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="mb-4 break-inside-avoid">
            <div
              className="skeleton w-full rounded-2xl"
              style={{ height: HEIGHTS[i % HEIGHTS.length], animationDelay: `${(i % 6) * 110}ms` }}
            />
            <div
              className="skeleton mt-2 h-3 w-3/4 rounded-full"
              style={{ animationDelay: `${(i % 6) * 110}ms` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
