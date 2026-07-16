export function unwrapDefaultExport<T>(value: unknown): T {
  let current = value
  const visited = new Set<unknown>()
  while (current && (typeof current === 'object' || typeof current === 'function') && !visited.has(current)) {
    visited.add(current)
    if (!('default' in current)) break
    const next = (current as { default?: unknown }).default
    if (next === undefined || next === current) break
    current = next
  }
  return current as T
}
