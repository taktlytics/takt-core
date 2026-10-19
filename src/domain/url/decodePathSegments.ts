function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

export default function decodePathSegments(path: string): string {
  return path.split('/').map(decodeSegment).join('/')
}
