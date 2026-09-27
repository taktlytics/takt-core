import { EventName } from '../domain/event/EventName'
import { Props } from '../domain/event/Props'
import { Revenue } from '../domain/event/Revenue'
import { AnalyticsEvent } from '../domain/event/AnalyticsEvent'
import { buildPayload } from '../domain/event/Payload'
import { TrackingPolicy } from './consent/TrackingPolicy'
import type { UrlScrubber } from '../domain/url/UrlScrubber'
import createRouteRedaction, { type RouteRedaction } from '../domain/url/RouteRedaction'
import type { EventTransport } from './ports/EventTransport'
import type { ConsentStore } from './ports/ConsentStore'
import type { DoNotTrackProvider } from './ports/DoNotTrackProvider'
import type { EnvironmentProvider } from './ports/EnvironmentProvider'
import type { NavigationProvider } from './ports/NavigationProvider'
import type { ClickSource } from './ports/ClickSource'
import { OutboundLinkTracker } from './autocapture/OutboundLinkTracker'
import { FileDownloadTracker } from './autocapture/FileDownloadTracker'
import { SpaPageviewTracker } from './autocapture/SpaPageviewTracker'
import { NotFoundTracker } from './autocapture/NotFoundTracker'
import { TaggedEventTracker } from './autocapture/TaggedEventTracker'

export interface TrackOptions {
  props?: Record<string, string>
  revenue?: { amount: string; currency: string }
}

export interface AnalyticsConfig {
  domain: string
  endpoint: string
  respectDnt: boolean
  excludeLocalhost: boolean
  exclude: string[]
  enabled: boolean
  debug: boolean
  sampleRate: number
  scrubUrl: UrlScrubber
  routes?: RouteRedaction
}

export class Analytics {
  private readonly policy: TrackingPolicy
  private readonly routes: RouteRedaction

  constructor(
    private readonly config: AnalyticsConfig,
    private readonly transport: EventTransport,
    private readonly consent: ConsentStore,
    dnt: DoNotTrackProvider,
    private readonly envProvider: EnvironmentProvider,
    private readonly navProvider: NavigationProvider,
    private readonly clickSource: ClickSource,
  ) {
    this.policy = new TrackingPolicy(consent, dnt, envProvider, config)
    this.routes = config.routes ?? createRouteRedaction()
  }

  track(name: string, opts?: TrackOptions): void {
    if (typeof name !== 'string') return
    let eventName: EventName
    try {
      eventName = new EventName(name)
    } catch {
      return
    }
    if (eventName.isReserved()) return
    this._emit(eventName, opts)
  }

  pageview(): void {
    this._emit(new EventName('pageview'))
  }

  optOut(): void {
    this.consent.optOut()
  }

  optIn(): void {
    this.consent.optIn()
  }

  isOptedOut(): boolean {
    return this.consent.isOptedOut()
  }

  enableSpa(): () => void {
    if (!this.routes.templated) {
      return new SpaPageviewTracker(this.navProvider, () => this.pageview()).enable()
    }
    const pending = new Set<ReturnType<typeof setTimeout>>()
    const stop = new SpaPageviewTracker(this.navProvider, () => {
      const timer = setTimeout(() => {
        pending.delete(timer)
        this.pageview()
      }, 0)
      pending.add(timer)
    }).enable()
    return () => {
      stop()
      pending.forEach(clearTimeout)
      pending.clear()
    }
  }

  enableOutbound(): () => void {
    return new OutboundLinkTracker(
      this.clickSource,
      this.envProvider,
      (name, opts) => this.track(name, opts),
      this.config.scrubUrl,
    ).enable()
  }

  enableFiles(extensions?: string[]): () => void {
    return new FileDownloadTracker(
      this.clickSource,
      (name, opts) => this.track(name, opts),
      extensions,
      (url) => this.config.scrubUrl(this.routes.link(url, this.envProvider.url())),
    ).enable()
  }

  enable404(): () => void {
    return new NotFoundTracker((name, opts) => this.track(name, opts), (path) => this.routes.path(path)).enable()
  }

  enableTagged(): () => void {
    return new TaggedEventTracker(this.clickSource, (name, opts) => this.track(name, opts)).enable()
  }

  private _emit(name: EventName, opts?: TrackOptions): void {
    if (!this.config.enabled || this.policy.isBlocked()) return
    const revenue = opts?.revenue
      ? Revenue.parse(opts.revenue.amount, opts.revenue.currency)
      : undefined
    const event = new AnalyticsEvent(name, new Props(opts?.props), revenue)
    const pageUrl = this.envProvider.url()
    const payload = buildPayload(event, {
      domain: this.config.domain,
      url: this.config.scrubUrl(this.routes.page(pageUrl)),
      referrer: this.config.scrubUrl(this.routes.referrer(this.envProvider.referrer(), pageUrl)),
      width: this.envProvider.width(),
    })
    if (this.config.debug) console.debug('[takt] event', payload)
    this.transport.send(payload)
  }
}
