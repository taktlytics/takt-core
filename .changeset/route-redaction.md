---
'@vskstudio/takt-core': minor
---

Route redaction. `redactRoutes` replaces the real path of sensitive routes with their pattern (`/verify/[token]`) on page URLs, same-origin referrers, autocaptured links and 404 events. `routeTemplates: true` with a `routeTemplate` resolver sends every page as its route template. The server client accepts `redactRoutes` and a per-call `route`.
