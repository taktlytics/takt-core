import { runSnippet } from './snippet'
import { readTaggedEvent } from '../domain/event/tagged'
import createRouteRedaction from '../domain/url/RouteRedaction'
import { NotFoundTracker } from '../application/autocapture/NotFoundTracker'

type Props = Record<string, string>
type TaktFn = (name: string, opts?: { props?: Props }) => void

// Liste d'extensions de fichiers considérées comme téléchargements (surchargée
// par data-downloads-ext). Volontairement large : documents, archives, médias.
const DEFAULT_EXT = 'pdf,xlsx,docx,pptx,csv,zip,gz,rar,7z,dmg,exe,apk,mp3,mp4,wav,mov,avi,mkv,txt'

// runAuto = tracker de base (runSnippet : pageview, SPA, window.takt, vie privée)
// + extensions automatiques opt-in déclarées dans data-auto : clics sortants,
// téléchargements, événements HTML (tagged) et erreurs 404. Tout passe par
// window.takt posé par runSnippet, donc opt-out / DNT / exclusion localhost
// s'appliquent uniformément ; le nom réservé « pageview » y est déjà refusé.
export function runAuto(el: HTMLScriptElement | null): void {
  runSnippet(el)
  const get = (k: string) => (el ? el.getAttribute(k) : null)
  const takt = (window as unknown as { takt?: TaktFn }).takt
  if (!takt) return

  const auto = (get('data-auto') || '').split(',').map((s) => s.trim()).filter(Boolean)
  const on = (k: string) => auto.includes(k)
  const outbound = on('outbound')
  const downloads = on('downloads')
  const tagged = on('tagged')
  const routes = createRouteRedaction({ redactRoutes: (get('data-redact-routes') || '').split(',') })

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
        const dest = url.origin + url.pathname
        if (outbound && url.hostname !== location.hostname) {
          takt('Outbound Link: Click', { props: { url: url.origin + routes.pattern(url.pathname) } })
        }
        if (downloads && fileRe.test(url.pathname.toLowerCase())) {
          takt('File Download', { props: { url: routes.link(dest, location.href) } })
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
