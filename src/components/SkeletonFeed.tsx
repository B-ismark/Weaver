/**
 * Placeholder masonry while a feed/search loads. Pure CSS shimmer (no JS) so it
 * can render in a Next `loading.tsx` boundary the instant navigation starts —
 * immediate feedback instead of a frozen page during slow embed/query calls.
 */
const HEIGHTS = [220, 300, 180, 260, 340, 200, 280, 240, 320, 190, 300, 230];

export function SkeletonFeed({ count = 12, label }: { count?: number; label?: string }) {
  return (
    <div aria-hidden="true">
      {label && <p className="mb-4 text-sm text-muted">{label}</p>}
      <div className="columns-2 gap-4 sm:columns-3 lg:columns-4 [&>*]:mb-4">
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            className="skeleton w-full break-inside-avoid rounded-2xl"
            style={{ height: HEIGHTS[i % HEIGHTS.length] }}
          />
        ))}
      </div>
    </div>
  );
}
