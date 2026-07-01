import type { NextConfig } from "next";

/**
 * Weaver — Next.js config.
 * - Security headers + PWA service-worker headers (per Next.js PWA guide).
 * - remotePatterns: thumbnails come from Supabase storage; full-res hotlinks
 *   from platform CDNs (§5). Placeholder data uses picsum during Phase 0.
 */
const nextConfig: NextConfig = {
  // React <ViewTransition> for native, dependency-free route animations: the
  // feed thumbnail morphs into the detail hero (shared-element continuity).
  // Progressive — unsupported browsers just navigate without the morph.
  experimental: {
    viewTransition: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" }, // cached thumbnails (§5.1)
      { protocol: "https", hostname: "i.pinimg.com" }, // Pinterest CDN full-res (§5.2)
      { protocol: "https", hostname: "picsum.photos" }, // Phase 0 placeholder only
      // Discovery candidates are hotlinked, not cached (discovery §10.1). They're
      // rendered `unoptimized` today (imageHost.shouldOptimize), so these patterns
      // aren't consulted yet — but keep them complete + in sync with the live
      // sources so optimization can be turned on per-host without a blank-tile
      // surprise. One entry per host actually present in the candidate pool.
      { protocol: "https", hostname: "images.are.na" }, // Are.na display images
      { protocol: "https", hostname: "*.cloudfront.net" }, // Are.na originals
      { protocol: "https", hostname: "i.redd.it" },
      { protocol: "https", hostname: "preview.redd.it" },
      { protocol: "https", hostname: "external-preview.redd.it" },
      { protocol: "https", hostname: "www.artic.edu" }, // Art Institute of Chicago IIIF
      { protocol: "https", hostname: "live.staticflickr.com" }, // Openverse (Flickr)
      { protocol: "https", hostname: "images-assets.nasa.gov" }, // NASA image library
      { protocol: "https", hostname: "openaccess-cdn.clevelandart.org" }, // Cleveland Museum
      { protocol: "https", hostname: "images.metmuseum.org" }, // The Met
      { protocol: "https", hostname: "upload.wikimedia.org" }, // Wikimedia Commons
      { protocol: "https", hostname: "*.artstation.com" }, // ArtStation CDNs (cdna/cdnb)
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
