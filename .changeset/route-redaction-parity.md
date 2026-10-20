---
"@vskstudio/takt-core": minor
---

Route redaction matches paths case-insensitively, decodes them repeatedly (up to five changes), normalizes dot segments and repeated slashes, ignores matrix parameters, and accepts the brace syntax of takt-core-php (`{param}`, `{param?}`, `{param<regex>}`). A `<regex>` constraint is enforced on its own segment, anchored on the whole segment; a constraint the SDK cannot use (invalid, with `/`, `^`, `$`, backreferences, lookbehinds, nested quantifiers or over 100 characters) masks every matching path as `/[redacted]`. A path that cannot be decoded is masked as `/[redacted]` when a route is configured. The new `redactUndecodablePaths: false` option (`data-redact-undecodable-paths="false"` on `takt.auto.js`) decodes it leniently instead, as takt-core-php does: an invalid escape stays as written and the path is still matched. A path still encoded after five decoding passes is always masked. When a path is masked, its query string and fragment are dropped too.

Breaking change for `@vskstudio/takt-core/server`: `createServerTakt` now refuses `http://` endpoints on every host, `localhost`, `127.0.0.1` and `[::1]` included. Use `https://` (for local development, a local https certificate).
