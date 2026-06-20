import type { NextConfig } from "next";

/**
 * Weaver — Next.js config.
 * - Security headers + PWA service-worker headers (per Next.js PWA guide).
 * - remotePatterns: thumbnails come from Supabase storage; full-res hotlinks
 *   from platform CDNs (§5). Placeholder data uses picsum during Phase 0.
 */
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" }, // cached thumbnails (§5.1)
      { protocol: "https", hostname: "i.pinimg.com" }, // Pinterest CDN full-res (§5.2)
      { protocol: "https", hostname: "picsum.photos" }, // Phase 0 placeholder only
      // Discovery candidates are hotlinked, not cached (discovery §10.1).
      { protocol: "https", hostname: "images.are.na" }, // Are.na display images
      { protocol: "https", hostname: "*.cloudfront.net" }, // Are.na originals
      { protocol: "https", hostname: "i.redd.it" },
      { protocol: "https", hostname: "preview.redd.it" },
      { protocol: "https", hostname: "external-preview.redd.it" },
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
