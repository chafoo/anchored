// lib/contracts/run.ts — the run capability (cli ↔ run module): the 9 verbs, each a pure
// transform persisted through the store. Runs are untyped `Node`s at this boundary (the
// run schema validates on every write); the structured inputs/outputs here are the
// hand-written shapes the verbs exchange. Interface-only.
import type { Node } from './store.js'
import type { FieldsConfig, Instructions } from './config.js'

/** A criterion as authored at anchor/amend time (ids are minted by the module). */
export interface CriterionDraft {
  text: string
  /** which setup verifies it; no setup → defaults. */
  setup?: string
  /** gate label — the AI's slicing, sized to the rigor. Absent → the single final gate. */
  gate?: string
  /** declare it unexecutable: a prose verdict may prove it. The one opt-out from
   *  grounded-for-done — state it up front, not after the proof fails to materialise. */
  judgment?: boolean
}

export interface AnchorInput {
  slug: string
  goal: string
  /** the user's plan VERBATIM — immutable once written. */
  plan?: string
  rigor?: 'light' | 'standard' | 'high' | 'max'
  criteria: CriterionDraft[]
}

export interface ClaimInput {
  claim: string
  /** optional criterion refs when the mapping is obvious. */
  refs?: string[]
}

export interface AmendInput {
  reason: string
  /** new criteria added by this amendment (get `added_by`). */
  add?: CriterionDraft[]
  /** existing criteria this amendment supersedes; `by` points at an existing criterion id
   *  or the 1-based index into `add` (resolved to the minted id). */
  supersede?: { id: string; by?: string | number }[]
  /** existing criteria this amendment rejects outright. */
  reject?: string[]
}

/** What `validate` returns: everything ONE validator spawn needs. The CLI never spawns. */
export interface ValidationPacket {
  slug: string
  gate?: string
  /** opaque token minted by the module, or the caller's --snapshot string, verbatim. */
  snapshot: string
  rigor: string
  goal: string
  criteria: { id: string; text: string; setup?: string; status: string; judgment?: boolean }[]
  /** the resolved setup of the gate (gates are setup-homogeneous). */
  setup: { name?: string; validator?: Instructions; before?: Instructions }
  fields: FieldsConfig
}

export interface EvidenceInput {
  snapshot: string
  /** executed-command proof — required for `done` unless the criterion is `judgment`. */
  grounded?: string
  /** prose judgment: the reason a `fail` rejects, or the proof of a `judgment` criterion. */
  verdict?: string
}

export interface RunSummary {
  slug: string
  goal: string
  rigor: string
  closed: boolean
  open: number
  failed: number
  done: number
}

export interface RunPort {
  anchor(input: AnchorInput): Promise<Node>
  claim(slug: string, input: ClaimInput): Promise<Node>
  amend(slug: string, input: AmendInput): Promise<Node>
  validate(slug: string, opts?: { gate?: string; snapshot?: string }): Promise<ValidationPacket>
  evidence(slug: string, criterion: string, input: EvidenceInput): Promise<Node>
  fail(slug: string, criterion: string, input: { snapshot: string; verdict: string }): Promise<Node>
  set(slug: string, criterion: string, field: string, value: string): Promise<Node>
  status(slug: string): Promise<Node>
  list(): Promise<RunSummary[]>
  close(slug: string): Promise<Node>
}
