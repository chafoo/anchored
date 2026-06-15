// _v3/services/template/merge.ts — merge(default, user) → effectiveConfig. Pure. Semantics:
//   - scalars: user wins
//   - objects: deep-merge by key
//   - `steps` lists: KEYED by name, extend-only — built-ins never drop; a known name merges
//     in place (instructions append), a new name inserts by before/after/with (else appended).
//     before/after are consumed at merge time; `with` is kept (a runtime parallel-batch marker)
//   - keyless value lists (stop): union-append + dedupe
//   - `each`: intrinsic — always the default's
import type { Config } from './config.schemas.js'

type Rec = Record<string, unknown>

function isRec(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function configError(message: string): Error {
  const e = new Error(message)
  e.name = 'ConfigError'
  return e
}

function mergeSteps(def: unknown[], user: unknown[]): unknown[] {
  const result: Rec[] = def.map((s) => ({ ...(s as Rec) }))
  for (const raw of user) {
    const us = raw as Rec
    const idx = result.findIndex((s) => s.name === us.name)
    if (idx >= 0) {
      const existing = result[idx]!
      // a built-in WORKER step may only be EXTENDED (instructions / execute), never have its
      // `use` worker swapped — otherwise a user override could repoint the privileged
      // `implement` slot at an arbitrary agent. Reject loudly.
      if (existing.use !== undefined && us.use !== undefined) {
        throw configError(
          `step '${String(us.name)}' is a built-in — extend it with instructions only; its worker cannot be redefined`,
        )
      }
      const rest: Rec = { ...us }
      delete rest.before
      delete rest.after
      delete rest.instructions
      const merged: Rec = { ...existing, ...rest }
      if (typeof us.instructions === 'string') {
        merged.instructions =
          typeof existing.instructions === 'string'
            ? `${existing.instructions}\n${us.instructions}`
            : us.instructions
      }
      result[idx] = merged
    } else {
      // before/after are merge-time directives — consumed here and dropped. `with` is a
      // RUNTIME positioner (the skill reads it to form the parallel batch): keep it on the
      // served step, and position the step right after its named anchor so it lands in that
      // anchor's batch ordering.
      const step: Rec = { ...us }
      delete step.before
      delete step.after
      let pos = result.length
      if (typeof us.after === 'string') {
        const ai = result.findIndex((s) => s.name === us.after)
        if (ai >= 0) pos = ai + 1
      } else if (typeof us.before === 'string') {
        const bi = result.findIndex((s) => s.name === us.before)
        if (bi >= 0) pos = bi
      } else if (typeof us.with === 'string') {
        const wi = result.findIndex((s) => s.name === us.with)
        if (wi >= 0) pos = wi + 1
      }
      result.splice(pos, 0, step)
    }
  }
  return result
}

function unionAppend(def: unknown[], user: unknown[]): unknown[] {
  const result = [...def]
  for (const item of user) {
    const key = JSON.stringify(item)
    if (!result.some((x) => JSON.stringify(x) === key)) result.push(item)
  }
  return result
}

const MAX_DEPTH = 64

function mergeValue(key: string, defVal: unknown, userVal: unknown, depth: number): unknown {
  if (key === 'each') return defVal !== undefined ? defVal : userVal // intrinsic
  if (userVal === undefined) return defVal
  if (defVal === undefined) return userVal
  if (isRec(defVal) && isRec(userVal)) return mergeRec(defVal, userVal, depth + 1)
  if (Array.isArray(defVal) && Array.isArray(userVal)) {
    return key === 'steps' ? mergeSteps(defVal, userVal) : unionAppend(defVal, userVal)
  }
  return userVal
}

function mergeRec(def: Rec, user: Rec, depth = 0): Rec {
  if (depth > MAX_DEPTH) throw configError(`anchored.yml nests deeper than ${MAX_DEPTH} levels`)
  const out: Rec = {}
  for (const k of new Set([...Object.keys(def), ...Object.keys(user)])) {
    out[k] = mergeValue(k, def[k], user[k], depth)
  }
  return out
}

/** Merge the framework default config with the user's deltas (extend-only). */
export function merge(defaultCfg: Config, userCfg: Config): Config {
  return mergeRec(defaultCfg as Rec, userCfg as Rec) as Config
}
