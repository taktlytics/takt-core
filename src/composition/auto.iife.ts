import { runAuto } from './auto'

if (typeof document !== 'undefined') {
  const s = document.currentScript as HTMLScriptElement | null
  if (s) runAuto(s)
}
