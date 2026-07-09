/**
 * Fallback for the `@modal` slot when no route is intercepted (initial load,
 * hard refresh, or after the modal closes). Rendering `null` keeps the slot
 * empty so only the feed (`children`) shows. See app/layout for how the slot is
 * mounted, and @modal/(.)item/[id] for the intercepted detail overlay.
 */
export default function ModalDefault() {
  return null;
}
