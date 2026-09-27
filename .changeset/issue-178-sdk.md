---
'@vskstudio/takt-core': minor
---

`scrubUrl` now also rewrites the `url` prop of outbound-link and file-download events. `optOut()`, `optIn()` and the new `isOptedOut()` work without an instance, and instances expose `isOptedOut()`. New `@vskstudio/takt-core/server` entry with `createServerTakt()` for server-side pageviews and events.
