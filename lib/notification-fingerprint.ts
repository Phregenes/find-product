/** Compare two sets of listing IDs (order-independent). */
export function sameItemIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const setB = new Set(b)
  return a.every((id) => setB.has(id))
}

/** True when at least one current ID was not included in the previous email. */
export function hasItemsNotYetNotified(
  currentIds: string[],
  previouslyNotifiedIds: string[],
): boolean {
  if (currentIds.length === 0) return false
  const notified = new Set(previouslyNotifiedIds)
  return currentIds.some((id) => !notified.has(id))
}

export function filterNotYetNotified<T extends { id: string }>(
  items: T[],
  previouslyNotifiedIds: string[],
): T[] {
  const notified = new Set(previouslyNotifiedIds)
  return items.filter((item) => !notified.has(item.id))
}

/** Skip email when the current unseen set matches the last email exactly. */
export function shouldSkipDuplicateEmail(
  currentIds: string[],
  previouslyNotifiedIds: string[],
): boolean {
  if (currentIds.length === 0) return true
  if (previouslyNotifiedIds.length === 0) return false
  return sameItemIdSet(currentIds, previouslyNotifiedIds)
}
