---
"@vskstudio/takt-core": patch
---

Fix `takt.auto.js` overwriting `window.takt`. The bundle assigned its exports to a `takt` global, so after loading the script `window.takt` became `{ runAuto }` and `takt('Event')` threw. Since 0.11.1, URL redaction is read from `window.takt`, so every event after the first pageview was also sent with an empty `u`, which ingest rejects. The bundle is now built from a dedicated entry that exports nothing, and the IIFE builds no longer set a `globalName`.
