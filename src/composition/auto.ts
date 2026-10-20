import { runSnippet } from './snippet'
import { readTaggedEvent } from '../domain/event/tagged'
import createRouteRedaction from '../domain/url/RouteRedaction'
import { NotFoundTracker } from '../application/autocapture/NotFoundTracker'
import { DEFAULT_DOWNLOAD_EXTENSIONS } from '../domain/download/defaultExtensions'

type Props = Record<string, string>
type TaktFn = (name: string, opts?: { props?: Props }) => void
type AutoTakt = TaktFn & { auto?: true }

const DEFAULT_EXT = DEFAULT_DOWNLOAD_EXTENSIONS.join(',')

// runAuto = tracker de base (runSnippet : pageview, SPA, window.takt, vie privée)
// + extensions automatiques opt-in déclarées dans data-auto : clics sortants,
// téléchargements, événements HTML (tagged) et erreurs 404. Tout passe par
// window.takt posé par runSnippet, donc opt-out / DNT / exclusion localhost
// s'appliquent uniformément ; le nom réservé « pageview » y est déjà refusé.
export function runAuto(el: HTMLScriptElement | null): void {
  if ((window as unknown as { takt?: AutoTakt }).takt?.auto) return
  const get = (k: string) => (el ? el.getAttribute(k) : null)
  const routes = createRouteRedaction({
    redactRoutes: (get('data-redact-routes') || '').split(','),
    redactUndecodablePaths: get('data-redact-undecodable-paths') !== 'false',
  })
  runSnippet(el, routes.page)
  const takt = (window as unknown as { takt?: AutoTakt }).takt
  if (!takt) return
  takt.auto = true

  const auto = (get('data-auto') || '').split(',').map((s) => s.trim()).filter(Boolean)
  const on = (k: string) => auto.includes(k)
  const outbound = on('outbound')
  const downloads = on('downloads')
  const tagged = on('tagged')

  if (outbound || downloads || tagged) {
    const exts = (get('data-downloads-ext') || DEFAULT_EXT)
      .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    const fileRe = new RegExp('\\.(' + exts.join('|') + ')$')

    document.addEventListener(
      'click',
      (e) => {
        const t = e.target as Element | null

        if (tagged) {
          const ev = readTaggedEvent(t)
          if (ev) takt(ev.name, ev.props ? { props: ev.props } : undefined)
        }

        if (!outbound && !downloads) return
        const a = t?.closest?.('a') as HTMLAnchorElement | null
        if (!a?.href) return
        let url: URL
        try { url = new URL(a.href) } catch { return }
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return
        const destination = url.origin + routes.pattern(url.pathname)
        if (outbound && url.hostname !== location.hostname) {
          takt('Outbound Link: Click', { props: { url: destination } })
        }
        if (downloads && fileRe.test(url.pathname.toLowerCase())) {
          takt('File Download', { props: { url: destination } })
        }
      },
      true,
    )
  }

  if (on('404')) new NotFoundTracker(takt, routes.path).enable()
}

if (typeof document !== 'undefined') {
  const s = document.currentScript as HTMLScriptElement | null
  if (s) runAuto(s)
}
