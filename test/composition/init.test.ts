import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { init, track, pageview, optOut, optIn, isOptedOut, createTakt, _reset } from '../../src/composition/index'
import type { Config, TrackOptions, Revenue, Payload } from '../../src/composition/index'

// compile-time check: public types are exported
const _cfg: Config = { domain: 'x' }
const _opts: TrackOptions = { props: { a: 'b' } }
const _rev: Revenue = { amount: '1.00', currency: 'EUR' }
const _pl: Pick<Payload, 'n'> = { n: 'pageview' }
void _cfg; void _opts; void _rev; void _pl

describe('composition/index init()', () => {
  let beaconMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    _reset()
    localStorage.clear()
    window.history.replaceState({}, '', 'https://example.com/')
    Object.defineProperty(navigator, 'doNotTrack', { value: '0', configurable: true })
    beaconMock = vi.fn(() => true)
    vi.stubGlobal('navigator', { sendBeacon: beaconMock, doNotTrack: '0' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    _reset()
  })

  it('sends an initial pageview when auto is true (default)', () => {
    init({ domain: 'example.com', auto: true })
    expect(beaconMock).toHaveBeenCalledOnce()
    const body = JSON.parse((beaconMock.mock.calls[0] as [string, string])[1])
    expect(body).toMatchObject({ n: 'pageview', d: 'example.com' })
  })

  it('sends the matching redactRoutes pattern instead of the real path', () => {
    window.history.replaceState({}, '', 'https://example.com/verify/abc123')
    init({ domain: 'example.com', redactRoutes: ['/verify/[token]'] })
    const body = JSON.parse((beaconMock.mock.calls[0] as [string, string])[1])
    expect(body.u).toBe('https://example.com/verify/[token]')
  })

  it('sends the route template when routeTemplates is on', () => {
    window.history.replaceState({}, '', 'https://example.com/users/42')
    const instance = createTakt({ domain: 'example.com', routeTemplates: true, routeTemplate: () => '/users/:id' })
    instance.pageview()
    const body = JSON.parse((beaconMock.mock.calls[0] as [string, string])[1])
    expect(body.u).toBe('https://example.com/users/:id')
  })

  it('warns in debug mode when routeTemplates has no resolver', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      createTakt({ domain: 'example.com', debug: true, routeTemplates: true })
      expect(warn).toHaveBeenCalledOnce()
      warn.mockClear()
      createTakt({ domain: 'example.com', routeTemplates: true })
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('defaults the endpoint to the hosted Takt origin', () => {
    init({ domain: 'example.com', auto: true })
    expect((beaconMock.mock.calls[0] as [string, string])[0]).toBe('https://taktlytics.com/api/event')
  })

  it('derives the endpoint from scriptOrigin (first-party)', () => {
    init({ domain: 'example.com', scriptOrigin: 'https://stats.example.com/', auto: true })
    expect((beaconMock.mock.calls[0] as [string, string])[0]).toBe('https://stats.example.com/api/event')
  })

  it('lets endpoint win over scriptOrigin', () => {
    init({ domain: 'example.com', endpoint: '/collect', scriptOrigin: 'https://stats.example.com', auto: true })
    expect((beaconMock.mock.calls[0] as [string, string])[0]).toBe('/collect')
  })

  it('does not send an initial pageview when auto is false', () => {
    init({ domain: 'example.com', auto: false })
    expect(beaconMock).not.toHaveBeenCalled()
  })

  it('track() delegates to default instance', () => {
    init({ domain: 'example.com', auto: false })
    track('Signup', { props: { plan: 'pro' } })
    expect(beaconMock).toHaveBeenCalledOnce()
    const body = JSON.parse((beaconMock.mock.calls[0] as [string, string])[1])
    expect(body).toMatchObject({ n: 'Signup', p: { plan: 'pro' } })
  })

  it('pageview() delegates to default instance', () => {
    init({ domain: 'example.com', auto: false })
    pageview()
    expect(beaconMock).toHaveBeenCalledOnce()
  })

  it('optOut() prevents subsequent sends', () => {
    init({ domain: 'example.com', auto: false })
    optOut()
    track('Signup')
    expect(beaconMock).not.toHaveBeenCalled()
  })

  it('optIn() restores tracking after optOut', () => {
    init({ domain: 'example.com', auto: false })
    optOut()
    optIn()
    track('Signup')
    expect(beaconMock).toHaveBeenCalledOnce()
  })

  it('optOut() before init() persists and blocks the later instance', () => {
    optOut()
    expect(isOptedOut()).toBe(true)
    init({ domain: 'example.com', auto: true })
    expect(beaconMock).not.toHaveBeenCalled()
  })

  it('isOptedOut() reflects optOut()/optIn() without any instance', () => {
    expect(isOptedOut()).toBe(false)
    optOut()
    expect(isOptedOut()).toBe(true)
    optIn()
    expect(isOptedOut()).toBe(false)
  })

  it('module consent functions and createTakt instances share the same state', () => {
    const instance = createTakt({ domain: 'example.com' })
    optOut()
    expect(instance.isOptedOut()).toBe(true)
    instance.optIn()
    expect(isOptedOut()).toBe(false)
  })

  it('track/pageview are no-ops when not init-ed', () => {
    // _reset() called in beforeEach — no init
    expect(() => track('Signup')).not.toThrow()
    expect(() => pageview()).not.toThrow()
    expect(beaconMock).not.toHaveBeenCalled()
  })

  it('outbound is not enabled when flag is false', () => {
    const instance = init({ domain: 'example.com', auto: false, outbound: false })
    const spy = vi.spyOn(instance, 'enableOutbound')
    expect(spy).not.toHaveBeenCalled()
  })

  it('returns the Analytics instance', () => {
    const instance = init({ domain: 'example.com', auto: false })
    expect(instance).toBeDefined()
    expect(typeof instance.track).toBe('function')
    expect(typeof instance.pageview).toBe('function')
  })

  it('strips query and hash from the page url by default', () => {
    window.history.replaceState({}, '', 'https://example.com/checkout?token=secret#step2')
    init({ domain: 'example.com', auto: true })
    const body = JSON.parse((beaconMock.mock.calls[0] as [string, string])[1])
    expect(body.u).toBe('https://example.com/checkout')
  })

  it('keeps the query when trackQuery is true', () => {
    window.history.replaceState({}, '', 'https://example.com/checkout?utm_source=x')
    init({ domain: 'example.com', auto: true, trackQuery: true })
    const body = JSON.parse((beaconMock.mock.calls[0] as [string, string])[1])
    expect(body.u).toBe('https://example.com/checkout?utm_source=x')
  })

  it('forwards revenue through track()', () => {
    init({ domain: 'example.com', auto: false })
    track('Purchase', { revenue: { amount: '29.00', currency: 'eur' } })
    const body = JSON.parse((beaconMock.mock.calls[0] as [string, string])[1])
    expect(body).toMatchObject({ n: 'Purchase', $: { a: '29.00', c: 'EUR' } })
  })

  it('drops events entirely when enabled is false', () => {
    init({ domain: 'example.com', auto: true, enabled: false })
    track('Signup')
    expect(beaconMock).not.toHaveBeenCalled()
  })

  it('enables tagged autocapture when tagged is true', () => {
    init({ domain: 'example.com', auto: false, tagged: true })
    beaconMock.mockClear()
    const btn = document.createElement('button')
    btn.setAttribute('data-takt-event', 'Cta')
    btn.setAttribute('data-takt-prop-zone', 'hero')
    document.body.appendChild(btn)
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    btn.remove()
    const body = JSON.parse((beaconMock.mock.calls[0] as [string, string])[1])
    expect(body).toMatchObject({ n: 'Cta', p: { zone: 'hero' } })
  })

  it('does not enable tagged autocapture by default', () => {
    init({ domain: 'example.com', auto: false })
    beaconMock.mockClear()
    const btn = document.createElement('button')
    btn.setAttribute('data-takt-event', 'Cta')
    document.body.appendChild(btn)
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    btn.remove()
    expect(beaconMock).not.toHaveBeenCalled()
  })

  it('re-initialising disposes the previous SPA listener (no double pageview)', () => {
    init({ domain: 'example.com', auto: true })
    expect(beaconMock).toHaveBeenCalledOnce() // first pageview
    init({ domain: 'example.com', auto: true })
    expect(beaconMock).toHaveBeenCalledTimes(2) // second pageview, not three

    beaconMock.mockClear()
    window.history.pushState({}, '', 'https://example.com/next')
    // only the single live SPA listener should fire, not a leaked one from the first init
    expect(beaconMock).toHaveBeenCalledOnce()
  })
})
