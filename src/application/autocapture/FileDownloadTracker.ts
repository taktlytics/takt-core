import type { ClickSource } from '../ports/ClickSource'
import type { TrackOptions } from '../Analytics'
import type { UrlScrubber } from '../../domain/url/UrlScrubber'

export class FileDownloadTracker {
  static readonly DEFAULT_EXTENSIONS = [
    'pdf', 'zip', 'dmg', 'xlsx', 'csv', 'doc', 'docx', 'ppt', 'pptx',
    'rar', '7z', 'gz', 'mp3', 'mp4', 'wav', 'avi', 'mov',
  ]

  private readonly exts: string[]

  constructor(
    private readonly clickSource: ClickSource,
    private readonly track: (name: string, opts?: TrackOptions) => void,
    extensions?: string[],
    private readonly scrub: UrlScrubber = (url) => url,
  ) {
    this.exts =
      extensions && extensions.length > 0 ? extensions : FileDownloadTracker.DEFAULT_EXTENSIONS
  }

  enable(): () => void {
    return this.clickSource.onAnchorClick((a) => {
      if (!a.href) return
      let url: URL
      try { url = new URL(a.href) } catch { return }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return
      const match = url.pathname.toLowerCase().match(/\.([a-z0-9]+)$/)
      if (!match) return
      const ext = match[1]
      if (!this.exts.includes(ext)) return
      this.track('File Download', { props: { url: this.scrub(url.origin + url.pathname), extension: ext } })
    })
  }
}
