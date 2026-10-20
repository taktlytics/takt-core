import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { TextDecoder, TextEncoder } from 'node:util'
import { JSDOM } from 'jsdom'
import { describe, it, expect } from 'vitest'

const DIST = resolve('dist')

type Beacon = { url: string; body: Record<string, unknown> }
type TaktFn = ((name: string, opts?: unknown) => void) & { takt_mask?: (raw: string) => string }
type TaktWindow = Window & { takt?: unknown }

function loadBundle(file: string) {
  const source = readFileSync(join(DIST, file), 'utf8')
  expect(source).not.toContain('</script')
  const beacons: Beacon[] = []
  const dom = new JSDOM(
    `<!doctype html><html><head></head><body><script data-domain="shop.example" data-endpoint="https://ingest.example/api/event">${source}</script></body></html>`,
    {
      url: 'https://shop.example/',
      runScripts: 'dangerously',
      beforeParse(win) {
        Object.assign(win, { TextEncoder, TextDecoder })
        win.navigator.sendBeacon = (url: string, body?: BodyInit | null) => {
          beacons.push({ url, body: JSON.parse(String(body)) })
          return true
        }
      },
    },
  )
  return { win: dom.window as unknown as TaktWindow, beacons, close: () => dom.window.close() }
}

describe.each(['takt.js', 'takt.auto.js'])('%s chargé comme script classique', (file) => {
  it('laisse window.takt en fonction dotée de takt_mask', () => {
    const { win, close } = loadBundle(file)
    try {
      expect(typeof win.takt).toBe('function')
      expect(typeof (win.takt as TaktFn).takt_mask).toBe('function')
    } finally {
      close()
    }
  })

  it('envoie une URL non vide à la pageview suivant un pushState', () => {
    const { win, beacons, close } = loadBundle(file)
    try {
      win.history.pushState({}, '', '/pricing')
      const pageviews = beacons.filter((b) => b.body.n === 'pageview')
      expect(pageviews).toHaveLength(2)
      expect(pageviews[1].body.u).toBe('https://shop.example/pricing')
    } finally {
      close()
    }
  })

  it('émet takt(Signup) avec une URL non vide', () => {
    const { win, beacons, close } = loadBundle(file)
    try {
      const takt = win.takt as TaktFn
      takt('Signup')
      const signup = beacons.find((b) => b.body.n === 'Signup')
      expect(signup?.body.u).toBe('https://shop.example/')
    } finally {
      close()
    }
  })
})
