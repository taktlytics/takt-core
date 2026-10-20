# @vskstudio/takt-core

## 0.12.2

### Patch Changes

- cd9bc57: The default list of tracked download extensions is now a single list shared by the SDK (`enableFiles()`) and `takt.auto.js`: 19 extensions, `pdf, xlsx, docx, pptx, csv, zip, gz, rar, 7z, dmg, exe, apk, mp3, mp4, wav, mov, avi, mkv, txt`. `exe`, `apk`, `mkv` and `txt` are now tracked by the SDK, which did not track them. `doc` and `ppt` are no longer tracked by default, as on `takt.auto.js`; pass them to `enableFiles()` to keep tracking them. A test fails if the two entry points diverge.

## 0.12.1

### Patch Changes

- a7edd30: Route template mode no longer leaks real paths through downloads, 404 pages, pageview URLs and referrers. A route the resolver does not know is sent with its `redactRoutes` pattern when one covers it, and as `/[redacted]` otherwise, so the pageview `url` and the 404 path never carry the real path. Every file download is sent as `/[redacted]` on any host, since its path can carry a token and the resolver describes the page, not the link. An outbound link whose host is the page's host written with a trailing dot is masked the same way. Every referrer is reduced to its origin whatever its host, so a referrer from another host of the same site no longer keeps its path, and an external referrer loses its path too. Outbound links to another host and everything outside template mode are unchanged.

## 0.12.0

### Minor Changes

- 085ff57: Route redaction matches paths case-insensitively, decodes them repeatedly (up to five changes), normalizes dot segments and repeated slashes, ignores matrix parameters, and accepts the brace syntax of takt-core-php (`{param}`, `{param?}`, `{param<regex>}`). A `<regex>` constraint must follow a restricted grammar: printable ASCII only, literals, `.` (any byte but `/`), `\d \D \w \W \s \S` (`\s` and `\S` ASCII-only), matching on the UTF-8 bytes of the segment as PCRE without `u` does, classes with a strict `-` and no empty class, alternation at the top level, `*` `+` `?` `{n}` `{n,}` `{n,m}` (n ≤ m ≤ 100) with at most two variable quantifiers per route and per segment, at most 100 characters, and no range spanning `/`. A route is also unusable when the sum over its segments of (variable quantifiers minus one) exceeds 1, or when it has more than one catch-all segment, so that matching cost stays bounded. A constraint outside it masks every matching path as `/[redacted]`, and a constrained segment over 256 UTF-8 bytes does too. A path that cannot be decoded is masked as `/[redacted]` when a route is configured. The new `redactUndecodablePaths: false` option (`data-redact-undecodable-paths="false"` on `takt.auto.js`) decodes it leniently instead, as takt-core-php does: an invalid escape stays as written and the path is still matched. A path still encoded after five decoding passes is always masked. When a path is masked, its query string and fragment are dropped too.

  Breaking change for `@vskstudio/takt-core/server`: `createServerTakt` now refuses `http://` endpoints on every host, `localhost`, `127.0.0.1` and `[::1]` included. Use `https://` (for local development, a local https certificate).

## 0.11.2

### Patch Changes

- Published to npm through Trusted Publishing (OIDC) instead of a long-lived token. No runtime change.

## 0.11.1

### Patch Changes

- ab7a798: Private helpers of the tracker instance follow the underscore convention, so tools that list the public surface of an instance no longer see them.

## 0.11.0

### Minor Changes

- 926d7b7: Route redaction and path exclusion hardening.

  - `takt.auto.js` accepts `data-redact-routes`. Its pageview, `404`, `Outbound Link: Click` and `File Download` events apply the patterns to the path. The `404` path goes through the same redaction as `enable404()`. The pageview and the referrer of the base `takt.js` are unchanged, and `takt.js` stays around 1 kB gzip.
  - `enableOutbound()`, `enableFiles()`, and the `Outbound Link: Click` and `File Download` events of `takt.auto.js` apply `redactRoutes` to the destination path, whatever the host. Previously the destination path was sent as is. Download links on another domain are now redacted too.
  - `routeTemplates`: the `404` path uses the route template of the current page when the resolver returns one. When it returns nothing, the fallback is unchanged.
  - Behaviour change: `exclude` matches case-insensitively, ignores a trailing slash on the path, and matches the percent-decoded path, segment by segment. For example, `exclude: ['/blog']` now also blocks `/Blog/post` and `/%62log`, which it did not block before. Check your entries if a path that differs only by case must stay tracked.
  - Route patterns and `exclude` decode percent-encoding the same way: an encoded slash (`%2F`) is decoded, so `/invoices%2F991` matches `/invoices/[id]`. A malformed segment is kept as is without disabling the decoding of the other segments.
  - Loading `takt.js` and `takt.auto.js` on the same page shares one installation: pageviews and history patches are never duplicated, in either order. A second `takt.auto.js` is ignored. Redaction set by `takt.auto.js` applies to later navigation; the pageview already sent by a `takt.js` loaded before it is not redacted.
  - The server client (`@vskstudio/takt-core/server`) refuses an `http://` endpoint outside `localhost`, `127.0.0.1` and `[::1]` at construction. Setups that sent events to a plain `http://` internal host must switch to `https://`.

## 0.10.1

### Patch Changes

- `enable404()` and the `notFound` option now pass the `path` prop through `scrubUrl` after `redactRoutes`, like the outbound-link and file-download events. A custom scrubber is applied to the 404 path.

## 0.10.0

### Minor Changes

- 65c4b7d: Route redaction. `redactRoutes` replaces the real path of sensitive routes with their pattern (`/verify/[token]`) on page URLs, same-origin referrers, autocaptured links and 404 events. `routeTemplates: true` with a `routeTemplate` resolver sends every page as its route template. The server client accepts `redactRoutes` and a per-call `route`.

## 0.9.0

### Minor Changes

- 9804074: `scrubUrl` now also rewrites the `url` prop of outbound-link and file-download events. `optOut()`, `optIn()` and the new `isOptedOut()` work without an instance, and instances expose `isOptedOut()`. New `@vskstudio/takt-core/server` entry with `createServerTakt()` for server-side pageviews and events.

## 0.8.1

### Patch Changes

- f29e9ae: Harden `exclude`: normalize entries once (strip trailing slashes, drop empty strings) so `'/app/'` still excludes the bare `/app` and a stray `''` can never blanket-block every path.

## 0.8.0

### Minor Changes

- Add an `exclude` option (path-prefix allowlist) to the full SDK (`init()` / `createTakt()`): pages whose path matches an excluded prefix are never tracked. Segment-bounded (`/app` matches `/app` and `/app/…` but not `/application`) and checked at send time, so it holds across SPA navigation and covers pageviews and named events alike. The minimal CDN snippet stays within its ≤ 1 kB budget and does not carry this option.

## 0.7.0

### Minor Changes

- 06a4bc4: Honor the Global Privacy Control signal (`navigator.globalPrivacyControl`) alongside Do Not Track in the full SDK: when `respectDnt` is on (default), visitors sending GPC are never tracked. The minimal CDN snippet stays within its ≤ 1 kB budget and relies on server-side `Sec-GPC` enforcement (GPC browsers auto-send the header on the beacon).

## 0.6.0

### Minor Changes

- 64ad8d1: Default the ingest endpoint and the stats/widget host to the hosted Takt origin (`https://taktlytics.com`).

  `init({ domain })`, the `<script>` snippet, `createStats()`, `badgeUrl()` and `embedUrl()` now talk to the hosted service with no extra config. Previously they defaulted to a same-origin relative path, which 405s on static sites that have no `/api/event` backend.

  **Breaking for first-party proxies and custom hosts:** the old relative default is no longer implicit. To proxy events through your own origin (anti-adblock) pass `endpoint: '/api/event'` (or `data-endpoint="/api/event"`); `scriptOrigin`/`host` still override the default to point at a custom host.

## 0.5.1

### Patch Changes

- Harden outbound/download autocapture: the link protocol is now matched
  explicitly against `http:`/`https:` instead of the fragile
  `protocol.indexOf('http')` test, so only real web links are ever reported.

## 0.5.0

### Minor Changes

- 7953536: Advanced tracker options. Snippet gains data-enabled, data-respect-dnt,
  data-sample-rate, data-track-query and data-query-params. init() gains a
  `tagged` autocapture option (via the new Analytics.enableTagged()), making the
  SDK path a superset of the snippet.

## 0.3.1

### Patch Changes

- Harden the widget URL builders and stats client: `host` must now be empty (same-origin) or an absolute `http(s)://` origin. `javascript:`, `data:`, and protocol-relative (`//…`) values are rejected so they can never reach a widget `src` or a `fetch`. Also map non-JSON success bodies to `PublicApiError`. Exports the `normalizeHost` helper.

## 0.3.0

### Minor Changes

- Add server-rendered widget URL builders (`badgeUrl`, `embedUrl`) and an anonymous public stats client (`createStats` → summary/timeseries/realtime/breakdown), with `PublicApiError` and the associated widget/stats types. Framework-agnostic and tree-shakeable.

## 0.2.2

### Patch Changes

- TSDoc on the public API (`init`, `track`, `pageview`, `optOut`, `optIn`, `InitOptions`, `Config`) for IDE hover, plus package metadata (`author`, `engines.node`, `unpkg`/`jsdelivr` for the CDN snippet). No runtime change.

## 0.2.1

### Patch Changes

- Refresh package metadata and publish with a signed npm provenance attestation. Documents the snippet's intentional Do Not Track divergence from the full SDK (the inline snippet checks the standard `'1'` only to stay within the ≤1 kB budget). No runtime change.

## 0.2.0

### Minor Changes

- Privacy hardening and new features.

  - **URL scrubbing**: query string and hash are stripped from every URL (page, referrer, autocaptured link destinations) by default. Configurable via `trackQuery`, a `queryParams` allowlist, or a custom `scrubUrl` function.
  - **Input validation**: props are coerced to strings, capped (30 keys, 64-char keys, 1024-char values); revenue is dropped unless the amount and 3-letter currency are well-formed. Clamps warn once in the console.
  - **New options**: `enabled`, `debug`, and `sampleRate`.
  - **SPA**: `replaceState` and `hashchange` are now tracked in addition to `pushState`/`popstate`.
  - **Idempotent `init()`**: re-initialising disposes the previous instance's listeners.
  - **Autocapture**: `mailto:` / `tel:` and other non-http links are skipped; link destination URLs are scrubbed.
  - Expanded localhost/private-IP detection (`::1`, `0.0.0.0`).
  - Removed dead transport adapters.

## 0.1.1

### Patch Changes

- Publication via npm Trusted Publishing / token CI (pas de changement de code).

## 0.1.0

### Minor Changes

- c18348c: Première version publique de `@vskstudio/takt-core` : SDK d'analytics minimaliste et respectueux de la vie privée, en architecture hexagonale.

  - `createTakt(config)`: instance avec `track`, `pageview`, `optOut`/`optIn`, et `enableSpa`/`enableOutbound`/`enableFiles` qui renvoient des disposers.
  - Helpers top-level `init`/`track`/`pageview`/`optOut`/`optIn` sur une instance par défaut.
  - Snippet IIFE ≤ 1 kB gzip avec configuration `data-*`, file d'attente de bootstrap et `window.takt`.
  - Respect de l'opt-out, de Do Not Track, et exclusion localhost/IP privées par défaut.
