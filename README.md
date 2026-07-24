<div align="center">

# @vskstudio/takt-core


> 📚 **Documentation** — [taktlytics.com/docs/wrappers/core](https://taktlytics.com/docs/wrappers/core)
**Tiny, privacy-friendly analytics SDK for Takt.**

[![npm version](https://img.shields.io/npm/v/@vskstudio/takt-core?color=2563eb&logo=npm)](https://www.npmjs.com/package/@vskstudio/takt-core)
[![snippet size](https://img.shields.io/badge/snippet-%E2%89%A41%20kB%20gzip-2563eb)](https://www.npmjs.com/package/@vskstudio/takt-core)
[![zero deps](https://img.shields.io/badge/dependencies-0-2563eb)](./package.json)
[![license](https://img.shields.io/npm/l/@vskstudio/takt-core?color=2563eb)](./LICENSE)

</div>

---

- **Zero dependencies**, tree-shakeable ESM module.
- **≤ 1 kB gzip** drop-in snippet — no build step required.
- **Privacy first**: honours opt-out and Do Not Track, strips query strings, and excludes localhost / private IPs by default.
- **Hexagonal core**: a pure domain wrapped in ports & adapters — easy to test, easy to extend.

## Snippet (no build step)

```html
<script defer src="https://cdn.jsdelivr.net/npm/@vskstudio/takt-core/dist/takt.js" data-domain="example.com"></script>
```

> Pin a version in production, e.g. `@vskstudio/takt-core@0.5.0`. jsDelivr and unpkg both serve the snippet straight from npm — no extra hosting required.

Then, anywhere on the page:

```js
window.takt('Signup', { props: { plan: 'pro' } })
```

Calls made before the script finishes loading are queued and replayed — install a tiny stub first if you need that:

```html
<script>
  window.takt = window.takt || function () { (window.takt.q = window.takt.q || []).push(arguments) }
</script>
```

### `data-*` options

| Attribute | Effect | Default |
| --- | --- | --- |
| `data-domain` | Site identifier sent with every event | `location.hostname` |
| `data-script-origin` | First-party origin to derive the endpoint from (`{origin}/api/event`) — a custom domain you proxy through to dodge ad-blockers | hosted Takt origin |
| `data-endpoint` | Ingestion endpoint (wins over `data-script-origin`); set `/api/event` for a same-origin first-party proxy | `https://taktlytics.com/api/event` |
| `data-exclude-localhost="false"` | Track localhost / private IPs | excluded |
| `data-enabled="false"` | Kill-switch — the tracker does nothing | enabled |
| `data-respect-dnt="false"` | Opt out of the Do Not Track short-circuit | respected |
| `data-sample-rate="0.5"` | Send only this fraction (0–1) of events | `1` (all) |
| `data-track-query` | Keep the full query string and hash (default strips both) | stripped |
| `data-query-params="utm_source,utm_medium"` | Keep only these query params | none |

The base snippet stays under **1 kB gzip**: pageviews, SPA navigation, `window.takt()`, and the privacy guards — nothing more. It respects Do Not Track and strips the query string and hash from URLs by default; the attributes above tune both. For a custom scrubber function, use the npm build (`scrubUrl` below).

### Auto extensions — `takt.auto.js`

Need outbound clicks, file downloads, HTML-declared events, or 404 detection without writing code? Swap `takt.js` for the opt-in `takt.auto.js` bundle and list what you want in `data-auto`:

```html
<script defer
  src="https://cdn.jsdelivr.net/npm/@vskstudio/takt-core/dist/takt.auto.js"
  data-domain="example.com"
  data-auto="outbound,downloads,tagged,404"></script>
```

Without `data-auto`, `takt.auto.js` behaves exactly like `takt.js`. Each extension is opt-in.

| `data-auto` value | Event sent | Property |
| --- | --- | --- |
| `outbound` | `Outbound Link: Click` | `url` |
| `downloads` | `File Download` | `url` |
| `404` | `404` | `path` |
| `tagged` | custom (`data-takt-event`) | from `data-takt-prop-*` |

- **downloads** default extensions: `pdf, xlsx, docx, pptx, csv, zip, gz, rar, 7z, dmg, exe, apk, mp3, mp4, wav, mov, avi, mkv, txt` — override with `data-downloads-ext="pdf,csv,epub"`.
- **tagged**: add `data-takt-event="Cta"` to any clickable element; `data-takt-prop-<key>` attributes become props (empty keys/values are ignored). The reserved name `pageview` is refused. Identical to `init({ tagged: true })` on the SDK.
- **404**: detected at load via the Navigation Timing API, or by adding `data-takt-404` to `<body>` / a `<meta name="takt:404">` tag on server-rendered error pages.

## npm

```bash
pnpm add @vskstudio/takt-core
```

### Quick start — default instance

```ts
import { init, track, pageview } from '@vskstudio/takt-core'

init({ domain: 'example.com', outbound: true, files: true, notFound: true })

track('Signup', {
  props: { plan: 'pro' },
  revenue: { amount: '29.00', currency: 'EUR' },
})
```

`init()` creates a single shared instance, fires an automatic pageview, and wires SPA navigation. `track`, `pageview`, `optOut`, and `optIn` delegate to it.

Autocapture toggles — `outbound`, `files`, `notFound`, and `tagged` — opt into the same extensions as the snippet's `data-auto`: outbound-link clicks, file downloads, 404 detection, and `data-takt-event` custom events. `tagged: true` tracks clicks on elements carrying `data-takt-event` (with `data-takt-prop-*` becoming props), matching `data-auto=tagged`.

### Instance API — `createTakt`

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
| `scriptOrigin` | `string` | hosted Takt origin | First-party origin to derive the endpoint from (`{origin}/api/event`) — a custom domain you proxy through to dodge ad-blockers |
| `endpoint` | `string` | `https://taktlytics.com/api/event` | Ingestion endpoint (wins over `scriptOrigin`); set `/api/event` for a same-origin first-party proxy |
| `enabled` | `boolean` | `true` | Master switch — when `false`, nothing is sent |
| `debug` | `boolean` | `false` | Log each payload to the console before sending |
| `sampleRate` | `number` | `1` | Keep this fraction of events (e.g. `0.25` ≈ 25%) |
| `respectDnt` | `boolean` | `true` | Suppress events when Do Not Track is on |
| `excludeLocalhost` | `boolean` | `true` | Suppress events on localhost / private IPs |
| `exclude` | `string[]` | — | Path prefixes never tracked (e.g. `['/app', '/account']`). Segment-bounded: `/app` matches `/app` and `/app/…` but not `/application`. Checked at send time, so it holds across SPA navigation |
| `trackQuery` | `boolean` | `false` | Keep the full query string and hash on URLs |
| `queryParams` | `string[]` | — | Allowlist: keep only these query params, drop the rest |
| `scrubUrl` | `(url: string) => string` | — | Custom scrubber; overrides `trackQuery` / `queryParams` |

### Privacy

By default the query string and hash are stripped from every URL (page, referrer, and autocaptured link destinations) before sending — secrets in `?token=…` or `#access_token=…` never leave the browser. Opt back in with `trackQuery: true`, narrow it with a `queryParams` allowlist, or take full control with `scrubUrl`. Props and revenue are sanitized too: props are coerced to strings, capped (30 keys, 64-char keys, 1024-char values), and revenue is dropped unless the amount and 3-letter currency are well-formed.

```ts
import { optOut, optIn } from '@vskstudio/takt-core'

optOut() // sets localStorage `takt_ignore` = '1'; no events are sent
optIn()  // resumes tracking
```

Events are suppressed, in order, when: the visitor has opted out, **or** Do Not Track is enabled (`respectDnt`), **or** the host is localhost / a private IP (`excludeLocalhost`), **or** the path matches an `exclude` prefix, **or** the event is dropped by `sampleRate`.

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
When set, it must be an absolute `http(s)://` origin — anything else
(`javascript:`, `data:`, protocol-relative `//…`) is rejected, so a `host`
value can never smuggle a non-http scheme into a widget `src` or a `fetch`.
The value is reduced to its origin: any path, query, or fragment is dropped
(`https://takt.example.com/x?a=1` → `https://takt.example.com`).
Errors surface as `PublicApiError` (carrying the HTTP `status`).

## Wire payload contract

Every event is posted to the endpoint as a compact JSON object. The keys are frozen — the Takt backend ingestion depends on them:

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
                 sampling), and autocapture trackers — depending only on small
                 single-method port interfaces.
infrastructure/   Driven adapters: a resilient fetch/beacon transport, localStorage
                 consent, and browser providers (DNT, environment, history, clicks).
composition/      createTakt() factory, the ESM entry, and the snippet adapter.
```

The domain never reaches outward; adapters are injected at the composition root (`createTakt`). This keeps the core testable with fakes and lets you swap transports or storage without touching business logic.

## License

MIT
