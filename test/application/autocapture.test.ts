import { describe, it, expect } from 'vitest'
import { OutboundLinkTracker } from '../../src/application/autocapture/OutboundLinkTracker'
import { FileDownloadTracker } from '../../src/application/autocapture/FileDownloadTracker'
import { NotFoundTracker } from '../../src/application/autocapture/NotFoundTracker'
import { TaggedEventTracker } from '../../src/application/autocapture/TaggedEventTracker'
import type { ClickSource } from '../../src/application/ports/ClickSource'
import type { EnvironmentProvider } from '../../src/application/ports/EnvironmentProvider'
import type { TrackOptions } from '../../src/application/Analytics'

// --- Fakes ---
function fakeClick() {
  let cb: ((a: HTMLAnchorElement, e: Event) => void) | null = null
  let elCb: ((t: Element, e: Event) => void) | null = null
  const source: ClickSource = {
    onAnchorClick: (handler) => { cb = handler; return () => { cb = null } },
    onElementClick: (handler) => { elCb = handler; return () => { elCb = null } },
  }
  return {
    source,
    trigger: (a: HTMLAnchorElement) => cb?.(a, new Event('click')),
    triggerEl: (t: Element) => elCb?.(t, new Event('click')),
  }
}

function fakeEnv(hostname = 'example.com'): EnvironmentProvider {
  return {
    hostname: () => hostname,
    path: () => '/',
    url: () => `https://${hostname}/`,
    referrer: () => '',
    width: () => 1280,
  }
}

function link(href: string): HTMLAnchorElement {
  const a = document.createElement('a')
  a.href = href
  return a
}

describe('OutboundLinkTracker', () => {
  it('fires Outbound Link: Click for a cross-host anchor', () => {
    const { source, trigger } = fakeClick()
    const calls: [string, TrackOptions?][] = []
    const tracker = new OutboundLinkTracker(source, fakeEnv('example.com'), (n, o) => calls.push([n, o]))
    tracker.enable()
    trigger(link('https://other.com/page'))
    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toBe('Outbound Link: Click')
    expect(calls[0][1]?.props?.url).toBe('https://other.com/page')
  })

  it('ignores same-host anchors', () => {
    const { source, trigger } = fakeClick()
    const calls: [string, TrackOptions?][] = []
    new OutboundLinkTracker(source, fakeEnv('example.com'), (n, o) => calls.push([n, o])).enable()
    trigger(link('https://example.com/internal'))
    expect(calls).toHaveLength(0)
  })

  it('ignores anchors with no href', () => {
    const { source, trigger } = fakeClick()
    const calls: [string, TrackOptions?][] = []
    new OutboundLinkTracker(source, fakeEnv('example.com'), (n, o) => calls.push([n, o])).enable()
    trigger(document.createElement('a')) // no href
    expect(calls).toHaveLength(0)
  })
})

describe('FileDownloadTracker', () => {
  it('fires File Download for a matching extension', () => {
    const { source, trigger } = fakeClick()
    const calls: [string, TrackOptions?][] = []
    new FileDownloadTracker(source, (n, o) => calls.push([n, o]), ['pdf', 'zip']).enable()
    trigger(link('https://example.com/report.pdf'))
    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toBe('File Download')
    expect(calls[0][1]?.props?.extension).toBe('pdf')
    expect(calls[0][1]?.props?.url).toContain('report.pdf')
  })

  it('ignores non-matching extensions', () => {
    const { source, trigger } = fakeClick()
    const calls: [string, TrackOptions?][] = []
    new FileDownloadTracker(source, (n, o) => calls.push([n, o]), ['pdf']).enable()
    trigger(link('https://example.com/page.html'))
    expect(calls).toHaveLength(0)
  })

  it('is case-insensitive for extension matching', () => {
    const { source, trigger } = fakeClick()
    const calls: [string, TrackOptions?][] = []
    new FileDownloadTracker(source, (n, o) => calls.push([n, o]), ['pdf']).enable()
    trigger(link('https://example.com/Report.PDF'))
    expect(calls).toHaveLength(1)
  })

  it('uses DEFAULT_FILE_EXTENSIONS when none provided', () => {
    const { source, trigger } = fakeClick()
    const calls: [string, TrackOptions?][] = []
    new FileDownloadTracker(source, (n, o) => calls.push([n, o])).enable()
    trigger(link('https://example.com/archive.zip'))
    expect(calls).toHaveLength(1)
  })
})

describe('NotFoundTracker', () => {
  it('emits 404 with the path when a marker element is present', () => {
    const marker = document.createElement('div')
    marker.setAttribute('data-takt-404', '')
    document.body.appendChild(marker)
    const calls: [string, TrackOptions?][] = []
    new NotFoundTracker((n, o) => calls.push([n, o])).enable()
    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toBe('404')
    expect(calls[0][1]?.props?.path).toBe(location.pathname)
    marker.remove()
  })

  it('emits 404 when a takt:404 meta tag is present', () => {
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'takt:404')
    document.head.appendChild(meta)
    const calls: [string, TrackOptions?][] = []
    new NotFoundTracker((n, o) => calls.push([n, o])).enable()
    expect(calls).toHaveLength(1)
    meta.remove()
  })

  it('does nothing without a marker or 404 status', () => {
    const calls: [string, TrackOptions?][] = []
    new NotFoundTracker((n, o) => calls.push([n, o])).enable()
    expect(calls).toHaveLength(0)
  })
})

describe('TaggedEventTracker', () => {
  it('fires the tagged event name with data-takt-prop-* props', () => {
    const { source, triggerEl } = fakeClick()
    const calls: [string, TrackOptions?][] = []
    new TaggedEventTracker(source, (n, o) => calls.push([n, o])).enable()
    const btn = document.createElement('button')
    btn.setAttribute('data-takt-event', 'Cta')
    btn.setAttribute('data-takt-prop-zone', 'hero')
    triggerEl(btn)
    expect(calls).toEqual([['Cta', { props: { zone: 'hero' } }]])
  })

  it('does nothing for elements without data-takt-event', () => {
    const { source, triggerEl } = fakeClick()
    const calls: [string, TrackOptions?][] = []
    new TaggedEventTracker(source, (n, o) => calls.push([n, o])).enable()
    triggerEl(document.createElement('span'))
    expect(calls).toHaveLength(0)
  })

  it('disposer stops further events', () => {
    const { source, triggerEl } = fakeClick()
    const calls: [string, TrackOptions?][] = []
    const dispose = new TaggedEventTracker(source, (n, o) => calls.push([n, o])).enable()
    const btn = document.createElement('button')
    btn.setAttribute('data-takt-event', 'Cta')
    dispose()
    triggerEl(btn)
    expect(calls).toHaveLength(0)
  })
})

describe('autocapture URL scrubbing', () => {
  const redactTokens = (raw: string) => raw.replace(/\/verify\/[^/]+/, '/verify/:token')

  it('OutboundLinkTracker passes props.url through the scrubber', () => {
    const { source, trigger } = fakeClick()
    const calls: [string, TrackOptions?][] = []
    new OutboundLinkTracker(source, fakeEnv('example.com'), (n, o) => calls.push([n, o]), redactTokens).enable()
    trigger(link('https://other.com/verify/abc123?x=1'))
    expect(calls[0][1]?.props?.url).toBe('https://other.com/verify/:token')
  })

  it('FileDownloadTracker passes props.url through the scrubber', () => {
    const { source, trigger } = fakeClick()
    const calls: [string, TrackOptions?][] = []
    new FileDownloadTracker(source, (n, o) => calls.push([n, o]), ['pdf'], redactTokens).enable()
    trigger(link('https://example.com/verify/abc123/report.pdf'))
    expect(calls[0][1]?.props?.url).toBe('https://example.com/verify/:token/report.pdf')
    expect(calls[0][1]?.props?.extension).toBe('pdf')
  })
})
