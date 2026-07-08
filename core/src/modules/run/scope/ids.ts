// modules/run/scope/ids.ts — id minting for criteria (c1…cN) and amendments (a1…aN).
// Continues the sequence past the highest existing number — ids are never reused, because
// criteria are never deleted.

export function nextId(prefix: 'c' | 'a', existing: { id: string }[]): string {
  let max = 0
  for (const { id } of existing) {
    const n = Number(id.slice(prefix.length))
    if (id.startsWith(prefix) && Number.isInteger(n) && n > max) max = n
  }
  return `${prefix}${max + 1}`
}
