---
"@vskstudio/takt-core": minor
---

Route redaction matches paths case-insensitively, decodes them repeatedly (up to five changes), normalizes dot segments and repeated slashes, ignores matrix parameters, and accepts the brace syntax of takt-core-php (`{param}`, `{param?}`, `{param<regex>}`), the same way takt-core-php does. A path that cannot be decoded is masked as `/[redacted]` when a route is configured, unless the new `redactUndecodablePaths: false` option (`data-redact-undecodable-paths="false"` on `takt.auto.js`) keeps it raw. When a path is masked, its query string and fragment are dropped too.

Breaking change for `@vskstudio/takt-core/server`: `createServerTakt` now refuses `http://` endpoints on every host, `localhost`, `127.0.0.1` and `[::1]` included. Use `https://` (for local development, a local https certificate).
