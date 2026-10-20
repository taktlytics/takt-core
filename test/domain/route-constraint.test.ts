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
    ['/c/{id<[a-z-]+>}', '/c/a-b-', '/c/{id}'],
    ['/c/{id<[\\d-]+>}', '/c/1-2', '/c/{id}'],
    ['/c/{id<[a-]+>}', '/c/a-a', '/c/{id}'],
    ['/n/{id<.+>}', `/n/${'é'.repeat(128)}`, '/n/{id}'],
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
    '[\\d-z]',
    '[a-\\d]',
    '[--a]',
    '[a--]',
    '[--]',
    '[!--]',
    '[a-z-0]',
    '[][a]',
    '[]a]',
    '[.]',
    '[$]',
    '[(]',
    '[{]',
    '[}]',
    '[|]',
    '[*]',
    '[+]',
    '[?]',
    '[a^]',
    '[<]',
    '[>]',
    '\\0',
    '\\01',
    'é',
    'a\tb',
    'a\x7f',
  ])('la contrainte %s rend /[redacted] sur un chemin correspondant', (constraint) => {
    expect(mask(`/x/{id<${constraint}>}`, '/x/aaa')).toBe('/[redacted]')
  })

  it('rejette une contrainte de 101 caractères', () => {
    expect(mask(`/x/{id<${'a'.repeat(101)}>}`, `/x/${'a'.repeat(101)}`)).toBe('/[redacted]')
  })

  it('rejette une contrainte vide', () => {
    expect(mask('/x/{id<>}', '/x/aaa')).toBe('/[redacted]')
  })

  it('masque un segment à accolades non reconnu, même si la contrainte contient un >', () => {
    expect(mask('/x/{id<[>]>}', '/x/aaa')).toBe('/[redacted]')
    expect(mask('/x/{id<[>]/a>}', '/x/zz/a')).toBe('/[redacted]')
  })

  it('ne rend pas /[redacted] pour un chemin qui ne correspond pas à la route', () => {
    expect(mask('/x/{id<(a)>}', '/y/aaa')).toBe('/y/aaa')
  })
})

describe('grammaire des contraintes : bornes', () => {
  it('compte la longueur du segment en octets UTF-8', () => {
    expect(mask('/n/{id<.+>}', `/n/${'é'.repeat(129)}`)).toBe('/[redacted]')
    expect(mask('/n/{id<.+>}', `/n/${'é'.repeat(128)}`)).toBe('/n/{id}')
  })

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

describe('bornes par route et par segment', () => {
  it('rejette 3 quantificateurs variables répartis sur la route', () => {
    expect(mask('/x/{a<a*>}/{b<a*>}/{c<a*>}', '/x/a/a/a')).toBe('/[redacted]')
  })

  it('accepte 2 quantificateurs variables répartis sur la route', () => {
    expect(mask('/x/{a<a*>}/{b<a*>}', '/x/a/a')).toBe('/x/{a}/{b}')
  })

  it('rejette 2 paramètres contraints adjacents dans un même segment', () => {
    expect(mask('/x/{a<\\d>}{b<\\d>}', '/x/12')).toBe('/[redacted]')
  })

  it('rejette 6 paramètres contraints adjacents, rapidement', () => {
    const start = performance.now()
    expect(mask('/x/{a<a*>}{b<a*>}{c<a*>}{d<a*>}', `/x/${'a!'.repeat(200)}`)).toBe('/[redacted]')
    expect(performance.now() - start).toBeLessThan(BUDGET_MS)
  })

  it('rejette 4 paramètres non contraints adjacents, rapidement', () => {
    const start = performance.now()
    expect(mask('/x/{a}{b}{c}{d}', `/x/${'a'.repeat(200)}!`)).toBe('/[redacted]')
    expect(performance.now() - start).toBeLessThan(BUDGET_MS)
    const failing = performance.now()
    expect(mask('/x/{a}{b}{c}{d}', `/x/${'a'.repeat(200)}/b`)).toBe(`/x/${'a'.repeat(200)}/b`)
    expect(performance.now() - failing).toBeLessThan(BUDGET_MS)
  })

  it('rejette 3 quantificateurs variables dans un même segment', () => {
    expect(mask('/x/{a<\\w*\\w*>}{b}', '/x/aa')).toBe('/[redacted]')
  })

  it('accepte deux paramètres non contraints dans un même segment', () => {
    expect(mask('/x/{a}{b}', '/x/ab')).toBe('/x/{a}{b}')
  })

  it('pire cas accepté : 2 quantificateurs variables sur 256 octets, sous 50 ms', () => {
    const start = performance.now()
    expect(mask('/x/{a<\\w*\\w*>}', `/x/${LONG}`)).toBe(`/x/${LONG}`)
    expect(performance.now() - start).toBeLessThan(BUDGET_MS)
  })
})

describe('parité octets UTF-8 (PCRE sans u)', () => {
  it('.{2} correspond à é, qui fait 2 octets', () => {
    expect(mask('/x/{id<.{2}>}', '/x/é')).toBe('/x/{id}')
  })

  it('.{2} ne correspond pas à un emoji, qui fait 4 octets', () => {
    expect(mask('/x/{id<.{2}>}', '/x/🙂')).toBe('/x/🙂')
  })

  it('.{2} correspond au NBSP, qui fait 2 octets', () => {
    expect(mask('/x/{id<.{2}>}', '/x/ ')).toBe('/x/{id}')
  })

  it('[^a]{2} correspond à é', () => {
    expect(mask('/x/{id<[^a]{2}>}', '/x/é')).toBe('/x/{id}')
  })

  it('\\s ne correspond pas au NBSP', () => {
    expect(mask('/x/{id<\\s>}', '/x/ ')).toBe('/x/ ')
  })

  it('\\s correspond à l\'espace ASCII', () => {
    expect(mask('/x/{id<\\s>}', '/x/ ')).toBe('/x/{id}')
  })

  it('\\S{2}, \\W{2} et \\D{2} voient les octets de é', () => {
    expect(mask('/x/{id<\\S{2}>}', '/x/é')).toBe('/x/{id}')
    expect(mask('/x/{id<\\W{2}>}', '/x/é')).toBe('/x/{id}')
    expect(mask('/x/{id<\\D{2}>}', '/x/é')).toBe('/x/{id}')
  })

  it('une littérale Ã (C3 83) ne se replie pas sur l\'octet E3 de ッ (E3 83 83)', () => {
    expect(mask('/x/Ã{p}', '/x/ッ')).toBe('/x/ッ')
  })
})

describe('forme des routes inutilisables', () => {
  it('masque le chemin de même forme quand une autre contrainte de la route est invalide', () => {
    expect(mask('/x/{p<\\d>}/{q<[z-a]>}', '/x/abc/q')).toBe('/[redacted]')
  })

  it.each([
    ['[\\d-z]'],
    ['a{3,2}'],
    ['\\/'],
    ['a\u0001'],
  ])('une contrainte invalide %s rend la route entière inutilisable', (constraint) => {
    expect(mask(`/x/{p<\\d>}/{q<${constraint}>}`, '/x/abc/q')).toBe('/[redacted]')
  })

  it('. se compile en [^/] : le saut de ligne est un octet ordinaire', () => {
    expect(mask('/x/{p<.{3}>}', '/x/a%0Ab')).toBe('/x/{p}')
  })

  it('une contrainte en ligne reste dans la regex de route', () => {
    expect(mask('/x/{p<\\d+>}x{q}', '/x/1x2x3')).toBe('/x/{p}x{q}')
  })
})
