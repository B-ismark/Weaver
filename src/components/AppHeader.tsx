import { SiteHeader } from "./SiteHeader";
import { SearchBar } from "./SearchBar";
import { PrimaryNav } from "./PrimaryNav";

/**
 * The primary app header (wordmark + centered search + nav), shared verbatim by
 * the home feed and the item detail view. Rendering the SAME header on both,
 * combined with the anchored `site-header` view-transition name (globals.css),
 * keeps the nav perfectly still during the tile→detail morph so the image is the
 * only thing that moves.
 *
 * `leading` drops a control (e.g. the detail-view Back button) at the far left,
 * inside the sticky bar — so it stays pinned to the top and is always reachable
 * while scrolling, instead of scrolling away in the page flow.
 */
export function AppHeader({ leading }: { leading?: React.ReactNode }) {
  return (
    <SiteHeader leading={leading}>
      <div className="hidden flex-1 justify-center sm:flex">
        <SearchBar />
      </div>
      <PrimaryNav />
    </SiteHeader>
  );
}
