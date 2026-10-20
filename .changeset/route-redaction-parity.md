---
"@vskstudio/takt-core": patch
---

Route redaction matches the paths the same way as the PHP SDK: case-insensitive, decoded repeatedly, dot segments and repeated slashes normalized, matrix parameters ignored. A path that cannot be decoded is masked as `/[redacted]` when a route is configured. When a path is masked, its query string and fragment are dropped too.
