/**
 * Shared "weave" micro-interactions for taste actions, so the feed tile action
 * bar (TileActionBar) and the detail view (ItemActions) feel identical:
 *   - pop        → springy scale on the tapped icon.
 *   - silkBurst  → gold silk threads radiate from a button (the "capture" on save).
 *   - snip       → the two scissor arms close, severing the thread (on hide).
 *
 * Built on the Web Animations API (no lib). ALL motion is gated on
 * prefers-reduced-motion — callers still perform the state/colour change, so the
 * action is never motion-dependent (a11y).
 */
const SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)"; // overshoot → springy pop

export function reduceMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/** Springy press-pop on an icon. */
export function pop(el: Element | null) {
  if (!el || reduceMotion()) return;
  el.animate(
    [{ transform: "scale(1)" }, { transform: "scale(1.35)" }, { transform: "scale(1)" }],
    { duration: 360, easing: SPRING }
  );
}

/**
 * Silk threads radiating from a button — the "capture" burst on save. The host
 * must be positioned (relative) with visible overflow so the strands escape it.
 */
export function silkBurst(host: HTMLElement | null) {
  if (!host || reduceMotion()) return;
  const N = 9;
  const rect = host.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * Math.PI * 2 + (Math.PI / N) * 0.5;
    const strand = document.createElement("span");
    strand.style.cssText = `position:absolute;left:${cx}px;top:${cy}px;width:2px;height:2px;border-radius:1px;background:#c9a227;pointer-events:none;transform-origin:center;will-change:transform,opacity;`;
    host.appendChild(strand);
    const dist = 16 + Math.random() * 8;
    strand.animate(
      [
        { transform: `rotate(${ang}rad) scaleY(1) translateY(0)`, opacity: 0.95 },
        { transform: `rotate(${ang}rad) scaleY(9) translateY(-${dist}px)`, opacity: 0 },
      ],
      { duration: 420, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)" }
    ).onfinish = () => strand.remove();
  }
}

/**
 * Snip: the two scissor arms pivot about the rivet (12,12 in the icon's viewBox)
 * and close toward each other twice, like blades cutting a thread. Each arm is a
 * <g> with transform-box:view-box so the rotation origin is in icon coordinates.
 */
export function snip(armA: SVGGElement | null, armB: SVGGElement | null) {
  if (reduceMotion()) return;
  const close = 15;
  const opts = { duration: 440, easing: "ease-in-out" } as const;
  armA?.animate(
    [
      { transform: "rotate(0deg)" },
      { transform: `rotate(-${close}deg)` },
      { transform: "rotate(0deg)" },
      { transform: `rotate(-${close}deg)` },
      { transform: "rotate(0deg)" },
    ],
    opts
  );
  armB?.animate(
    [
      { transform: "rotate(0deg)" },
      { transform: `rotate(${close}deg)` },
      { transform: "rotate(0deg)" },
      { transform: `rotate(${close}deg)` },
      { transform: "rotate(0deg)" },
    ],
    opts
  );
}
