---
'@vskstudio/takt-core': minor
---

Route redaction and path exclusion hardening.

- `takt.auto.js` accepts `data-redact-routes`. Its `404`, `Outbound Link: Click` and same-origin `File Download` events apply the patterns, and the `404` path now goes through the same redaction as `enable404()`. The pageview of `takt.auto.js` is not redacted, as before.
- `enableOutbound()` and the `Outbound Link: Click` event of `takt.auto.js` apply `redactRoutes` to the destination path, whatever the host. Previously the destination path was sent as is.
- `routeTemplates`: the `404` path uses the route template of the current page when the resolver returns one. When it returns nothing, the fallback is unchanged.
- `exclude` matches case-insensitively and ignores a trailing slash on the path.
- The server client (`@vskstudio/takt-core/server`) refuses an `http://` endpoint outside `localhost`, `127.0.0.1` and `[::1]` at construction. Setups that sent events to a plain `http://` internal host must switch to `https://`.
- Packages are published with npm provenance.
