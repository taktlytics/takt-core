type Emit = (name: string, opts?: { props?: Record<string, string> }) => void

/**
 * Detects a 404 page once and reports it as a `404` event with `{ path }`.
 *
 * Detection is hybrid: an explicit marker (`[data-takt-404]` element or
 * `<meta name="takt:404">`) covers error pages served with a 200 status (the
 * common SPA/SSR case), while the real HTTP status is read from Navigation
 * Timing (`responseStatus`, recent Chromium) for true server 404s.
 */
export class NotFoundTracker {
  constructor(
    private readonly emit: Emit,
    private readonly redactPath: (path: string) => string = (path) => path,
  ) {}

  enable(): () => void {
    if (typeof document === 'undefined') return () => {}

    let is404 = !!document.querySelector('[data-takt-404],meta[name="takt:404"]')
    if (!is404) {
      try {
        const nav = performance.getEntriesByType('navigation')[0] as
          | (PerformanceNavigationTiming & { responseStatus?: number })
          | undefined
        if (nav?.responseStatus === 404) is404 = true
      } catch {
        /* Navigation Timing unavailable — rely on the marker only. */
      }
    }
    if (is404) this.emit('404', { props: { path: this.redactPath(location.pathname) } })

    return () => {}
  }
}
