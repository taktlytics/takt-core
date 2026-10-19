import { describe, it, expect } from 'vitest'
import decodePathSegments from '../../src/domain/url/decodePathSegments'

describe('decodePathSegments', () => {
  it.each([
    ['/%61dmin/users', '/admin/users'],
    ['/%61dmin/%ZZ', '/admin/%ZZ'],
    ['/%ZZ/%61dmin', '/%ZZ/admin'],
    ['/a%2Fb', '/a/b'],
    ['/caf%C3%A9', '/café'],
    ['/', '/'],
    ['', ''],
  ])('decodes %s as %s', (raw, expected) => {
    expect(decodePathSegments(raw)).toBe(expected)
  })
})
