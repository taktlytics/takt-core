<div align="center">

# @vskstudio/takt-core


> 📚 **Documentation**: [taktlytics.com/docs/wrappers/core](https://taktlytics.com/docs/wrappers/core)

**Tiny, privacy-friendly analytics SDK for Takt.**

[![npm version](https://img.shields.io/npm/v/@vskstudio/takt-core?color=2563eb&logo=npm)](https://www.npmjs.com/package/@vskstudio/takt-core)
[![snippet size](https://img.shields.io/badge/snippet-~1%20kB%20gzip-2563eb)](https://www.npmjs.com/package/@vskstudio/takt-core)
[![zero deps](https://img.shields.io/badge/dependencies-0-2563eb)](./package.json)
[![license](https://img.shields.io/npm/l/@vskstudio/takt-core?color=2563eb)](./LICENSE)

</div>

---

- **Zero dependencies**, tree-shakeable ESM module.
- **~1 kB gzip** drop-in snippet. No build step required.
- **Privacy first**: honours opt-out and Do Not Track, strips query strings, and excludes localhost / private IPs by default.
- **Hexagonal core**: a pure domain wrapped in ports & adapters. It is easy to test and easy to extend.

## Snippet (no build step)

```html
<script defer src="https://cdn.jsdelivr.net/npm/@vskstudio/takt-core/dist/takt.js" data-domain="example.com"></script>
```

> Pin a version in production, e.g. `@vskstudio/takt-core@0.5.0`. jsDelivr and unpkg both serve the snippet straight from npm. No extra hosting is required.

Then, anywhere on the page:

```js
window.takt('Signup', { props: { plan: 'pro' } })
```

Calls made before the script finishes loading are queued and replayed. Install a tiny stub first if you need that:

```html
<script>
  window.takt = window.takt || function () { (window.takt.q = window.takt.q || []).push(arguments) }
</script>
```

### `data-*` options

| Attribute | Effect | Default |
| --- | --- | --- |
| `data-domain` | Site identifier sent with every event | `location.hostname` |
| `data-script-origin` | First-party origin to derive the endpoint from (`{origin}/api/event`): a custom domain you proxy through to dodge ad-blockers | hosted Takt origin |
| `data-endpoint` | Ingestion endpoint (wins over `data-script-origin`); set `/api/event` for a same-origin first-party proxy | `https://taktlytics.com/api/event` |
| `data-exclude-localhost="false"` | Track localhost / private IPs | excluded |
| `data-enabled="false"` | Kill-switch: the tracker does nothing | enabled |
| `data-respect-dnt="false"` | Opt out of the Do Not Track short-circuit | respected |
| `data-sample-rate="0.5"` | Send only this fraction (0 to 1) of events | `1` (all) |
| `data-track-query` | Keep the full query string and hash (default strips both) | stripped |
| `data-query-params="utm_source,utm_medium"` | Keep only these query params | none |

The base snippet stays around **1 kB gzip**: pageviews, SPA navigation, `window.takt()`, and the privacy guards: nothing more. It respects Do Not Track and strips the query string and hash from URLs by default; the attributes above tune both. For a custom scrubber function, use the npm build (`scrubUrl` below).

The base snippet has neither `exclude` nor `redactRoutes`: its pageviews send the real path of every page, including `/verify/abc123`. Use the npm SDK when a route must never reach analytics. Browsers that send `Sec-GPC: 1` (Global Privacy Control) are still honoured: the ingest drops their events.

### Auto extensions: `takt.auto.js`

Need outbound clicks, file downloads, HTML-declared events, or 404 detection without writing code? Swap `takt.js` for the opt-in `takt.auto.js` bundle and list what you want in `data-auto`:

```html
<script defer
  src="https://cdn.jsdelivr.net/npm/@vskstudio/takt-core/dist/takt.auto.js"
  data-domain="example.com"
  data-auto="outbound,downloads,tagged,404"></script>
```

Without `data-auto`, `takt.auto.js` behaves exactly like `takt.js`. Each extension is opt-in. Loading the tracker twice is safe: `takt.js` and `takt.auto.js` on the same page share one installation, so pageviews are never sent twice. Loading `takt.auto.js` after `takt.js` adds its extensions and its redaction to the existing tracker, and a second `takt.auto.js` is ignored.

| `data-auto` value | Event sent | Property |
| --- | --- | --- |
| `outbound` | `Outbound Link: Click` | `url` |
| `downloads` | `File Download` | `url` |
| `404` | `404` | `path` |
| `tagged` | custom (`data-takt-event`) | from `data-takt-prop-*` |

- **downloads** default extensions: `pdf, xlsx, docx, pptx, csv, zip, gz, rar, 7z, dmg, exe, apk, mp3, mp4, wav, mov, avi, mkv, txt`. Override with `data-downloads-ext="pdf,csv,epub"`.
- **tagged**: add `data-takt-event="Cta"` to any clickable element; `data-takt-prop-<key>` attributes become props (empty keys/values are ignored). The reserved name `pageview` is refused. Identical to `init({ tagged: true })` on the SDK.
- **404**: detected at load via the Navigation Timing API, or by adding `data-takt-404` to `<body>` / a `<meta name="takt:404">` tag on server-rendered error pages.
- **data-redact-routes**: comma-separated route patterns (`data-redact-routes="/reset/[token],/verify/[token]"`), same syntax as `redactRoutes`. Applied to the pageview and SPA navigation path, the `404` path, and the `Outbound Link: Click` and `File Download` destinations (matched on their path, whatever the host). The base `takt.js` alone has no redaction: a route with a secret in its path needs `takt.auto.js` with this attribute, or the npm SDK's `redactRoutes`. When `takt.js` is loaded first, the pageview it already sent is not redacted; only navigation after `takt.auto.js` runs is masked, so load `takt.auto.js` alone on pages that carry a secret route.
- **data-redact-undecodable-paths**: only the literal `"false"` decodes a path that cannot be decoded leniently (invalid escapes kept) and matches it, instead of sending `/[redacted]`. Any other value, or no attribute, keeps the masking (default: masked when a route is configured). See [Route redaction](#route-redaction).

## npm

```bash
pnpm add @vskstudio/takt-core
```

### Quick start: default instance

```ts
import { init, track, pageview } from '@vskstudio/takt-core'

init({ domain: 'example.com', outbound: true, files: true, notFound: true })

track('Signup', {
  props: { plan: 'pro' },
  revenue: { amount: '29.00', currency: 'EUR' },
})
```

`init()` creates a single shared instance, fires an automatic pageview, and wires SPA navigation. `track` and `pageview` delegate to it. `optOut`, `optIn`, and `isOptedOut` work with or without it (see [Privacy](#privacy)).

The autocapture toggles `outbound`, `files`, `notFound`, and `tagged` opt into the same extensions as the snippet's `data-auto`: outbound-link clicks, file downloads, 404 detection, and `data-takt-event` custom events. `tagged: true` tracks clicks on elements carrying `data-takt-event` (with `data-takt-prop-*` becoming props), matching `data-auto=tagged`.

### Instance API: `createTakt`

For full control (multiple instances, no globals, explicit teardown), construct an instance directly:

```ts
import { createTakt } from '@vskstudio/takt-core'

const takt = createTakt({ domain: 'example.com' })

takt.pageview()
takt.track('Signup', { props: { plan: 'pro' } })

// Each enableX returns a disposer for teardown.
const stopSpa = takt.enableSpa()
const stopOutbound = takt.enableOutbound()
const stopFiles = takt.enableFiles(['pdf', 'zip', 'csv'])
const stop404 = takt.enable404() // detects a 404 page once and reports it
const stopTagged = takt.enableTagged() // custom events from data-takt-event

// later…
stopSpa()
stopOutbound()
stopFiles()
stop404()
stopTagged()
```

`createTakt()` is a pure factory (no side effects until you call a method), so it tree-shakes cleanly.

### Configuration

`init()` and `createTakt()` accept the same options:

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `domain` | `string` | `location.hostname` | Site identifier sent with every event |
| `scriptOrigin` | `string` | hosted Takt origin | First-party origin to derive the endpoint from (`{origin}/api/event`): a custom domain you proxy through to dodge ad-blockers |
| `endpoint` | `string` | `https://taktlytics.com/api/event` | Ingestion endpoint (wins over `scriptOrigin`); set `/api/event` for a same-origin first-party proxy |
| `enabled` | `boolean` | `true` | Master switch: when `false`, nothing is sent |
| `debug` | `boolean` | `false` | Log each payload to the console before sending |
| `sampleRate` | `number` | `1` | Keep this fraction of events (e.g. `0.25` ≈ 25%) |
| `respectDnt` | `boolean` | `true` | Suppress events when Do Not Track is on |
| `excludeLocalhost` | `boolean` | `true` | Suppress events on localhost / private IPs |
| `exclude` | `string[]` | none | Path prefixes never tracked (e.g. `['/app', '/account']`). Segment-bounded: `/app` matches `/app` and `/app/…` but not `/application`. Case-insensitive, blind to a trailing slash (`/App/` excludes `/app`) and to percent-encoding, segment by segment (`/%61dmin` excludes `/admin`; a malformed segment such as `%ZZ` is kept as is, and the other segments are still decoded). Checked at send time, so it holds across SPA navigation |
| `trackQuery` | `boolean` | `false` | Keep the full query string and hash on URLs |
| `queryParams` | `string[]` | — | Allowlist: keep only these query params, drop the rest |
| `scrubUrl` | `(url: string) => string` | — | Custom scrubber; overrides `trackQuery` / `queryParams`. Also applied to the `url` prop of outbound-link and file-download events |
| `redactRoutes` | `string[]` | — | Route patterns whose real path is replaced by the pattern (e.g. `['/verify/[token]']` sends `/verify/[token]`). See [Route redaction](#route-redaction) |
| `redactUndecodablePaths` | `boolean` | `true` | When a route is configured, a path that cannot be decoded is sent as `/[redacted]`; `false` decodes it leniently and matches it, as takt-core-php does |
| `routeTemplates` | `boolean` | `false` | Send every URL as its route template instead of the real path. Needs a `routeTemplate` resolver; the framework wrappers provide one |
| `routeTemplate` | `() => string \| null` | — | Returns the current route template (`/blog/[slug]`, `/users/:id`). Used when `routeTemplates` is on |

### Privacy

By default the query string and hash are stripped from every URL (page, referrer, and autocaptured link destinations) before sending. Secrets in `?token=…` or `#access_token=…` never leave the browser. Opt back in with `trackQuery: true`, narrow it with a `queryParams` allowlist, or take full control with `scrubUrl`. Props and revenue are sanitized too: props are coerced to strings, capped (30 keys, 64-char keys, 1024-char values), and revenue is dropped unless the amount and 3-letter currency are well-formed.

```ts
import { optOut, optIn, isOptedOut } from '@vskstudio/takt-core'

optOut()      // sets localStorage `takt_ignore` = '1'; no events are sent
optIn()       // resumes tracking
isOptedOut()  // true after optOut(), e.g. to render an opt-out toggle
```

These three functions need no instance: call them before `init()` (a consent banner rendered first) and every instance created later honours the choice. An instance from `createTakt()` exposes the same `optOut()`, `optIn()`, and `isOptedOut()` methods over the same stored state.

Events are suppressed, in order, when: the visitor has opted out, **or** Do Not Track is enabled (`respectDnt`), **or** the host is localhost / a private IP (`excludeLocalhost`), **or** the path matches an `exclude` prefix, **or** the event is dropped by `sampleRate`.

### Route redaction

Query strings are stripped by default, but path segments are sent as they are: `/verify/abc123` leaks the token. Two opt-in options replace real paths with route templates.

```ts
createTakt({ redactRoutes: ['/verify/[token]', '/reset/:code', '/invoices/[id].pdf'] })
```

`redactRoutes` lists the sensitive routes. A matching path is sent as the pattern (`/verify/[token]`), every other path keeps its real value, so per-page stats stay intact. Patterns accept SvelteKit / Astro / Next syntax (`[param]`, `[[optional]]`, `[...rest]`, `(group)`), Vue / React / Angular / Solid syntax (`:param`, `:param?`, `*`, `**`) and the Laravel / Symfony braces of the PHP SDK (`{param}`, `{param?}`, `{param<regex>}`). A brace parameter matches one segment whatever the `<regex>` says, exactly as the PHP SDK does: the constraint is parsed but not enforced. The rule covers the page URL, same-origin referrers, outbound link destinations and download links (matched on their path, whatever the host), and 404 paths.

Matching is case-insensitive: `/Orders/123` matches `/orders/[id]`.

The path is decoded again and again until it stops changing, with at most five changes, so `/orders%252F123` also matches `/orders/[id]`. Each decoded form is compared. Dot segments (`.` and `..`, encoded or not) are resolved as RFC 3986 specifies, repeated slashes are collapsed, and matrix parameters (`;a=1`) are dropped from each segment before the comparison.

A path that cannot be decoded (a malformed `%` escape or invalid UTF-8) is sent as `/[redacted]` when at least one route is configured, so the browser never sends a path it could not check. Without a route, such a path is sent unchanged. Set `redactUndecodablePaths: false` (or `data-redact-undecodable-paths="false"` on `takt.auto.js`) to decode it leniently instead, as takt-core-php does: an invalid escape stays as written and the path is still matched against the routes. A path that still changes after five decoding passes is masked as `/[redacted]` whatever the option.

When a path is masked, its query string and fragment are dropped with it, so a token in `?token=` never leaves the browser.

```ts
createTakt({ routeTemplates: true, routeTemplate: () => currentRoute.id })
```

`routeTemplates: true` sends every page as its route template: `/blog/hello` becomes `/blog/[slug]`. It suits fully private apps where no path is worth reading as is; on a public site it merges every article into one row. The core cannot know the router, so it needs a `routeTemplate` resolver, and the framework wrappers wire it for you. When a resolver returns nothing (no matched route), `redactRoutes` still applies and the real path is sent otherwise. This fallback is fail-open by design: a page the resolver cannot match, and no pattern covers, is sent with its real path. Outbound link destinations never use the resolver, since it describes the current page, not the link. Same-origin referrers are reduced to the site origin in this mode, since their template is unknown.

## Server-side events: `@vskstudio/takt-core/server`

Send pageviews and events from Node (visitors without JavaScript, crawlers, webhooks, queued jobs) with the same payload rules as the browser SDK:

```ts
import { createServerTakt } from '@vskstudio/takt-core/server'

const takt = createServerTakt({
  domain: 'example.com',
  apiKey: process.env.TAKT_API_KEY,
})

await takt.pageview({
  url: 'https://example.com/pricing',
  referrer: request.headers.get('referer') ?? undefined,
  visitor: { ip: clientIp, userAgent: request.headers.get('user-agent') ?? undefined },
})

await takt.event('Purchase', {
  props: { plan: 'pro' },
  revenue: { amount: '29.00', currency: 'EUR' },
})
```

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `domain` | `string` | required | Site identifier, must match the site of the API key |
| `apiKey` | `string` | — | Site API key with `events:write`, sent as `Authorization: Bearer` |
| `endpoint` / `scriptOrigin` | `string` | hosted Takt origin | Same resolution as `createTakt()`. Must be `https://`: any `http://` endpoint throws at construction, loopback included (breaking change: `localhost`, `127.0.0.1` and `[::1]` used to be accepted over http) |
| `trackQuery` / `queryParams` / `scrubUrl` | | query stripped | Same URL scrubbing as the browser SDK, applied to `url` and `referrer` |
| `redactRoutes` | `string[]` | — | Same route patterns as the browser SDK. A `route` passed to `pageview()` / `event()` replaces the path of that call |
| `redactUndecodablePaths` | `boolean` | `true` | Same option as the browser SDK |
| `strict` | `boolean` | `false` | Throw on network errors and non-`202` answers instead of swallowing them |
| `fetch` | `typeof fetch` | global `fetch` | Custom fetch implementation (Node 18+ ships one) |

Without a `url`, the event is attached to the site home (`https://{domain}/`), since the ingest rejects events without an absolute URL. `visitor.ip` is sent as `X-Forwarded-For` and `visitor.userAgent` as `User-Agent`. Because the request is authenticated by an `events:write` key, the ingest derives the visitor and country from that forwarded IP, not from the calling server's IP.

## Widgets & public stats

Besides tracking, the package ships framework-agnostic helpers for Takt's
server-rendered widgets and its public stats API. These are tree-shakeable and
re-exported by the framework wrappers (`@vskstudio/takt-react`, `-vue`, etc.).

```ts
import { badgeUrl, embedUrl, createStats } from '@vskstudio/takt-core'

// URL builders for the server-rendered badge SVG and embed iframe.
badgeUrl('example.com', { variant: 'd', glyph: 'off', lang: 'en' })
// → https://taktlytics.com/public/example.com/badge.svg?variant=d&glyph=off&lang=en
embedUrl('example.com', { theme: 'dark' })
// → https://taktlytics.com/embed/example.com?theme=dark

// Anonymous client for the public stats API. Pass `host` for a self-hosted Takt.
const stats = createStats({ host: 'https://takt.example.com', domain: 'example.com' })
await stats.summary(undefined, { period: '30d', compare: 'previous' })
await stats.timeseries()
await stats.realtime()
await stats.breakdown('page')
```

`host` defaults to the hosted Takt origin, matching the SDK's ingest default.
When set, it must be an absolute `http(s)://` origin. Anything else
(`javascript:`, `data:`, protocol-relative `//…`) is rejected, so a `host`
value can never smuggle a non-http scheme into a widget `src` or a `fetch`.
The value is reduced to its origin: any path, query, or fragment is dropped
(`https://takt.example.com/x?a=1` → `https://takt.example.com`).
Errors surface as `PublicApiError` (carrying the HTTP `status`).

## Wire payload contract

Every event is posted to the endpoint as a compact JSON object. The keys are frozen: the Takt backend ingestion depends on them:

| Key | Meaning |
| --- | --- |
| `n` | event name (`pageview` for pageviews) |
| `d` | domain |
| `u` | URL (query + hash stripped by default) |
| `r` | referrer (query + hash stripped by default) |
| `w` | viewport width |
| `p` | props (object, omitted if empty) |
| `$` | revenue `{ a: amount, c: currency }` (currency uppercased) |

## Architecture

`@vskstudio/takt-core` follows a hexagonal (ports & adapters) layout:

```
domain/          Pure business core, zero I/O. Value objects (EventName, Props,
                 Revenue, AnalyticsEvent), payload mapping, and the URL scrubber.
application/      Use cases: the Analytics service, the TrackingPolicy (consent +
                 sampling), and autocapture trackers, which depend only on small
                 single-method port interfaces.
infrastructure/   Driven adapters: a resilient fetch/beacon transport, localStorage
                 consent, and browser providers (DNT, environment, history, clicks).
composition/      createTakt() factory, the ESM entry, and the snippet adapter.
```

The domain never reaches outward; adapters are injected at the composition root (`createTakt`). This keeps the core testable with fakes and lets you swap transports or storage without touching business logic.

## License

MIT
