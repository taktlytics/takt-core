import { describe, it, expect, vi } from 'vitest'
import { Analytics } from '../../src/application/Analytics'
import type { EventTransport } from '../../src/application/ports/EventTransport'
import type { ConsentStore } from '../../src/application/ports/ConsentStore'
import type { DoNotTrackProvider } from '../../src/application/ports/DoNotTrackProvider'
import type { EnvironmentProvider } from '../../src/application/ports/EnvironmentProvider'
import type { NavigationProvider } from '../../src/application/ports/NavigationProvider'
import type { ClickSource } from '../../src/application/ports/ClickSource'
import type { Payload } from '../../src/domain/event/Payload'
import createUrlScrubber from '../../src/domain/url/UrlScrubber'
import createRouteRedaction from '../../src/domain/url/RouteRedaction'

// --- Fakes ---
function fakeTransport() {
  const calls: Payload[] = []
  const transport: EventTransport = { send: (p) => calls.push(p) }
  return { transport, calls }
}

function fakeConsent(optedOut = false): ConsentStore {
  let state = optedOut
  return { isOptedOut: () => state, optOut: () => { state = true }, optIn: () => { state = false } }
}

const fakeDnt = (enabled = false): DoNotTrackProvider => ({ isEnabled: () => enabled })

function fakeEnv(hostname = 'example.com'): EnvironmentProvider {
  return {
    hostname: () => hostname,
    path: () => '/test',
    url: () => `https://${hostname}/test`,
    referrer: () => 'https://ref.io/',
    width: () => 1024,
  }
}

function fakeNav(): { nav: NavigationProvider; trigger: () => void } {
  let cb: (() => void) | null = null
  const nav: NavigationProvider = {
    onNavigate: (handler) => { cb = handler; return () => { cb = null } },
  }
  return { nav, trigger: () => cb?.() }
}

function fakeClick(): { click: ClickSource; trigger: (a: HTMLAnchorElement) => void } {
  let cb: ((a: HTMLAnchorElement, e: Event) => void) | null = null
  const click: ClickSource = {
    onAnchorClick: (handler) => { cb = handler; return () => { cb = null } },
    onElementClick: () => () => {},
  }
  return { click, trigger: (a) => cb?.(a, new Event('click')) }
}

const defaultConfig = {
  domain: 'example.com',
  endpoint: '/api/event',
  respectDnt: true,
  excludeLocalhost: true,
  exclude: [] as string[],
  enabled: true,
  debug: false,
  sampleRate: 1,
  scrubUrl: createUrlScrubber(),
}

function makeAnalytics(overrides: {
  consent?: ConsentStore
  dnt?: DoNotTrackProvider
  env?: EnvironmentProvider
  nav?: NavigationProvider
  click?: ClickSource
  transport?: EventTransport
} = {}) {
  const { transport, calls } = fakeTransport()
  const { nav } = fakeNav()
  const { click } = fakeClick()
  return {
    analytics: new Analytics(
      defaultConfig,
      overrides.transport ?? transport,
      overrides.consent ?? fakeConsent(),
      overrides.dnt ?? fakeDnt(),
      overrides.env ?? fakeEnv(),
      overrides.nav ?? nav,
      overrides.click ?? click,
    ),
    calls: overrides.transport ? [] : calls,
  }
}

describe('Analytics', () => {
  describe('track()', () => {
    it('builds correct payload for a custom event', () => {
      const { transport, calls } = fakeTransport()
      const { analytics } = makeAnalytics({ transport })
      analytics.track('Signup', { props: { plan: 'pro' }, revenue: { amount: '29.00', currency: 'EUR' } })
      expect(calls).toHaveLength(1)
      expect(calls[0]).toMatchObject({
        n: 'Signup',
        d: 'example.com',
        p: { plan: 'pro' },
        $: { a: '29.00', c: 'EUR' },
      })
    })

    it('trims event name and rejects empty / "pageview"', () => {
      const { transport, calls } = fakeTransport()
      const { analytics } = makeAnalytics({ transport })
      analytics.track('  pageview  ')
      analytics.track('')
      analytics.track(123 as unknown as string)
      expect(calls).toHaveLength(0)
    })

    it('suppresses send when policy blocks (opt-out)', () => {
      const consent = fakeConsent()
      const { transport, calls } = fakeTransport()
      const { analytics } = makeAnalytics({ transport, consent })
      consent.optOut()
      analytics.track('Signup')
      expect(calls).toHaveLength(0)
    })
  })

  describe('pageview()', () => {
    it('sends with n:"pageview"', () => {
      const { transport, calls } = fakeTransport()
      const { analytics } = makeAnalytics({ transport })
      analytics.pageview()
      expect(calls[0]).toMatchObject({ n: 'pageview' })
    })
  })

  describe('optOut() / optIn()', () => {
    it('delegates to ConsentStore', () => {
      const consent = fakeConsent()
      const spy = vi.spyOn(consent, 'optOut')
      const spyIn = vi.spyOn(consent, 'optIn')
      const { analytics } = makeAnalytics({ consent })
      analytics.optOut()
      expect(spy).toHaveBeenCalledOnce()
      analytics.optIn()
      expect(spyIn).toHaveBeenCalledOnce()
    })

    it('optIn unblocks tracking', () => {
      const consent = fakeConsent(true)
      const { transport, calls } = fakeTransport()
      const { analytics } = makeAnalytics({ transport, consent })
      analytics.track('Signup')
      expect(calls).toHaveLength(0)
      analytics.optIn()
      analytics.track('Signup')
      expect(calls).toHaveLength(1)
    })
  })

  describe('isOptedOut()', () => {
    it('reflects the consent store', () => {
      const consent = fakeConsent()
      const { analytics } = makeAnalytics({ consent })
      expect(analytics.isOptedOut()).toBe(false)
      analytics.optOut()
      expect(analytics.isOptedOut()).toBe(true)
      analytics.optIn()
      expect(analytics.isOptedOut()).toBe(false)
    })
  })

  describe('custom scrubUrl on autocapture', () => {
    function makeWithScrubber(click: ClickSource, transport: EventTransport) {
      return new Analytics(
        { ...defaultConfig, scrubUrl: createUrlScrubber({ custom: (raw) => raw.replace(/\/invite\/[^/]+/, '/invite/:code') }) },
        transport,
        fakeConsent(),
        fakeDnt(),
        fakeEnv(),
        fakeNav().nav,
        click,
      )
    }

    it('scrubs the outbound link url', () => {
      const { click, trigger } = fakeClick()
      const { transport, calls } = fakeTransport()
      makeWithScrubber(click, transport).enableOutbound()
      const a = document.createElement('a')
      a.href = 'https://discord.gg/invite/s3cr3t'
      trigger(a)
      expect(calls[0].p?.url).toBe('https://discord.gg/invite/:code')
    })

    it('scrubs the file download url', () => {
      const { click, trigger } = fakeClick()
      const { transport, calls } = fakeTransport()
      makeWithScrubber(click, transport).enableFiles(['pdf'])
      const a = document.createElement('a')
      a.href = 'https://example.com/invite/s3cr3t/file.pdf'
      trigger(a)
      expect(calls[0].p?.url).toBe('https://example.com/invite/:code/file.pdf')
    })
  })

  describe('enableSpa()', () => {
    it('fires pageview on navigation and disposer stops it', () => {
      const { nav, trigger } = fakeNav()
      const { transport, calls } = fakeTransport()
      const { analytics } = makeAnalytics({ transport, nav })
      const dispose = analytics.enableSpa()
      trigger()
      expect(calls).toHaveLength(1)
      expect(calls[0].n).toBe('pageview')
      dispose()
      trigger()
      expect(calls).toHaveLength(1) // no new send after dispose
    })
  })

  describe('enableOutbound()', () => {
    it('fires outbound event and disposer stops it', () => {
      const env = fakeEnv('example.com')
      const { click, trigger } = fakeClick()
      const { transport, calls } = fakeTransport()
      const { analytics } = makeAnalytics({ transport, env, click })
      const dispose = analytics.enableOutbound()
      const a = document.createElement('a')
      a.href = 'https://other.com/page'
      trigger(a)
      expect(calls).toHaveLength(1)
      expect(calls[0]).toMatchObject({ n: 'Outbound Link: Click' })
      dispose()
      trigger(a)
      expect(calls).toHaveLength(1) // no new send after dispose
    })
  })

  describe('enableFiles()', () => {
    it('fires file download event and disposer stops it', () => {
      const { click, trigger } = fakeClick()
      const { transport, calls } = fakeTransport()
      const { analytics } = makeAnalytics({ transport, click })
      const dispose = analytics.enableFiles(['pdf'])
      const a = document.createElement('a')
      a.href = 'https://example.com/report.pdf'
      trigger(a)
      expect(calls).toHaveLength(1)
      expect(calls[0]).toMatchObject({ n: 'File Download' })
      dispose()
      trigger(a)
      expect(calls).toHaveLength(1)
    })
  })

  describe('route redaction', () => {
    function envAt(path: string, referrer = 'https://ref.io/'): EnvironmentProvider {
      return {
        hostname: () => 'example.com',
        path: () => path,
        url: () => `https://example.com${path}`,
        referrer: () => referrer,
        width: () => 1024,
      }
    }

    function makeWithRoutes(
      routes: ReturnType<typeof createRouteRedaction>,
      env: EnvironmentProvider,
      extra: { nav?: NavigationProvider; click?: ClickSource } = {},
    ) {
      const { transport, calls } = fakeTransport()
      const analytics = new Analytics(
        { ...defaultConfig, routes },
        transport,
        fakeConsent(),
        fakeDnt(),
        env,
        extra.nav ?? fakeNav().nav,
        extra.click ?? fakeClick().click,
      )
      return { analytics, calls }
    }

    it('sends the matching pattern instead of the real path', () => {
      const { analytics, calls } = makeWithRoutes(
        createRouteRedaction({ redactRoutes: ['/verify/[token]'] }),
        envAt('/verify/abc123'),
      )
      analytics.pageview()
      analytics.track('Verified')
      expect(calls.map((c) => c.u)).toEqual([
        'https://example.com/verify/[token]',
        'https://example.com/verify/[token]',
      ])
    })

    it('redacts a same-origin referrer', () => {
      const { analytics, calls } = makeWithRoutes(
        createRouteRedaction({ redactRoutes: ['/reset/[code]'] }),
        envAt('/login', 'https://example.com/reset/k9?x=1'),
      )
      analytics.pageview()
      expect(calls[0].r).toBe('https://example.com/reset/[code]')
    })

    it('redacts same-origin download urls', () => {
      const { click, trigger } = fakeClick()
      const { analytics, calls } = makeWithRoutes(
        createRouteRedaction({ redactRoutes: ['/invoices/[id]'] }),
        envAt('/account'),
        { click },
      )
      analytics.enableFiles(['pdf'])
      const a = document.createElement('a')
      a.href = 'https://example.com/invoices/991.pdf'
      trigger(a)
      expect(calls[0].p?.url).toBe('https://example.com/invoices/[id]')
    })

    it('sends the route template of every page in template mode', () => {
      let template = '/users/[id]'
      const { analytics, calls } = makeWithRoutes(
        createRouteRedaction({ routeTemplates: true, routeTemplate: () => template }),
        envAt('/users/42', 'https://example.com/users/41'),
      )
      analytics.pageview()
      template = '/(app)/orders/:orderId'
      analytics.track('Paid')
      expect(calls[0]).toMatchObject({ u: 'https://example.com/users/[id]', r: 'https://example.com/' })
      expect(calls[1].u).toBe('https://example.com/orders/:orderId')
    })

    it('waits for the router before reading the template of a SPA navigation', () => {
      vi.useFakeTimers()
      try {
        const { nav, trigger } = fakeNav()
        let template = '/old/[id]'
        const { analytics, calls } = makeWithRoutes(
          createRouteRedaction({ routeTemplates: true, routeTemplate: () => template }),
          envAt('/new/7'),
          { nav },
        )
        const dispose = analytics.enableSpa()
        trigger()
        template = '/new/[id]'
        expect(calls).toHaveLength(0)
        vi.runAllTimers()
        expect(calls.map((c) => c.u)).toEqual(['https://example.com/new/[id]'])
        trigger()
        dispose()
        vi.runAllTimers()
        expect(calls).toHaveLength(1)
      } finally {
        vi.useRealTimers()
      }
    })

    it('keeps SPA pageviews synchronous without template mode', () => {
      const { nav, trigger } = fakeNav()
      const { analytics, calls } = makeWithRoutes(
        createRouteRedaction({ redactRoutes: ['/x/[id]'] }),
        envAt('/x/1'),
        { nav },
      )
      analytics.enableSpa()
      trigger()
      expect(calls).toHaveLength(1)
    })

    it('redacts the path of a 404 event', () => {
      const marker = document.createElement('div')
      marker.setAttribute('data-takt-404', '')
      document.body.appendChild(marker)
      const previous = location.pathname
      history.replaceState(null, '', '/verify/abc123')
      try {
        const { analytics, calls } = makeWithRoutes(
          createRouteRedaction({ redactRoutes: ['/verify/[token]'] }),
          envAt('/verify/abc123'),
        )
        analytics.enable404()
        expect(calls[0]).toMatchObject({ n: '404', p: { path: '/verify/[token]' } })
      } finally {
        marker.remove()
        history.replaceState(null, '', previous)
      }
    })
  })
})
