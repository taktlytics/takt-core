---
"@vskstudio/takt-core": patch
---

Route redaction matches paths case-insensitively, decodes them repeatedly (up to five changes), normalizes dot segments and repeated slashes, and ignores matrix parameters, the same way takt-core-php does. One difference: a path that cannot be decoded is masked as `/[redacted]` when a route is configured, while the PHP SDK keeps it raw. When a path is masked, its query string and fragment are dropped too.
