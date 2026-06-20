// Generate Weaver PWA icons from a procedural orb-weaver web (brand motif).
// Renders SVG → PNG via sharp (already a dep). No design assets needed.
//
//   public/icons/icon-192.png           (purpose: any)
//   public/icons/icon-512.png           (purpose: any)
//   public/icons/icon-maskable-512.png  (purpose: maskable — web in safe zone)
//   src/app/apple-icon.png              (iOS home screen, 180, auto-linked by Next)
//
// Usage: node scripts/gen-icons.mjs
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const BG = "#0a0a0a"; // matches manifest background/theme
const STROKE = "#e7e2d6"; // warm off-white silk
const ACCENT = "#c9a227"; // subtle gold hub

const VB = 512; // svg viewbox
const c = VB / 2;
const RADIALS = 12;
const RINGS = 6;
const round = (n) => Math.round(n * 100) / 100;

/**
 * Build the web SVG. `coverage` = web radius as a fraction of half-size, so the
 * maskable variant can pull the art into the safe zone (≈0.55) while the normal
 * icon fills more (≈0.82).
 */
function webSvg(coverage) {
  const R = c * coverage;
  const angles = Array.from({ length: RADIALS }, (_, i) => (i / RADIALS) * Math.PI * 2 - Math.PI / 2);
  const pt = (ang, r) => [round(c + Math.cos(ang) * r), round(c + Math.sin(ang) * r)];

  const radials = angles
    .map((a) => {
      const [x, y] = pt(a, R);
      return `<line x1="${c}" y1="${c}" x2="${x}" y2="${y}" />`;
    })
    .join("");

  // Concentric capture rings: straight silk segments between adjacent radials,
  // with a slight sag (quadratic curve dipping toward the hub) for realism.
  const rings = Array.from({ length: RINGS }, (_, k) => {
    const r = R * ((k + 1) / (RINGS + 0.3));
    const segs = angles
      .map((a, i) => {
        const a2 = angles[(i + 1) % RADIALS];
        const [x1, y1] = pt(a, r);
        const [x2, y2] = pt(a2, r);
        // Sag: control point = endpoint midpoint pulled toward the hub. Derived
        // from coords (not angle average) so the wrap-around segment is correct.
        const mx = round(c + ((x1 + x2) / 2 - c) * 0.9);
        const my = round(c + ((y1 + y2) / 2 - c) * 0.9);
        return `<path d="M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}" />`;
      })
      .join("");
    return segs;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${VB}" height="${VB}" viewBox="0 0 ${VB} ${VB}">
  <rect width="${VB}" height="${VB}" fill="${BG}"/>
  <g fill="none" stroke="${STROKE}" stroke-width="2.4" stroke-linecap="round" opacity="0.9">
    ${radials}
  </g>
  <g fill="none" stroke="${STROKE}" stroke-width="1.8" stroke-linejoin="round" opacity="0.72">
    ${rings}
  </g>
  <circle cx="${c}" cy="${c}" r="6" fill="${ACCENT}"/>
</svg>`;
}

async function png(svg, size) {
  return sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
}

await mkdir(new URL("../public/icons/", import.meta.url), { recursive: true });
const out = (p) => new URL(p, import.meta.url);

const normal = webSvg(0.82);
const maskable = webSvg(0.55); // safe zone: keep art within central ~60%

await writeFile(out("../public/icons/icon-192.png"), await png(normal, 192));
await writeFile(out("../public/icons/icon-512.png"), await png(normal, 512));
await writeFile(out("../public/icons/icon-maskable-512.png"), await png(maskable, 512));
await writeFile(out("../src/app/apple-icon.png"), await png(normal, 180));

console.log("wrote icon-192, icon-512, icon-maskable-512, apple-icon");
