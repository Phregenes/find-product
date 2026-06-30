/** Compare two sets of listing IDs (order-independent). */
export function sameItemIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const setB = new Set(b)
  return a.every((id) => setB.has(id))
}
