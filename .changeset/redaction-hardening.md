---
'@vskstudio/takt-core': minor
---

Route redaction and path exclusion hardening.

- `takt.auto.js` accepts `data-redact-routes`. Its pageview, `404`, `Outbound Link: Click` and `File Download` events apply the patterns to the path. The `404` path goes through the same redaction as `enable404()`. The pageview and the referrer of the base `takt.js` are unchanged, and `takt.js` stays under 1 kB gzip.
- `enableOutbound()`, `enableFiles()`, and the `Outbound Link: Click` and `File Download` events of `takt.auto.js` apply `redactRoutes` to the destination path, whatever the host. Previously the destination path was sent as is. Download links on another domain are now redacted too.
- `routeTemplates`: the `404` path uses the route template of the current page when the resolver returns one. When it returns nothing, the fallback is unchanged.
- Behaviour change: `exclude` matches case-insensitively, ignores a trailing slash on the path, and matches the percent-decoded path. For example, `exclude: ['/blog']` now also blocks `/Blog/post` and `/%62log`, which it did not block before. Check your entries if a path that differs only by case must stay tracked.
- The server client (`@vskstudio/takt-core/server`) refuses an `http://` endpoint outside `localhost`, `127.0.0.1` and `[::1]` at construction. Setups that sent events to a plain `http://` internal host must switch to `https://`.
