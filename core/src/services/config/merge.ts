// config/merge.ts — merge(default, user) → effectiveConfig. Pure, stateless
// (the factory-functions rule allows pure helpers). Merge semantics by shape:
//   - scalars: user wins (override)
//   - objects: deep-merge by key
//   - `steps` lists: KEYED by name, extend-only — built-ins never drop; a known
//     name merges in place (instructions append), a new name inserts by
//     before/after (else appended). No remove op.
//   - keyless value lists (stop, rules): union-append + dedupe (never replace)
//   - `each`: intrinsic — always taken from the default
import type { Config } from './config-schema/config.js'

type Rec = Record<string, unknown>

function isRec(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function mergeSteps(def: unknown[], user: unknown[]): unknown[] {
  const result: Rec[] = def.map((s) => ({ ...(s as Rec) }))
  for (const raw of user) {
    const us = raw as Rec
    const idx = result.findIndex((s) => s.name === us.name)
    if (idx >= 0) {
      // known built-in: extend in place, keep position. Append instructions.
      const existing = result[idx]!
      // Q3 (harden-1): a built-in WORKER (a bare default step — no run/use/each) may
      // only be EXTENDED (instructions / involve), never redefined with run/use/each.
      // Otherwise `{name: implement, run: 'rm -rf /'}` merges into the privileged
      // implement worker and toPlanStep reclassifies it to a run-step → arbitrary
      // shell executes under the "implement" slot. Reject loudly.
      const existingIsWorker =
        existing.run === undefined && existing.use === undefined && existing.each === undefined
      if (
        existingIsWorker &&
        (us.run !== undefined || us.use !== undefined || us.each !== undefined)
      ) {
        const e = new Error(
          `step '${String(us.name)}' is a built-in worker — extend it with instructions only; ` +
            `it cannot be redefined with run/use/each`,
        )
        e.name = 'ConfigError'
        throw e
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
      // new step: insert by before/after, else append
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

// M5 (harden-2): a hostile/huge config can't be allowed to blow the stack. 64 is far
// deeper than any real anchored.yml (tiers→stages→steps→… is ~5 levels).
const MAX_DEPTH = 64

function mergeValue(key: string, defVal: unknown, userVal: unknown, depth: number): unknown {
  if (key === 'each') return defVal !== undefined ? defVal : userVal // intrinsic
  if (userVal === undefined) return defVal
  if (defVal === undefined) return userVal
  if (isRec(defVal) && isRec(userVal)) return mergeRec(defVal, userVal, depth + 1)
  if (Array.isArray(defVal) && Array.isArray(userVal)) {
    return key === 'steps' ? mergeSteps(defVal, userVal) : unionAppend(defVal, userVal)
  }
  return userVal // scalar: user wins
}

function mergeRec(def: Rec, user: Rec, depth = 0): Rec {
  if (depth > MAX_DEPTH) {
    const e = new Error(`anchored.yml nests deeper than ${MAX_DEPTH} levels — likely malformed`)
    e.name = 'ConfigError'
    throw e
  }
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
