import { Analytics } from '../application/Analytics'
import type { AnalyticsConfig } from '../application/Analytics'
import { ResilientTransport } from '../infrastructure/transport/ResilientTransport'
import { LocalStorageConsentStore } from '../infrastructure/consent/LocalStorageConsentStore'
import { NavigatorDntProvider } from '../infrastructure/browser/NavigatorDntProvider'
import { WindowEnvironmentProvider } from '../infrastructure/browser/WindowEnvironmentProvider'
import { HistoryNavigationProvider } from '../infrastructure/browser/HistoryNavigationProvider'
import { DocumentClickSource } from '../infrastructure/browser/DocumentClickSource'
import createUrlScrubber, { type UrlScrubber } from '../domain/url/UrlScrubber'
import createRouteRedaction, { type RouteTemplateResolver } from '../domain/url/RouteRedaction'
import { warnOnce } from '../domain/util/warn'
import { DEFAULT_TAKT_ORIGIN } from '../defaults'

/** Configuration for {@link createTakt} — the core SDK without the autocapture toggles. */
export interface Config {
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
}

/**
 * Resolve the ingest endpoint. `endpoint` wins if given; otherwise derive
 * `${origin}/api/event` from `scriptOrigin` (first-party / anti-adblock: a custom
 * domain you proxy through) — or, with neither set, from the hosted Takt origin
 * so the SaaS case works with no config. Pass `endpoint: '/api/event'` for a pure
 * same-origin first-party proxy.
 */
export function resolveEndpoint(endpoint?: string, scriptOrigin?: string): string {
  if (endpoint) return endpoint
  return (scriptOrigin || DEFAULT_TAKT_ORIGIN).replace(/\/+$/, '') + '/api/event'
}

/**
 * Create a standalone instance the caller owns — privacy defaults on, but no
 * autocapture and no module singleton (unlike {@link init}).
 */
export function createTakt(config: Config = {}): Analytics {
  const resolvedConfig: AnalyticsConfig = {
    domain: config.domain || location.hostname,
    endpoint: resolveEndpoint(config.endpoint, config.scriptOrigin),
    respectDnt: config.respectDnt ?? true,
    excludeLocalhost: config.excludeLocalhost ?? true,
    exclude: config.exclude ?? [],
    enabled: config.enabled ?? true,
    debug: config.debug ?? false,
    sampleRate: config.sampleRate ?? 1,
    scrubUrl: createUrlScrubber({
      trackQuery: config.trackQuery,
      queryParams: config.queryParams,
      custom: config.scrubUrl,
    }),
    routes: createRouteRedaction({
      redactRoutes: config.redactRoutes,
      routeTemplates: config.routeTemplates,
      routeTemplate: config.routeTemplate,
    }),
  }

  if (resolvedConfig.debug && config.routeTemplates && typeof config.routeTemplate !== 'function') {
    warnOnce('routeTemplates is on but no routeTemplate resolver was given, so real paths are sent')
  }

  return new Analytics(
    resolvedConfig,
    new ResilientTransport(resolvedConfig.endpoint),
    new LocalStorageConsentStore(),
    new NavigatorDntProvider(),
    new WindowEnvironmentProvider(),
    new HistoryNavigationProvider(),
    new DocumentClickSource(),
  )
}
