// happy-dom provides full browser API emulation (localStorage, window, etc.)
// so no manual stubs are needed here. This file is kept as a hook point
// for future global test setup (e.g. pinia, i18n bootstrapping).

// Component tests do not run the `nubiscoUI()` Vite plugin, so from
// @nubisco/ui 4.0.0 a mounted component that renders an icon or a flag has
// nothing to resolve the name against and fails where the app is fine.
// Test bundles are not shipped, so the full catalogues cost nothing here.
import '@nubisco/ui/icons/all'
import '@nubisco/ui/flags/all'
