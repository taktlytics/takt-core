import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { runAuto } from '../../src/composition/auto'
import { runSnippet } from '../../src/composition/snippet'

function scriptEl(attrs: Record<string, string | null> = {}): HTMLScriptElement {
  const s = document.createElement('script')
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== null) s.setAttribute(k, v)
  }
  return s
}

function clickLink(href: string): void {
  const link = document.createElement('a')
  link.href = href
  document.body.appendChild(link)
  link.addEventListener('click', (e) => e.preventDefault())
  link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  link.remove()
}

const pristineHistory = {
  pushState: history.pushState,
  replaceState: history.replaceState,
}

type RecordedListener = {
  target: EventTarget
  type: string
  listener: EventListenerOrEventListenerObject
  options?: boolean | AddEventListenerOptions
}

describe('runAuto', () => {
  let beaconMock: ReturnType<typeof vi.fn>
  let recorded: RecordedListener[] = []

  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState({}, '', 'https://example.com/')
    beaconMock = vi.fn(() => true)
    vi.stubGlobal('navigator', { sendBeacon: beaconMock, doNotTrack: '0' })
    delete (window as { takt?: unknown }).takt
    recorded = []
    const original = EventTarget.prototype.addEventListener
    vi.spyOn(EventTarget.prototype, 'addEventListener').mockImplementation(function (
      this: EventTarget,
      ...args: Parameters<EventTarget['addEventListener']>
    ) {
      const [type, listener, options] = args
      if ((this === document || this === window) && listener) recorded.push({ target: this, type, listener, options })
      original.apply(this, args)
    })
  })

  afterEach(() => {
    for (const r of recorded) r.target.removeEventListener(r.type, r.listener, r.options)
    recorded = []
    history.pushState = pristineHistory.pushState
    history.replaceState = pristineHistory.replaceState
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    delete (window as { takt?: unknown }).takt
  })

  function bodies(): Array<Record<string, unknown>> {
    return (beaconMock.mock.calls as [string, string][]).map(([, b]) => JSON.parse(b))
  }

  it('still sends the initial pageview like the base snippet', () => {
    runAuto(scriptEl({ 'data-domain': 'auto.test' }))
    expect(bodies()).toContainEqual(expect.objectContaining({ n: 'pageview', d: 'auto.test' }))
  })

  it('emits Outbound Link: Click for cross-domain links when data-auto includes outbound', () => {
    runAuto(scriptEl({ 'data-domain': 'auto.test', 'data-auto': 'outbound' }))
    beaconMock.mockClear()
    clickLink('https://other.com/path?token=secret')
    expect(beaconMock.mock.calls.length).toBe(1)
    expect(bodies()[0]).toMatchObject({ n: 'Outbound Link: Click', p: { url: 'https://other.com/path' } })
  })

  it('skips non-http protocols on outbound', () => {
    runAuto(scriptEl({ 'data-domain': 'auto.test', 'data-auto': 'outbound' }))
    beaconMock.mockClear()
    clickLink('mailto:hi@other.com')
    expect(beaconMock).not.toHaveBeenCalled()
  })

  it('emits File Download for known extensions when data-auto includes downloads', () => {
    runAuto(scriptEl({ 'data-domain': 'auto.test', 'data-auto': 'downloads' }))
    beaconMock.mockClear()
    clickLink('https://example.com/report.pdf')
    expect(bodies()[0]).toMatchObject({ n: 'File Download', p: { url: 'https://example.com/report.pdf' } })
  })

  it('honors a custom data-downloads-ext list', () => {
    runAuto(scriptEl({ 'data-domain': 'auto.test', 'data-auto': 'downloads', 'data-downloads-ext': 'epub' }))
    beaconMock.mockClear()
    clickLink('https://example.com/book.epub')
    expect(bodies()[0]).toMatchObject({ n: 'File Download', p: { url: 'https://example.com/book.epub' } })
  })

  it('emits a tagged event with data-takt-prop-* props', () => {
    runAuto(scriptEl({ 'data-domain': 'auto.test', 'data-auto': 'tagged' }))
    beaconMock.mockClear()
    const btn = document.createElement('button')
    btn.setAttribute('data-takt-event', 'Cta')
    btn.setAttribute('data-takt-prop-zone', 'hero')
    document.body.appendChild(btn)
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    btn.remove()
    expect(bodies()).toContainEqual(expect.objectContaining({ n: 'Cta', p: { zone: 'hero' } }))
  })

  it('refuses the reserved pageview name on tagged events', () => {
    runAuto(scriptEl({ 'data-domain': 'auto.test', 'data-auto': 'tagged' }))
    beaconMock.mockClear()
    const btn = document.createElement('button')
    btn.setAttribute('data-takt-event', 'pageview')
    document.body.appendChild(btn)
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    btn.remove()
    expect(beaconMock).not.toHaveBeenCalled()
  })

  it('emits a 404 event when the page carries the data-takt-404 marker', () => {
    document.body.setAttribute('data-takt-404', '')
    window.history.replaceState({}, '', 'https://example.com/missing')
    runAuto(scriptEl({ 'data-domain': 'auto.test', 'data-auto': '404' }))
    expect(bodies()).toContainEqual(expect.objectContaining({ n: '404', p: { path: '/missing' } }))
    document.body.removeAttribute('data-takt-404')
  })

  it('redacts the 404 path with data-redact-routes', () => {
    const marker = document.createElement('div')
    marker.setAttribute('data-takt-404', '')
    document.body.appendChild(marker)
    window.history.replaceState({}, '', 'https://example.com/reset/s3cr3t-token')
    try {
      runAuto(scriptEl({ 'data-domain': 'auto.test', 'data-auto': '404', 'data-redact-routes': '/reset/[token]' }))
      expect(bodies()).toContainEqual(expect.objectContaining({ n: '404', p: { path: '/reset/[token]' } }))
    } finally {
      marker.remove()
      window.history.replaceState({}, '', 'https://example.com/')
    }
  })

  it('redacts the outbound destination path with data-redact-routes, whatever the host', () => {
    runAuto(scriptEl({ 'data-domain': 'auto.test', 'data-auto': 'outbound', 'data-redact-routes': '/verify/[token]' }))
    beaconMock.mockClear()
    clickLink('https://partner.io/verify/abc123?x=1')
    expect(bodies()).toContainEqual(expect.objectContaining({ n: 'Outbound Link: Click', p: { url: 'https://partner.io/verify/[token]' } }))
  })

  it('redacts same-origin download paths with data-redact-routes', () => {
    runAuto(scriptEl({ 'data-domain': 'auto.test', 'data-auto': 'downloads', 'data-redact-routes': '/invoices/[id]' }))
    beaconMock.mockClear()
    clickLink('https://example.com/invoices/991.pdf')
    expect(bodies()).toContainEqual(expect.objectContaining({ n: 'File Download', p: { url: 'https://example.com/invoices/[id]' } }))
  })

  it('redacts download paths of files hosted on another domain with data-redact-routes', () => {
    runAuto(scriptEl({ 'data-domain': 'auto.test', 'data-auto': 'downloads', 'data-redact-routes': '/invoices/[id]' }))
    beaconMock.mockClear()
    clickLink('https://cdn.partner.io/invoices/991.pdf?sig=abc')
    expect(bodies()).toContainEqual(expect.objectContaining({ n: 'File Download', p: { url: 'https://cdn.partner.io/invoices/[id]' } }))
  })

  it('sends the redacted pageview path and no beacon carries the secret path segment', () => {
    window.history.replaceState({}, '', 'https://example.com/reset/SECRET-TOKEN?next=1')
    beaconMock.mockClear()
    try {
      runAuto(scriptEl({ 'data-domain': 'auto.test', 'data-auto': 'outbound,downloads', 'data-redact-routes': '/reset/[token]' }))
      clickLink('https://partner.io/verify/abc?token=SECRET-TOKEN')
      clickLink('https://example.com/files/report.pdf?token=SECRET-TOKEN')
      expect(bodies()).toContainEqual(expect.objectContaining({ n: 'pageview', u: 'https://example.com/reset/[token]' }))
      expect(bodies().length).toBeGreaterThanOrEqual(3)
      expect(JSON.stringify(beaconMock.mock.calls)).not.toContain('SECRET-TOKEN')
    } finally {
      window.history.replaceState({}, '', 'https://example.com/')
    }
  })

  it('masks the pageview of SPA navigation to a redacted route', () => {
    runAuto(scriptEl({ 'data-domain': 'auto.test', 'data-redact-routes': '/reset/[token]' }))
    beaconMock.mockClear()
    window.history.pushState({}, '', '/reset/SECRET-TOKEN?next=1')
    window.history.replaceState({}, '', '/reset/SECRET-TOKEN#step')
    expect(bodies()).toContainEqual(expect.objectContaining({ n: 'pageview', u: 'https://example.com/reset/[token]' }))
    expect(JSON.stringify(beaconMock.mock.calls)).not.toContain('SECRET-TOKEN')
  })

  it('ignores a second call on the same page so events are not sent twice', () => {
    runAuto(scriptEl({ 'data-domain': 'auto.test', 'data-auto': 'outbound' }))
    runAuto(scriptEl({ 'data-domain': 'auto.test', 'data-auto': 'outbound' }))
    expect(bodies().filter((b) => b.n === 'pageview')).toHaveLength(1)
    beaconMock.mockClear()
    clickLink('https://other.com/path')
    expect(beaconMock).toHaveBeenCalledTimes(1)
  })

  it('base then auto sends one pageview at load and one per navigation', () => {
    runSnippet(scriptEl({ 'data-domain': 'auto.test' }))
    runAuto(scriptEl({ 'data-domain': 'auto.test', 'data-auto': 'outbound' }))
    expect(pageviews()).toHaveLength(1)
    window.history.pushState({}, '', '/next')
    expect(pageviews()).toHaveLength(2)
    window.history.replaceState({}, '', '/later')
    expect(pageviews()).toHaveLength(3)
    beaconMock.mockClear()
    clickLink('https://other.com/path')
    expect(bodies().filter((b) => b.n === 'Outbound Link: Click')).toHaveLength(1)
  })

  it('auto then base sends one pageview at load and one per navigation', () => {
    runAuto(scriptEl({ 'data-domain': 'auto.test', 'data-auto': 'outbound' }))
    runSnippet(scriptEl({ 'data-domain': 'auto.test' }))
    expect(pageviews()).toHaveLength(1)
    window.history.pushState({}, '', '/next')
    expect(pageviews()).toHaveLength(2)
  })

  it('base then auto masks navigation to a redacted route', () => {
    runSnippet(scriptEl({ 'data-domain': 'auto.test' }))
    runAuto(scriptEl({ 'data-domain': 'auto.test', 'data-redact-routes': '/reset/[token]' }))
    beaconMock.mockClear()
    window.history.pushState({}, '', '/reset/SECRET-TOKEN')
    expect(pageviews()).toContainEqual(expect.objectContaining({ u: 'https://example.com/reset/[token]' }))
    expect(JSON.stringify(beaconMock.mock.calls)).not.toContain('SECRET-TOKEN')
  })

  it('fails closed when the mask returns nothing: the route is not sent', () => {
    window.history.replaceState({}, '', 'https://example.com/reset/SECRET-TOKEN')
    try {
      runSnippet(scriptEl({ 'data-domain': 'auto.test' }), () => null as unknown as string)
      expect(pageviews()).toContainEqual(expect.objectContaining({ u: '' }))
      expect(JSON.stringify(beaconMock.mock.calls)).not.toContain('SECRET-TOKEN')
    } finally {
      window.history.replaceState({}, '', 'https://example.com/')
    }
  })

  it('does not treat a pre-existing window.takt object as an installation', () => {
    const pageWindow = window as { takt?: unknown }
    pageWindow.takt = { takt_mask: () => null }
    runSnippet(scriptEl({ 'data-domain': 'auto.test' }))
    expect(pageviews()).toHaveLength(1)
  })

  it('does not treat a pre-existing window.takt with an m property as an installation', () => {
    const pageWindow = window as { takt?: unknown }
    pageWindow.takt = { m: () => null }
    runSnippet(scriptEl({ 'data-domain': 'auto.test' }))
    expect(pageviews()).toHaveLength(1)
  })

  it('installs over a foreign function that has no takt_mask', () => {
    const pageWindow = window as { takt?: unknown }
    pageWindow.takt = function foreign() {}
    runSnippet(scriptEl({ 'data-domain': 'auto.test' }))
    expect(pageviews()).toHaveLength(1)
    expect(typeof (pageWindow.takt as { takt_mask?: unknown }).takt_mask).toBe('function')
  })

  function pageviews(): Array<Record<string, unknown>> {
    return bodies().filter((b) => b.n === 'pageview')
  }
})
