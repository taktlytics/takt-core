import { DEFAULT_TAKT_ORIGIN } from '../defaults'

type Mask = (raw: string) => string
type TaktFn = ((name: string, opts?: unknown) => void) & { q?: unknown[][]; takt_mask?: Mask }
type Opts = { props?: Record<string, string>; revenue?: { amount: string; currency: string } } | undefined

// runSnippet is exported for testing; the IIFE tail below auto-runs it in the browser.
export function runSnippet(el: HTMLScriptElement | null, redact?: (raw: string) => string): void {
  const get = (k: string) => (el ? el.getAttribute(k) : null)

  // data-enabled="false" : kill-switch total (aucun listener, aucun envoi).
  if (get('data-enabled') === 'false') return

  const win = window as unknown as { takt?: TaktFn }
  if (typeof win.takt === 'function' && win.takt.takt_mask) {
    if (redact) win.takt.takt_mask = redact
    return
  }

  const domain = get('data-domain') || location.hostname
  // data-script-origin (first-party / anti-adblock) : origine d'où Takt sert
  // l'ingest (domaine custom proxifié par le client). data-endpoint reste
  // prioritaire ; sinon on dérive {origin}/api/event, défaut l'origine Takt hébergée.
  const origin = get('data-script-origin') || DEFAULT_TAKT_ORIGIN
  const endpoint = get('data-endpoint') || origin.replace(/\/+$/, '') + '/api/event'
  const excl = get('data-exclude-localhost') !== 'false'
  const dnt = get('data-respect-dnt') !== 'false'
  const rate = parseFloat(get('data-sample-rate') || '1')
  const keepQuery = (get('data-track-query') ?? 'false') !== 'false'
  const allow = (get('data-query-params') || '').split(',').map((s) => s.trim()).filter(Boolean)

  // Default strips query + hash. Precedence: trackQuery (keep the raw URL, query
  // + hash) wins over the allowlist, which wins over the default strip; mirrors
  // createUrlScrubber.
  const scrub = (raw: string) => {
    try {
      const masked = win.takt?.takt_mask?.(raw) || ''
      if (keepQuery) return masked
      const u = new URL(masked)
      if (allow.length) {
        const kept = new URLSearchParams()
        for (const n of allow) { const v = u.searchParams.get(n); if (v !== null) kept.set(n, v) }
        const qs = kept.toString()
        return u.origin + u.pathname + (qs ? '?' + qs : '')
      }
      return u.origin + u.pathname
    } catch { return '' }
  }

  // Frozen short-circuit order: opt-out → DNT → localhost → sampling.
  function emit(name: string, opts?: Opts): void {
    try { if (localStorage.getItem('takt_ignore') === '1') return } catch { /* noop */ }
    if (dnt && navigator.doNotTrack === '1') return
    if (excl) {
      const h = location.hostname
      if (h === 'localhost' || h === '::1' || h === '0.0.0.0' || h.endsWith('.local') ||
          /^(127|10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(h)) return
    }
    if (rate < 1 && Math.random() >= rate) return
    const p: Record<string, unknown> = { n: name, d: domain, u: scrub(location.href), r: scrub(document.referrer), w: innerWidth }
    if (opts?.props && Object.keys(opts.props).length) p.p = opts.props
    if (opts?.revenue) p.$ = { a: opts.revenue.amount, c: opts.revenue.currency.toUpperCase() }
    const b = JSON.stringify(p)
    try {
      if (!navigator.sendBeacon?.(endpoint, b))
        void fetch(endpoint, { method: 'POST', body: b, keepalive: true }).catch(() => {})
    } catch { /* best-effort */ }
  }

  function track(name: string, opts?: Opts): void {
    if (typeof name !== 'string') return
    const n = name.trim()
    if (n && n !== 'pageview') emit(n, opts)
  }

  function pv(): void { emit('pageview') }

  for (const k of ['pushState', 'replaceState'] as const) {
    const o = history[k]
    history[k] = function (this: History, ...a: Parameters<History['pushState']>) {
      const r = o.apply(this, a); pv(); return r
    }
  }
  addEventListener('popstate', pv)
  addEventListener('hashchange', pv)

  const q = win.takt?.q
  const fn = track as TaktFn
  fn.takt_mask = redact || ((raw: string) => raw)
  win.takt = fn
  pv()
  if (q) for (const a of q) track(...(a as [string, Opts?]))
}
