---
"@vskstudio/takt-core": patch
---

Route template mode no longer leaks real paths through downloads and referrers. A file download on the page's host is sent as `/[redacted]` instead of its real path, since the resolver describes the page and cannot name the link, and every referrer is reduced to its origin whatever its host, so a referrer from another host of the same site no longer keeps its path. External referrers lose their path in this mode too. Outside template mode, nothing changes.
