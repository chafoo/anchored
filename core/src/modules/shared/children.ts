// _v3/modules/shared/children.ts — child-list transforms (pure). next-child drives the build
// loop: an active child (resume-safety) wins, else the first pending child whose depends_on
// are all done; ready-children is the parallel fan-out batch. Tier-agnostic — the modules use
// them on their child arrays.
import { anchoredError } from '../../lib/utils/error.js'

export interface ChildLike {
  slug: string
  status: string
  depends_on?: string[]
}

const ACTIVE = new Set(['in-progress', 'active'])

export function nextChild<T extends ChildLike>(children: T[]): T | null {
  const active = children.find((c) => ACTIVE.has(c.status))
  if (active) return active
  const done = new Set(children.filter((c) => c.status === 'done').map((c) => c.slug))
  for (const c of children) {
    if (c.status === 'pending' && (c.depends_on ?? []).every((d) => done.has(d))) return c
  }
  return null
}

/** All children runnable right now — pending with every dependency done (the fan-out batch). */
export function readyChildren<T extends ChildLike>(children: T[]): T[] {
  const done = new Set(children.filter((c) => c.status === 'done').map((c) => c.slug))
  return children.filter(
    (c) => c.status === 'pending' && (c.depends_on ?? []).every((d) => done.has(d)),
  )
}

export function addChild<T extends ChildLike>(children: T[], child: T): T[] {
  if (children.some((c) => c.slug === child.slug)) {
    throw anchoredError('DuplicateSlug', `child '${child.slug}' already exists`)
  }
  return [...children, child]
}

export function moveChild<T extends ChildLike>(children: T[], slug: string, toIndex: number): T[] {
  const idx = children.findIndex((c) => c.slug === slug)
  if (idx < 0) throw anchoredError('UnknownChild', `no child '${slug}'`)
  const copy = [...children]
  const [item] = copy.splice(idx, 1)
  copy.splice(toIndex, 0, item!)
  return copy
}
