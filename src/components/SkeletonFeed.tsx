/**
 * Placeholder masonry while a feed/search loads. Mirrors the real grid — many
 * varied-height FRAMELESS tiles (no caption strip, tight radius) in auto-fitting
 * columns — so it reads as "images loading", matching the new gallery-wall cards
 * rather than the old captioned pinboard. Pure CSS shimmer (no JS) so it renders
 * instantly in a Next `loading.tsx` boundary and honours prefers-reduced-motion.
 */
const HEIGHTS = [200, 270, 170, 320, 230, 190, 290, 150, 250, 210, 300, 180, 240, 160, 280, 220];

export function SkeletonFeed({ count = 16, label }: { count?: number; label?: string }) {
  return (
    <div aria-hidden="true">
      {label && <p className="mb-4 text-sm text-muted">{label}</p>}
      {/* auto-fitting columns ≈ the real masonry widths */}
      <div className="columns-[180px] gap-4 sm:columns-[200px] lg:columns-[220px]">
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            className="skeleton mb-4 w-full break-inside-avoid rounded-lg"
            style={{ height: HEIGHTS[i % HEIGHTS.length], animationDelay: `${(i % 6) * 110}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
