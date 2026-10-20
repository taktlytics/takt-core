import { describe, expect, it } from 'vitest'
import createRouteRedaction from '../../src/domain/url/RouteRedaction'

const mask = (pattern: string, path: string) => createRouteRedaction({ redactRoutes: [pattern] }).path(path)
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const BUDGET_MS = 50
const LONG = 'a'.repeat(255) + '!'

describe('grammaire des contraintes : cas légitimes', () => {
  it.each([
    ['/n/{id<\\d+>}', '/n/42', '/n/{id}'],
    ['/n/{id<\\d+>}', '/n/4a', '/n/4a'],
    ['/s/{slug<[a-z0-9-]+>}', '/s/hello-2', '/s/{slug}'],
    [`/u/{id<${UUID}>}`, '/u/123e4567-e89b-12d3-a456-426614174000', '/u/{id}'],
    ['/l/{lang<fr|en>}', '/l/fr', '/l/{lang}'],
    ['/l/{lang<fr|en>}', '/l/en', '/l/{lang}'],
    ['/l/{lang<fr|en>}', '/l/de', '/l/de'],
    ['/l/{lang<fr|en>}', '/l/EN', '/l/{lang}'],
    ['/x/{id<a|bc>}', '/x/ab', '/x/ab'],
    ['/c/{id<a*b+>}', '/c/aab', '/c/{id}'],
    ['/c/{id<a{8}b{8}c{8}>}', `/c/${'a'.repeat(8)}${'b'.repeat(8)}${'c'.repeat(8)}`, '/c/{id}'],
    ['/c/{id<a.c>}', '/c/abc', '/c/{id}'],
    ['/c/{id<[^a]+>}', '/c/bc', '/c/{id}'],
    ['/c/{id<[\\w-]+>}', '/c/a-b', '/c/{id}'],
    ['/c/{id<[-a]+>}', '/c/-a', '/c/{id}'],
    ['/c/{id<\\.\\-x>}', '/c/.-x', '/c/{id}'],
  ])('%s avec %s', (pattern, path, expected) => {
    expect(mask(pattern, path)).toBe(expected)
  })
})

describe('grammaire des contraintes : rejet fail-closed', () => {
  it.each([
    '(a|a)*',
    '((a)+)+',
    '(a)',
    '*a',
    'a**',
    'a*?',
    'a*+',
    'a{101}',
    'a{1000}',
    'a{3,2}',
    'a{,3}',
    'a{2',
    'a*b*c*',
    '[]',
    '[^]',
    '[!-~]',
    '[b-a]',
    '[a/]',
    '[^/]',
    '\\b',
    '\\1',
    '\\k',
    '\\/',
    'a|',
    '|a',
    'a||b',
    'a^',
    'a$',
    'a\\',
    'a<b',
    '.{1}*',
  ])('la contrainte %s rend /[redacted] sur un chemin correspondant', (constraint) => {
    expect(mask(`/x/{id<${constraint}>}`, '/x/aaa')).toBe('/[redacted]')
  })

  it('rejette une contrainte de 101 caractères', () => {
    expect(mask(`/x/{id<${'a'.repeat(101)}>}`, `/x/${'a'.repeat(101)}`)).toBe('/[redacted]')
  })

  it('rejette une contrainte vide', () => {
    expect(mask('/x/{id<>}', '/x/aaa')).toBe('/[redacted]')
  })

  it('ne rend pas /[redacted] pour un chemin qui ne correspond pas à la route', () => {
    expect(mask('/x/{id<(a)>}', '/y/aaa')).toBe('/y/aaa')
  })
})

describe('grammaire des contraintes : bornes', () => {
  it('garde les 100 caractères et deux quantificateurs variables', () => {
    expect(mask(`/x/{id<${'a'.repeat(100)}>}`, `/x/${'a'.repeat(100)}`)).toBe('/x/{id}')
    expect(mask('/x/{id<a{1,100}b{0,}>}', `/x/${'a'.repeat(3)}bb`)).toBe('/x/{id}')
  })

  it('refuse un segment de plus de 256 caractères face à un paramètre contraint', () => {
    expect(mask('/x/{id<\\d+>}', `/x/${'1'.repeat(257)}`)).toBe('/[redacted]')
  })

  it('accepte un segment de 256 caractères face à un paramètre contraint', () => {
    expect(mask('/x/{id<\\d+>}', `/x/${'1'.repeat(256)}`)).toBe('/x/{id}')
  })
})

describe('grammaire des contraintes : garde contre le franchissement de /', () => {
  it('ne laisse pas \\S+ traverser un slash', () => {
    expect(mask('/x/{id<\\S+>}', '/x/a/b')).toBe('/x/a/b')
  })

  it('ne laisse pas [^a]+ traverser un slash', () => {
    expect(mask('/x/{id<[^a]+>}', '/x/b/c')).toBe('/x/b/c')
  })
})

describe('grammaire des contraintes : temps borné sur 256 caractères', () => {
  it.each([
    ['\\w*\\w*'],
    ['a*a+'],
    ['(a|a)*'],
    ['((a)+)+'],
  ])('la contrainte %s reste sous %i ms', (constraint) => {
    const redaction = createRouteRedaction({ redactRoutes: [`/x/{id<${constraint}>}`] })
    const start = performance.now()
    redaction.path(`/x/${LONG}`)
    expect(performance.now() - start).toBeLessThan(BUDGET_MS)
  })
})
