import { describe, it, expect } from 'vitest'
import createRouteRedaction, { canonicalRoute } from '../../src/domain/url/RouteRedaction'

const PAGE = 'https://example.com/verify/abc123?next=%2Fapp#top'

describe('canonicalRoute', () => {
  it.each([
    ['/verify/[token]', '/verify/[token]'],
    ['/(auth)/verify/[token]', '/verify/[token]'],
    ['/users/:id(\\d+)', '/users/:id'],
    ['/users/:id?', '/users/:id'],
    ['/files/:path*', '/files/:path'],
    ['/docs/**', '/docs/*'],
    ['verify/:token/', '/verify/:token'],
    ['/(marketing)', '/'],
    ['/orders/{id}', '/orders/{id}'],
    ['/posts/{page?}', '/posts/{page}'],
    ['/orders/{id<\\d+>}', '/orders/{id}'],
    ['/users/{id?<\\d+>}', '/users/{id}'],
    ['', '/'],
  ])('%s becomes %s', (template, expected) => {
    expect(canonicalRoute(template)).toBe(expected)
  })
})

describe('createRouteRedaction', () => {
  describe('redactRoutes', () => {
    it.each([
      ['/verify/[token]', '/verify/abc123', '/verify/[token]'],
      ['/verify/:token', '/verify/abc123', '/verify/:token'],
      ['/verify/[token]', '/verify/abc123/', '/verify/[token]'],
      ['/(auth)/reset/[code]', '/reset/xyz', '/reset/[code]'],
      ['/orders/[id=integer]', '/orders/42', '/orders/[id=integer]'],
      ['/p/[slug]-[id]', '/p/shoes-42', '/p/[slug]-[id]'],
      ['/share/[...rest]', '/share/a/b/c', '/share/[...rest]'],
      ['/share/*', '/share/a/b', '/share/*'],
      ['/share/*rest', '/share/a/b', '/share/*rest'],
      ['/[[lang]]/invite/[code]', '/fr/invite/k9', '/[[lang]]/invite/[code]'],
      ['/[[lang]]/invite/[code]', '/invite/k9', '/[[lang]]/invite/[code]'],
      ['/users/:id?', '/users', '/users/:id'],
      ['/users/:id(\\d+)', '/users/7', '/users/:id'],
      ['/users/:id(\\d+)?', '/users', '/users/:id'],
      ['/orders/{id}', '/orders/123', '/orders/{id}'],
      ['/posts/{page?}', '/posts', '/posts/{page}'],
      ['/posts/{page?}', '/posts/3', '/posts/{page}'],
      ['/orders/{id<\\d+>}', '/orders/123', '/orders/{id}'],
      ['/users/{id?<\\d+>}', '/users', '/users/{id}'],
    ])('%s rewrites %s to %s',(pattern, path, expected) => {
      expect(createRouteRedaction({ redactRoutes: [pattern] }).path(path)).toBe(expected)
    })

    it.each([
      ['/verify/[token]', '/verify'],
      ['/verify/[token]', '/verify/a/b'],
      ['/verify/[token]', '/verifyx/abc'],
      ['/verify/:token', '/other/abc'],
      ['/p/[slug]-[id]', '/p/shoes'],
      ['/orders/[id]', '/orders%252F123/items'],
      ['/orders/[id]', '/orders/%2e%2e/123'],
      ['/orders/{id}', '/orders'],
      ['/orders/{id}', '/orders/1/2'],
      ['/orders/{id<\\d+>}', '/orders/abc'],
      ['/orders/{id<\\d+>}', '/orders/12a'],
      ['/x/{id<a|b>}', '/x/ab'],
      ['/x/{id<a|b>}', '/x/ba'],
      ['/posts/{page?<\\d+>}', '/posts/abc'],
      ['/p/{a<\\d+>}-{b}', '/p/x-y'],
    ])('%s leaves %s untouched',(pattern, path) => {
      expect(createRouteRedaction({ redactRoutes: [pattern] }).path(path)).toBe(path)
    })

    it('uses the first matching pattern', () => {
      const routes = createRouteRedaction({ redactRoutes: ['/verify/email', '/verify/[token]'] })
      expect(routes.path('/verify/email')).toBe('/verify/email')
      expect(routes.path('/verify/abc')).toBe('/verify/[token]')
    })

    it('drops the query and hash of a masked page URL', () => {
      const routes = createRouteRedaction({ redactRoutes: ['/verify/[token]'] })
      expect(routes.page(PAGE)).toBe('https://example.com/verify/[token]')
    })

    it('keeps the query and hash of an unmatched page URL', () => {
      const routes = createRouteRedaction({ redactRoutes: ['/verify/[token]'] })
      expect(routes.page('https://example.com/pricing?next=%2Fapp#top')).toBe('https://example.com/pricing?next=%2Fapp#top')
    })

    it('leaves unmatched and unparsable URLs untouched', () => {
      const routes = createRouteRedaction({ redactRoutes: ['/verify/[token]'] })
      expect(routes.page('https://example.com/pricing')).toBe('https://example.com/pricing')
      expect(routes.page('not a url')).toBe('not a url')
    })

    it('rewrites same-origin links and leaves other origins alone', () => {
      const routes = createRouteRedaction({ redactRoutes: ['/invoices/[id]'] })
      expect(routes.link('https://example.com/invoices/991.pdf', PAGE)).toBe('https://example.com/invoices/[id]')
      expect(routes.link('https://cdn.io/invoices/991', PAGE)).toBe('https://cdn.io/invoices/991')
    })

    it('rewrites a same-origin referrer and keeps an external one', () => {
      const routes = createRouteRedaction({ redactRoutes: ['/verify/[token]'] })
      expect(routes.referrer('https://example.com/verify/abc', PAGE)).toBe('https://example.com/verify/[token]')
      expect(routes.referrer('https://google.com/verify/abc', PAGE)).toBe('https://google.com/verify/abc')
      expect(routes.referrer('', PAGE)).toBe('')
    })

    it('ignores blank patterns', () => {
      const routes = createRouteRedaction({ redactRoutes: ['', '  '] })
      expect(routes.path('/anything')).toBe('/anything')
    })
  })

  describe('routeTemplates', () => {
    it('sends the template of the current route for every page', () => {
      const routes = createRouteRedaction({ routeTemplates: true, routeTemplate: () => '/(auth)/verify/[token]' })
      expect(routes.templated).toBe(true)
      expect(routes.page(PAGE)).toBe('https://example.com/verify/[token]')
    })

    it('falls back to redactRoutes, then to the real path, when the router has no template', () => {
      const routes = createRouteRedaction({
        routeTemplates: true,
        routeTemplate: () => null,
        redactRoutes: ['/verify/[token]'],
      })
      expect(routes.page(PAGE)).toBe('https://example.com/verify/[token]')
      expect(routes.page('https://example.com/about')).toBe('https://example.com/about')
    })

    it('survives a resolver that throws', () => {
      const routes = createRouteRedaction({
        routeTemplates: true,
        routeTemplate: () => {
          throw new Error('router not ready')
        },
      })
      expect(routes.page('https://example.com/a')).toBe('https://example.com/a')
    })

    it('drops the path of a same-origin referrer, whose template is unknown', () => {
      const routes = createRouteRedaction({ routeTemplates: true, routeTemplate: () => '/x' })
      expect(routes.referrer('https://example.com/verify/abc?x=1', PAGE)).toBe('https://example.com/')
      expect(routes.referrer('https://google.com/search', PAGE)).toBe('https://google.com/search')
    })

    it('stays off without a resolver or when the flag is false', () => {
      expect(createRouteRedaction({ routeTemplates: true }).templated).toBe(false)
      expect(createRouteRedaction({ routeTemplate: () => '/x' }).templated).toBe(false)
      expect(createRouteRedaction({ routeTemplate: () => '/x' }).page(PAGE)).toBe(PAGE)
    })
  })

  it('is the identity with no option', () => {
    const routes = createRouteRedaction()
    expect(routes.page(PAGE)).toBe(PAGE)
    expect(routes.referrer('https://example.com/a', PAGE)).toBe('https://example.com/a')
    expect(routes.path('/a/b')).toBe('/a/b')
  })

  it('matches a route whatever the case of the path', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/orders/[id]'] })
    expect(routes.path('/Orders/123')).toBe('/orders/[id]')
    expect(routes.path('/ORDERS/123')).toBe('/orders/[id]')
    expect(routes.page('https://example.com/Orders/123?x=1')).toBe('https://example.com/orders/[id]')
  })

  it('matches a route on a double-encoded slash', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/orders/[id]'] })
    expect(routes.path('/orders%252F123')).toBe('/orders/[id]')
    expect(routes.path('/orders%25252F123')).toBe('/orders/[id]')
  })

  it('normalizes dot segments before matching, encoded or not', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/orders/[id]'] })
    expect(routes.path('/orders/../orders/123')).toBe('/orders/[id]')
    expect(routes.path('/./orders/123')).toBe('/orders/[id]')
    expect(routes.path('/orders/./123')).toBe('/orders/[id]')
    expect(routes.path('/orders/%2e%2e/orders/123')).toBe('/orders/[id]')
    expect(routes.path('/orders/%2E/123')).toBe('/orders/[id]')
    expect(routes.path('/x/../orders/123/')).toBe('/orders/[id]')
  })

  it('collapses repeated slashes before matching', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/orders/[id]'] })
    expect(routes.path('//orders/123')).toBe('/orders/[id]')
    expect(routes.path('/orders//123')).toBe('/orders/[id]')
    expect(routes.path('/orders/123//')).toBe('/orders/[id]')
  })

  it('masks a path that cannot be decoded instead of sending it raw', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/orders/[id]'] })
    expect(routes.path('/orders/%FF%FE')).toBe('/[redacted]')
    expect(routes.path('/orders/%E0%A4%A')).toBe('/[redacted]')
    expect(routes.page('https://example.com/orders/%ZZ?token=t')).toBe('https://example.com/[redacted]')
  })

  it('decodes an undecodable path leniently when redactUndecodablePaths is false', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/orders/[id]'], redactUndecodablePaths: false })
    expect(routes.path('/orders/%ZZ')).toBe('/orders/[id]')
    expect(routes.page('https://example.com/orders/%ZZ?token=t')).toBe('https://example.com/orders/[id]')
    expect(routes.path('/orders/123')).toBe('/orders/[id]')
  })

  it('masks an undecodable path when redactUndecodablePaths is true', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/orders/[id]'], redactUndecodablePaths: true })
    expect(routes.path('/orders/%ZZ')).toBe('/[redacted]')
  })

  it('leaves an undecodable path alone when no route is configured', () => {
    expect(createRouteRedaction().path('/orders/%ZZ')).toBe('/orders/%ZZ')
    expect(createRouteRedaction().page('https://example.com/%E0%A4%A')).toBe('https://example.com/%E0%A4%A')
  })

  it('matches a route under triple encoding of the slash', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/orders/[id]'] })
    expect(routes.path('/orders%25252F123')).toBe('/orders/[id]')
  })

  it('matches a route encoded five times, the deepest depth the decoder follows', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/orders/[id]'] })
    let encoded = '/'
    for (let depth = 0; depth < 5; depth++) encoded = encodeURIComponent(encoded)
    expect(routes.path('/orders' + encoded + '123')).toBe('/orders/[id]')
  })

  it('masks a path encoded deeper than the decoder follows', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/orders/[id]'] })
    let encoded = '/'
    for (let depth = 0; depth < 6; depth++) encoded = encodeURIComponent(encoded)
    expect(routes.path('/orders' + encoded + '123')).toBe('/[redacted]')
  })

  it('normalizes dot segments that are encoded more than once', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/orders/[id]'] })
    expect(routes.path('/%25252e%25252e/orders/123')).toBe('/orders/[id]')
  })

  it('ignores matrix parameters on each segment', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/orders/[id]', '/admin/[page]'] })
    expect(routes.path('/orders;a=1/123')).toBe('/orders/[id]')
    expect(routes.path('/admin;x/secret')).toBe('/admin/[page]')
    expect(routes.path('/orders%3Ba=1/123')).toBe('/orders/[id]')
  })

  it('keeps an encoded slash literal in a route while decoding the other escapes', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/files%2Fx/[id]'] })
    expect(routes.path('/files%2Fx/%41')).toBe('/files%2Fx/[id]')
  })

  it('matches a route on an encoded slash and masks a malformed path', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/invoices/[id]'] })
    expect(routes.pattern('/invoices%2F991')).toBe('/invoices/[id]')
    expect(routes.pattern('/%ZZ/invoices/991')).toBe('/[redacted]')
    expect(routes.pattern('/invoices/%ZZ')).toBe('/[redacted]')
  })
})

describe('parité takt-core-php #8', () => {
  it.each([
    ['/orders/[id]', '/orders%2F123', '/orders/[id]'],
    ['/orders/[id]', '/orders%2f123', '/orders/[id]'],
    ['/orders/[id]/items', '/orders%2F123/items', '/orders/[id]/items'],
    ['/orders/[id]', '/Orders/123', '/orders/[id]'],
    ['/Orders/[id]', '/orders/123', '/Orders/[id]'],
    ['/orders/[id]', '//orders/123', '/orders/[id]'],
    ['/orders/[id]', '/orders//123', '/orders/[id]'],
    ['/orders/[id]', '/orders/123//', '/orders/[id]'],
    ['/orders/[id]', '/orders%25252F123', '/orders/[id]'],
    ['/files/[name]', '/files%252Fsecret', '/files/[name]'],
    ['/orders/[id]', '/%25252e%25252e/orders/123', '/orders/[id]'],
    ['/admin/[x]', '/orders/%2e%2e/admin/secret', '/admin/[x]'],
    ['/admin/[x]', '/admin/x/../../admin/secret', '/admin/[x]'],
    ['/orders/[id]', '/orders;a=1/123', '/orders/[id]'],
    ['/admin/[x]', '/admin;x/secret', '/admin/[x]'],
    ['/orders/[id]', '/a/..;/orders/123', '/orders/[id]'],
    ['/admin/[x]', '/x/..;/admin/secret', '/admin/[x]'],
    ['/a%20b/[x]', '/a%20b/1', '/a%20b/[x]'],
  ])('%s matches %s as %s', (pattern, path, expected) => {
    expect(createRouteRedaction({ redactRoutes: [pattern] }).path(path)).toBe(expected)
  })

  it('matches a route on the decoded form of a path that is also escaped on its literal segments', () => {
    expect(createRouteRedaction({ redactRoutes: ['/files%2Fx/[id]'] }).path('/%66iles%2Fx/%41')).toBe('/files%2Fx/[id]')
  })

  it('escapes the literal tail of a route so a dot is not a wildcard', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/invoices/[id].json'] })
    expect(routes.path('/invoices/123Xjson')).toBe('/invoices/123Xjson')
    expect(routes.path('/invoices/123.json')).toBe('/invoices/[id].json')
  })

  it.each([5, 4, 1])('matches a path encoded %i times', (times) => {
    let encoded = '/123'
    for (let i = 0; i < times; i++) encoded = encodeURIComponent(encoded)
    expect(createRouteRedaction({ redactRoutes: ['/orders/[id]'] }).path('/orders' + encoded)).toBe('/orders/[id]')
  })

  it.each([true, false])('masks a path still encoded after five changes (redactUndecodablePaths %s)', (strict) => {
    let encoded = '/123'
    for (let i = 0; i < 6; i++) encoded = encodeURIComponent(encoded)
    const routes = createRouteRedaction({ redactRoutes: ['/orders/[id]'], redactUndecodablePaths: strict })
    expect(routes.path('/orders' + encoded)).toBe('/[redacted]')
  })

  it('collapses a very long run of slashes before matching', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/verify/[token]'] })
    expect(routes.path('/verify' + '/'.repeat(5000) + 'abc')).toBe('/verify/[token]')
  })

  it('masks an undecodable path by default, as takt-core-php does', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/orders/[id]'] })
    expect(routes.path('/%ZZ/orders/123')).toBe('/[redacted]')
    expect(routes.path('/orders/%E9/123')).toBe('/[redacted]')
    expect(routes.path('/orders/%E0%A4%A')).toBe('/[redacted]')
    expect(routes.path('/orders/123%ZZ')).toBe('/[redacted]')
  })

  it('matches an undecodable path leniently when masking is disabled, as takt-core-php does', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/orders/[id]'], redactUndecodablePaths: false })
    expect(routes.path('/orders/123%ZZ')).toBe('/orders/[id]')
    expect(routes.path('/%ZZ/orders/123')).toBe('/%ZZ/orders/123')
    expect(routes.path('/orders/%E9/123')).toBe('/orders/%E9/123')
  })

  it('decodes valid escapes before matching when masking is disabled, even next to an undecodable one', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/orders/123/[x]'], redactUndecodablePaths: false })
    expect(routes.path('/orders/12%33/%ZZ')).toBe('/orders/123/[x]')
    expect(createRouteRedaction({ redactRoutes: ['/orders/123/[x]'] }).path('/orders/12%33/%ZZ')).toBe('/[redacted]')
  })

  it('keeps a path whose invalid byte is glued to a route literal raw when masking is disabled, as takt-core-php does', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/orders/[id]'], redactUndecodablePaths: false })
    expect(routes.path('/%FForders/123')).toBe('/%FForders/123')
  })

  it.each([true, false])('matches a valid encoded path in both modes (redactUndecodablePaths %s)', (strict) => {
    const routes = createRouteRedaction({ redactRoutes: ['/orders/[id]'], redactUndecodablePaths: strict })
    expect(routes.path('/orders/%C3%A9')).toBe('/orders/[id]')
  })
})

describe('brace constraints', () => {
  const masks = (pattern: string, path: string) => createRouteRedaction({ redactRoutes: [pattern] }).path(path)

  it('masks only a segment that satisfies the constraint', () => {
    expect(masks('/x/{id<[a-f]+>}', '/x/ABC')).toBe('/x/{id}')
    expect(masks('/posts/{page?<\\d+>}', '/posts/3')).toBe('/posts/{page}')
    expect(masks('/posts/{page?<\\d+>}', '/posts')).toBe('/posts/{page}')
    expect(masks('/p/{a<\\d+>}-{b}', '/p/12-x')).toBe('/p/{a}-{b}')
  })

  it('anchors the constraint on the whole segment', () => {
    expect(masks('/x/{id<a|b>}', '/x/ab')).toBe('/x/ab')
    expect(masks('/x/{id<a|b>}', '/x/b')).toBe('/x/{id}')
  })

  it('masks, rather than leaks, when the constraint cannot be used', () => {
    expect(masks('/x/{id<[>}', '/x/anything')).toBe('/[redacted]')
    expect(masks('/x/{id<\\d)|(\\w>}', '/x/-')).toBe('/[redacted]')
    expect(masks('/x/{id<a/b>}', '/x/zzz')).toBe('/[redacted]')
    expect(masks('/x/{id<^\\d+$>}', '/x/123')).toBe('/[redacted]')
    expect(masks('/x/{id<>}', '/x/zzz')).toBe('/[redacted]')
    expect(masks(`/x/{id<${'\\d'.repeat(60)}>}`, '/x/abc')).toBe('/[redacted]')
    expect(masks('/x/{id<(a+)+b>}', `/x/${'a'.repeat(30)}!`)).toBe('/[redacted]')
    expect(masks('/x/{id<(a)\\1>}', '/x/ab')).toBe('/[redacted]')
    expect(masks('/x/{id<(a)\\1>}', '/y/ab')).toBe('/y/ab')
    expect(masks('/x/{id<(?<=a)b>}', '/x/b')).toBe('/[redacted]')
  })
})
