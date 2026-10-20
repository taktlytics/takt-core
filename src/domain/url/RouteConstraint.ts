const MAX_CONSTRAINT_LENGTH = 100
const MAX_COUNT = 100
const MAX_VARIABLE_QUANTIFIERS = 2
const FORBIDDEN_LITERALS = '()[]{}|*+?.\\^$/<>'
const CLASS_ESCAPES = 'dDwWsS'
const ASCII_PUNCTUATION = /^[!-\/:-@\[-\x60{-~]$/
const COUNT_QUANTIFIER = /^\{(\d+)(,(\d*))?\}/
const SPECIAL_IN_CLASS = /[\\\]^\-[]/
const SLASH_CODE = 0x2f
const PRINTABLE_ASCII = /^[\x20-\x7e]+$/

interface Cursor {
  readonly text: string
  index: number
  variableQuantifiers: number
}

export interface CompiledConstraint {
  readonly source: string
  readonly variables: number
}

export default function compileConstraint(body: string): CompiledConstraint | null {
  if (body.length === 0 || body.length > MAX_CONSTRAINT_LENGTH) return null
  if (!PRINTABLE_ASCII.test(body)) return null
  const cursor: Cursor = { text: body, index: 0, variableQuantifiers: 0 }
  const branches: string[] = []
  do {
    const branch = parseBranch(cursor)
    if (branch === null) return null
    branches.push(branch)
  } while (consumeAlternation(cursor))
  if (cursor.variableQuantifiers > MAX_VARIABLE_QUANTIFIERS) return null
  const source = branches.join('|')
  return isValidSource(source) ? { source, variables: cursor.variableQuantifiers } : null
}

function consumeAlternation(cursor: Cursor): boolean {
  if (cursor.text.charAt(cursor.index) !== '|') return false
  cursor.index++
  return true
}

function parseBranch(cursor: Cursor): string | null {
  let source = ''
  let pieces = 0
  while (cursor.index < cursor.text.length && cursor.text.charAt(cursor.index) !== '|') {
    const piece = parsePiece(cursor)
    if (piece === null) return null
    source += piece
    pieces++
  }
  return pieces === 0 ? null : source
}

function parsePiece(cursor: Cursor): string | null {
  const atom = parseAtom(cursor)
  if (atom === null) return null
  const quantifier = parseQuantifier(cursor)
  if (quantifier === null) return null
  return `(?:(?!\\/)${atom})${quantifier}`
}

function parseAtom(cursor: Cursor): string | null {
  const char = cursor.text.charAt(cursor.index)
  if (char === '') return null
  if (char === '\\') return parseEscape(cursor)
  cursor.index++
  if (char === '[') return parseClass(cursor)
  if (char === '.') return '[^/]'
  if (FORBIDDEN_LITERALS.includes(char)) return null
  return escapeRegExp(char)
}

function parseEscape(cursor: Cursor): string | null {
  const char = cursor.text.charAt(cursor.index + 1)
  cursor.index += 2
  if (char === '') return null
  if (CLASS_ESCAPES.includes(char)) return `\\${char}`
  if (char !== '/' && ASCII_PUNCTUATION.test(char)) return `\\${char}`
  return null
}

function parseClass(cursor: Cursor): string | null {
  const negated = cursor.text.charAt(cursor.index) === '^'
  if (negated) cursor.index++
  const items: string[] = []
  for (;;) {
    const char = cursor.text.charAt(cursor.index)
    if (char === '') return null
    if (char === ']') {
      cursor.index++
      return items.length === 0 ? null : `[${negated ? '^' : ''}${items.join('')}]`
    }
    const item = parseClassItem(cursor, items.length === 0)
    if (item === null) return null
    items.push(item)
  }
}

function parseClassItem(cursor: Cursor, isFirst: boolean): string | null {
  const text = cursor.text
  const start = cursor.index
  const char = text.charAt(start)
  if (char === '\\') return parseEscape(cursor)
  if (FORBIDDEN_LITERALS.includes(char)) return null
  const next = text.charAt(start + 1)
  if (char === '-') {
    if (next === '-' || (!isFirst && next !== ']')) return null
    cursor.index = start + 1
    return '\\-'
  }
  const end = text.charAt(start + 2)
  const isRange = next === '-' && end !== '' && end !== ']'
  if (!isRange) {
    cursor.index = start + 1
    return escapeClassChar(char)
  }
  if (end === '-' || FORBIDDEN_LITERALS.includes(end)) return null
  if (char.charCodeAt(0) > end.charCodeAt(0)) return null
  if (char.charCodeAt(0) <= SLASH_CODE && end.charCodeAt(0) >= SLASH_CODE) return null
  cursor.index = start + 3
  return `${escapeClassChar(char)}-${escapeClassChar(end)}`
}

function parseQuantifier(cursor: Cursor): string | null {
  const char = cursor.text.charAt(cursor.index)
  if (char === '*' || char === '+' || char === '?') {
    cursor.index++
    cursor.variableQuantifiers++
    return char
  }
  if (char !== '{') return ''
  const match = COUNT_QUANTIFIER.exec(cursor.text.slice(cursor.index))
  if (match === null) return null
  cursor.index += match[0].length
  const min = Number(match[1])
  if (min > MAX_COUNT) return null
  if (match[2] === undefined) return `{${min}}`
  cursor.variableQuantifiers++
  if (match[3] === '') return `{${min},}`
  const max = Number(match[3])
  if (max > MAX_COUNT || max < min) return null
  return `{${min},${max}}`
}

function escapeClassChar(char: string): string {
  return SPECIAL_IN_CLASS.test(char) ? `\\${char}` : char
}

function escapeRegExp(char: string): string {
  return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isValidSource(source: string): boolean {
  try {
    return new RegExp(source, 'i') instanceof RegExp
  } catch {
    return false
  }
}
