// URL builders for the server-rendered Takt widgets: the badge (`/public/{domain}/badge.svg`)
// and the embed iframe (`/embed/{domain}`). The framework wrappers (`Badge`/`Embed`) build
// their `src` from these so the allow-listed params stay in one place.
//
// `host` defaults to the hosted Takt origin, mirroring the SDK's ingest default.
// First-party proxies and custom hosts point it at their own host, e.g.
// `host: 'https://takt.example.com'`.

import { DEFAULT_TAKT_ORIGIN } from '../defaults'

export type BadgeVariant = 'a' | 'b' | 'd'
export type BadgeGlyph = 'unplug' | 'dash' | 'off' | 'eyeoff'
export type WidgetLang = 'fr' | 'en'
export type EmbedTheme = 'light' | 'dark' | 'auto'

export interface BadgeOptions {
  host?: string
  variant?: BadgeVariant
  glyph?: BadgeGlyph
  lang?: WidgetLang
}

export interface EmbedOptions {
  host?: string
  theme?: EmbedTheme
  lang?: WidgetLang
}

// `host` must be empty (same-origin, relative) or an absolute http(s) origin.
// Rejecting everything else stops `javascript:`/`data:`/protocol-relative (`//evil`)
// values from flowing into an <img>/<iframe> `src` or a fetch() in the wrappers.
export function normalizeHost(host?: string): string {
  if (!host) return DEFAULT_TAKT_ORIGIN
  let url: URL
  try {
    url = new URL(host)
  } catch {
    throw new Error('takt: host must be an absolute http(s) URL (e.g. https://takt.example.com) or empty')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('takt: host must be an absolute http(s) URL (e.g. https://takt.example.com) or empty')
  }
  // Keep only the origin: a host carrying a path/query/fragment would otherwise
  // splice into the built URL (e.g. `https://x/y?a=1/public/...`).
  return url.origin
}

// Defaults match the server's allow-list fallbacks, so they're omitted from the query.
function build(base: string, params: Record<string, string | undefined>, defaults: Record<string, string>): string {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value && value !== defaults[key]) qs.set(key, value)
  }
  const str = qs.toString()
  return str ? `${base}?${str}` : base
}

/** URL of the badge SVG. `variant` defaults to `a`, `lang` to `fr`; `glyph` only affects the fallback. */
export function badgeUrl(domain: string, opts: BadgeOptions = {}): string {
  const base = `${normalizeHost(opts.host)}/public/${encodeURIComponent(domain)}/badge.svg`
  return build(base, { variant: opts.variant, glyph: opts.glyph, lang: opts.lang }, { variant: 'a', lang: 'fr' })
}

/** URL of the embed iframe page. `theme` defaults to `light`, `lang` to `fr`. */
export function embedUrl(domain: string, opts: EmbedOptions = {}): string {
  const base = `${normalizeHost(opts.host)}/embed/${encodeURIComponent(domain)}`
  return build(base, { theme: opts.theme, lang: opts.lang }, { theme: 'light', lang: 'fr' })
}
