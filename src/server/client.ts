import { resolveEndpoint } from '../composition/createTakt'
import { AnalyticsEvent } from '../domain/event/AnalyticsEvent'
import { EventName } from '../domain/event/EventName'
import { buildPayload, type Payload } from '../domain/event/Payload'
import { Props } from '../domain/event/Props'
import { Revenue } from '../domain/event/Revenue'
import createUrlScrubber, { type UrlScrubber } from '../domain/url/UrlScrubber'

export interface ServerTaktOptions {
  domain: string
  endpoint?: string
  scriptOrigin?: string
  apiKey?: string
  trackQuery?: boolean
  queryParams?: string[]
  scrubUrl?: UrlScrubber
  strict?: boolean
  fetch?: typeof globalThis.fetch
}

export interface ServerVisitor {
  ip?: string
  userAgent?: string
}

export interface ServerPageviewOptions {
  url?: string
  referrer?: string
  visitor?: ServerVisitor
}

export interface ServerEventOptions extends ServerPageviewOptions {
  props?: Record<string, unknown>
  revenue?: { amount: string; currency: string }
}

export interface ServerTakt {
  pageview(opts?: ServerPageviewOptions): Promise<void>
  event(name: string, opts?: ServerEventOptions): Promise<void>
}

export function createServerTakt(options: ServerTaktOptions): ServerTakt {
  const domain = options.domain.trim()
  if (!domain) throw new Error('createServerTakt: domain is required')

  const collectUrl = resolveEndpoint(options.endpoint, options.scriptOrigin)
  const scrub = createUrlScrubber({
    trackQuery: options.trackQuery,
    queryParams: options.queryParams,
    custom: options.scrubUrl,
  })
  const send = options.fetch ?? globalThis.fetch

  async function post(event: AnalyticsEvent, opts: ServerPageviewOptions): Promise<void> {
    const payload = buildPayload(event, {
      domain,
      url: scrub(opts.url?.trim() || siteHomeUrl(domain)),
      referrer: opts.referrer ? scrub(opts.referrer) : '',
      width: 0,
    })
    try {
      const response = await send(collectUrl, {
        method: 'POST',
        headers: requestHeaders(options.apiKey, opts.visitor),
        body: JSON.stringify(payload satisfies Payload),
      })
      if (response.status !== 202) {
        throw new Error(`Takt ingest answered ${response.status}`)
      }
    } catch (error) {
      if (options.strict) throw error
    }
  }

  return {
    pageview: (opts = {}) => post(new AnalyticsEvent(new EventName('pageview')), opts),
    async event(name, opts = {}) {
      const eventName = new EventName(name)
      if (eventName.isReserved()) throw new Error('createServerTakt: use pageview() for pageviews')
      const revenue = opts.revenue ? Revenue.parse(opts.revenue.amount, opts.revenue.currency) : undefined
      await post(new AnalyticsEvent(eventName, new Props(opts.props), revenue), opts)
    },
  }
}

function requestHeaders(apiKey: string | undefined, visitor: ServerVisitor | undefined): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${headerSafe(apiKey)}`
  if (visitor?.ip) headers['X-Forwarded-For'] = headerSafe(visitor.ip)
  if (visitor?.userAgent) headers['User-Agent'] = headerSafe(visitor.userAgent)
  return headers
}

function headerSafe(value: string): string {
  return value.replace(/[\r\n]/g, '')
}

function siteHomeUrl(domain: string): string {
  const origin = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`
  return `${origin.replace(/\/+$/, '')}/`
}
