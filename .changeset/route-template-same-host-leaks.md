---
"@vskstudio/takt-core": patch
---

Route template mode no longer leaks real paths through downloads, 404 pages, pageview URLs and referrers. A route the resolver does not know is sent with its `redactRoutes` pattern when one covers it, and as `/[redacted]` otherwise, so the pageview `url` and the 404 path never carry the real path. Every file download is sent as `/[redacted]` on any host, since its path can carry a token and the resolver describes the page, not the link. An outbound link whose host is the page's host written with a trailing dot is masked the same way. Every referrer is reduced to its origin whatever its host, so a referrer from another host of the same site no longer keeps its path, and an external referrer loses its path too. Outbound links to another host and everything outside template mode are unchanged.
