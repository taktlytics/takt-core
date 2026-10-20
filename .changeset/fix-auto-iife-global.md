---
"@vskstudio/takt-core": patch
---

Fix `takt.auto.js` overwriting `window.takt`. Since 0.11.1 the bundle assigned its exports to a `takt` global, so after loading the script `window.takt` became `{ runAuto }`: `takt('Event')` threw and every event after the first pageview was sent with an empty `u`, which ingest rejects. The bundle is now built from a dedicated entry that exports nothing, and the IIFE builds no longer set a `globalName`.
