import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { runAuto } from '../../src/composition/auto'
import { FileDownloadTracker } from '../../src/application/autocapture/FileDownloadTracker'
import type { ClickSource } from '../../src/application/ports/ClickSource'
import type { TrackOptions } from '../../src/application/Analytics'
import { DEFAULT_DOWNLOAD_EXTENSIONS } from '../../src/domain/download/defaultExtensions'

const PROBES = [
  ...DEFAULT_DOWNLOAD_EXTENSIONS,
  'doc', 'ppt', 'html', 'htm', 'js', 'json', 'xml', 'css', 'php', 'ico', 'png', 'jpg', 'jpeg', 'webp', 'svg',
  'bin', 'iso', 'msi', 'pkg', 'deb', 'rpm', 'epub', 'tar', 'bz2', 'xz', 'webm', 'ogg', 'flac',
  'm4a', 'odt', 'ods', 'odp', 'rtf',
]

function anchor(href: string): HTMLAnchorElement {
  const a = document.createElement('a')
  a.href = href
  return a
}

function scriptEl(attrs: Record<string, string>): HTMLScriptElement {
  const s = document.createElement('script')
  for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v)
  return s
}

function sdkEmittedExtensions(): string[] {
  const handlers: Array<(a: HTMLAnchorElement, e: Event) => void> = []
  const source: ClickSource = {
    onAnchorClick: (cb) => { handlers.push(cb); return () => {} },
    onElementClick: () => () => {},
  }
  const emitted: string[] = []
  const track = (_name: string, opts?: TrackOptions) => {
    const url = opts?.props?.url ?? ''
    emitted.push(url.slice(url.lastIndexOf('.') + 1))
  }
  new FileDownloadTracker(source, track).enable()
  for (const ext of PROBES) for (const handler of handlers) handler(anchor(`https://example.com/file.${ext}`), new Event('click'))
  return emitted
}

describe('parité des extensions de téléchargement par défaut', () => {
  let beaconMock: ReturnType<typeof vi.fn>
  const pristineHistory = { pushState: history.pushState, replaceState: history.replaceState }

  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState({}, '', 'https://example.com/')
    beaconMock = vi.fn(() => true)
    vi.stubGlobal('navigator', { sendBeacon: beaconMock, doNotTrack: '0' })
    delete (window as { takt?: unknown }).takt
  })

  afterEach(() => {
    history.pushState = pristineHistory.pushState
    history.replaceState = pristineHistory.replaceState
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    delete (window as { takt?: unknown }).takt
  })

  it('takt.auto.js et le SDK suivent exactement la même liste par défaut', () => {
    runAuto(scriptEl({ 'data-domain': 'parity.test', 'data-auto': 'downloads' }))
    beaconMock.mockClear()
    for (const ext of PROBES) {
      const link = anchor(`https://example.com/file.${ext}`)
      link.addEventListener('click', (e) => e.preventDefault())
      document.body.appendChild(link)
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      link.remove()
    }
    const autoEmitted = (beaconMock.mock.calls as [string, string][])
      .map(([, body]) => JSON.parse(body) as { n: string; p?: { url: string } })
      .filter((b) => b.n === 'File Download')
      .map((b) => b.p!.url.slice(b.p!.url.lastIndexOf('.') + 1))

    const expected = PROBES.filter((ext) => DEFAULT_DOWNLOAD_EXTENSIONS.includes(ext))
    expect(autoEmitted.sort()).toEqual([...expected].sort())
    expect(sdkEmittedExtensions().sort()).toEqual([...expected].sort())
  })
})
