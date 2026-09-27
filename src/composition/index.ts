import { createTakt } from './createTakt'
import type { Analytics, TrackOptions } from '../application/Analytics'
import type { UrlScrubber } from '../domain/url/UrlScrubber'
import type { RouteTemplateResolver } from '../domain/url/RouteRedaction'
import { LocalStorageConsentStore } from '../infrastructure/consent/LocalStorageConsentStore'

export { createTakt }
export type { Config } from './createTakt'
export type { RouteTemplateResolver } from '../domain/url/RouteRedaction'
export type { TrackOptions } from '../application/Analytics'
export type { Payload } from '../domain/event/Payload'

// Server-rendered widget URL builders.
export { badgeUrl, embedUrl, normalizeHost } from '../widget/url'
export type {
  BadgeOptions,
  EmbedOptions,
  BadgeVariant,
  BadgeGlyph,
  EmbedTheme,
  WidgetLang,
} from '../widget/url'

// Public stats client.
export { createStats, PublicApiError } from '../stats/client'
export type {
  StatsClient,
  StatsClientOptions,
  StatsParams,
  StatsPeriod,
  StatsDimension,
  StatsMetrics,
  StatsSummary,
  StatsPoint,
  StatsTimeseries,
  StatsBreakdownRow,
  StatsBreakdown,
  StatsRealtime,
} from '../stats/client'

export type Revenue = { amount: string; currency: string }

const visitorConsent = new LocalStorageConsentStore()

let _instance: Analytics | null = null
let _disposers: Array<() => void> = []

/** Options for {@link init} — `createTakt`'s {@link Config} plus the autocapture toggles. */
export interface InitOptions {
  domain?: string
  endpoint?: string
  scriptOrigin?: string
  respectDnt?: boolean
  excludeLocalhost?: boolean
  exclude?: string[]
  enabled?: boolean
  debug?: boolean
  sampleRate?: number
  trackQuery?: boolean
  queryParams?: string[]
  scrubUrl?: UrlScrubber
  redactRoutes?: string[]
  routeTemplates?: boolean
  routeTemplate?: RouteTemplateResolver
  auto?: boolean
  outbound?: boolean
  files?: boolean
  fileExtensions?: string[]
  notFound?: boolean
  tagged?: boolean
}

/**
 * Bootstrap the default instance: create it, enable requested autocapture, and —
 * unless `auto` is `false` — start SPA tracking and fire an initial pageview.
 */
export function init(opts: InitOptions = {}): Analytics {
  _reset()

  _instance = createTakt({
    domain: opts.domain,
    endpoint: opts.endpoint,
    scriptOrigin: opts.scriptOrigin,
    respectDnt: opts.respectDnt,
    excludeLocalhost: opts.excludeLocalhost,
    exclude: opts.exclude,
    enabled: opts.enabled,
    debug: opts.debug,
    sampleRate: opts.sampleRate,
    trackQuery: opts.trackQuery,
    queryParams: opts.queryParams,
    scrubUrl: opts.scrubUrl,
    redactRoutes: opts.redactRoutes,
    routeTemplates: opts.routeTemplates,
    routeTemplate: opts.routeTemplate,
  })

  if (opts.outbound) _disposers.push(_instance.enableOutbound())
  if (opts.files) _disposers.push(_instance.enableFiles(opts.fileExtensions))
  if (opts.notFound) _disposers.push(_instance.enable404())
  if (opts.tagged) _disposers.push(_instance.enableTagged())
  if (opts.auto !== false) {
    _disposers.push(_instance.enableSpa())
    _instance.pageview()
  }

  return _instance
}

/** Track a custom event on the default instance. No-op until {@link init} has run. */
export function track(name: string, opts?: TrackOptions): void {
  _instance?.track(name, opts)
}

/** Send a pageview on the default instance. No-op until {@link init} has run. */
export function pageview(): void {
  _instance?.pageview()
}

export function optOut(): void {
  visitorConsent.optOut()
}

export function optIn(): void {
  visitorConsent.optIn()
}

export function isOptedOut(): boolean {
  return visitorConsent.isOptedOut()
}

export function _reset(): void {
  for (const dispose of _disposers) dispose()
  _disposers = []
  _instance = null
}
