import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { runAuto } from '../../src/composition/auto'

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
  link.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  link.remove()
}

describe('runAuto', () => {
  let beaconMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState({}, '', 'https://example.com/')
    beaconMock = vi.fn(() => true)
    vi.stubGlobal('navigator', { sendBeacon: beaconMock, doNotTrack: '0' })
    delete (window as { takt?: unknown }).takt
  })

  afterEach(() => {
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
      runAuto(scriptEl({ 'data-domain': 'leak.test', 'data-auto': 'outbound,downloads', 'data-redact-routes': '/reset/[token]' }))
      clickLink('https://partner.io/verify/abc?token=SECRET-TOKEN')
      clickLink('https://example.com/files/report.pdf?token=SECRET-TOKEN')
      const own = bodies().filter((b) => b.d === 'leak.test')
      expect(own).toContainEqual(expect.objectContaining({ n: 'pageview', u: 'https://example.com/reset/[token]' }))
      expect(own.length).toBeGreaterThanOrEqual(3)
      expect(JSON.stringify(own)).not.toContain('SECRET-TOKEN')
    } finally {
      window.history.replaceState({}, '', 'https://example.com/')
    }
  })
})
