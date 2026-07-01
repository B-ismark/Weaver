import { SiteHeader } from "./SiteHeader";
import { SearchBar } from "./SearchBar";
import { PrimaryNav } from "./PrimaryNav";

/**
 * The primary app header (wordmark + centered search + nav), shared verbatim by
 * the home feed and the item detail view. Rendering the SAME header on both,
 * combined with the anchored `site-header` view-transition name (globals.css),
 * keeps the nav perfectly still during the tile→detail morph so the image is the
 * only thing that moves.
 */
export function AppHeader() {
  return (
    <SiteHeader>
      <div className="hidden flex-1 justify-center sm:flex">
        <SearchBar />
      </div>
      <PrimaryNav />
    </SiteHeader>
  );
}
