// Opt into React's canary type surface so `<ViewTransition>` (used for native
// route morphs, enabled via `experimental.viewTransition` in next.config) is
// typed. Next resolves `react` to its experimental build when that flag is on;
// this only affects types, not runtime.
/// <reference types="react/canary" />
