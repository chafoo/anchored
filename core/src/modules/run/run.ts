// modules/run/run.ts — createRun({store, config, clock, rand}) → RunPort. THE module: the
// 9 verbs, each a pure transform persisted through the dumb store (which parses every
// write against the config-built schema — the invariant is enforced there, not here).
// This factory adds the verb-level guards the schema cannot express: plan immutability,
// criteria-never-deleted, closed-run refusal for proof-state verbs, friendly close
// blockers, gate selection + snapshot minting for the validation packet.
import type { StorePort, Node } from '../../lib/contracts/store.js'
import type { ConfigPort } from '../../lib/contracts/config.js'
import type {
  RunPort,
  AnchorInput,
  AmendInput,
  ClaimInput,
  CriterionDraft,
  EvidenceInput,
  RunSummary,
  ValidationPacket,
} from '../../lib/contracts/run.js'
import { anchoredError } from '../../lib/utils/error.js'
import { buildRunSchema, type Criterion, type RunFile } from './run.schemas.js'
import { nextId } from './scope/ids.js'
import { coerceField } from './scope/fields.js'
import { selectGate, requestLine, reusableRequest } from './scope/packet.js'
import { closeBlockers } from './scope/close-gate.js'

const SLUG_RE = /^[a-z0-9][a-z0-9._-]*$/

export interface RunModuleDeps {
  store: StorePort
  config: ConfigPort
  /** ISO timestamp seam (injected — no Date.now in module code). */
  clock: () => string
  /** entropy seam for the opaque snapshot token. */
  rand: () => string
}

export function createRun(deps: RunModuleDeps): RunPort {
  const { store, config, clock, rand } = deps
  const schema = buildRunSchema(config.fields())

  const read = async (slug: string): Promise<RunFile> =>
    (await store.read(slug, schema)) as unknown as RunFile

  /** persist with the verb-level integrity self-checks the schema cannot see. */
  const persist = async (slug: string, prev: RunFile | undefined, next: RunFile) => {
    if (prev !== undefined) {
      if (next.plan !== prev.plan)
        throw anchoredError('PlanImmutable', 'the plan block never changes — append an amendment')
      const nextIds = new Set(next.criteria.map((c) => c.id))
      const missing = prev.criteria.filter((c) => !nextIds.has(c.id))
      if (missing.length > 0)
        throw anchoredError(
          'CriteriaNeverDeleted',
          `criteria are never deleted (missing: ${missing.map((c) => c.id).join(', ')}) — supersede or reject them via amend`,
        )
    }
    return store.write(slug, next as unknown as Node, schema)
  }

  const assertOpen = (slug: string, run: RunFile, verb: string) => {
    if (run.closed !== undefined)
      throw anchoredError('RunClosed', `run '${slug}' is closed — ${verb} refused`, [
        'a closed run is immutable in its proof state; a new concern is a new run',
      ])
  }

  const findCriterion = (run: RunFile, id: string): Criterion => {
    const c = run.criteria.find((x) => x.id === id)
    if (c === undefined)
      throw anchoredError('UnknownCriterion', `no criterion '${id}'`, [
        `criteria: ${run.criteria.map((x) => x.id).join(', ')}`,
      ])
    return c
  }

  const mintCriteria = (drafts: CriterionDraft[], existing: Criterion[], addedBy?: string) => {
    const minted: Criterion[] = [...existing]
    const created: Criterion[] = []
    for (const draft of drafts) {
      if (draft.setup !== undefined) config.resolve(draft.setup) // UnknownSetup fails early
      const criterion: Criterion = {
        id: nextId('c', minted),
        text: draft.text,
        status: 'open',
        ...(draft.setup !== undefined ? { setup: draft.setup } : {}),
        ...(draft.gate !== undefined ? { gate: draft.gate } : {}),
        ...(draft.judgment === true ? { judgment: true } : {}),
        ...(addedBy !== undefined ? { added_by: addedBy } : {}),
      }
      minted.push(criterion)
      created.push(criterion)
    }
    return created
  }

  const proofState = (run: RunFile, id: string, status: 'done' | 'failed', input: EvidenceInput) =>
    run.criteria.map((c) =>
      c.id === id
        ? {
            ...c,
            status,
            evidence: {
              by: 'validator' as const,
              snapshot: input.snapshot,
              ...(input.grounded !== undefined ? { grounded: input.grounded } : {}),
              ...(input.verdict !== undefined ? { verdict: input.verdict } : {}),
              at: clock(),
            },
          }
        : c,
    )

  return {
    async anchor(input: AnchorInput): Promise<Node> {
      if (!SLUG_RE.test(input.slug))
        throw anchoredError(
          'InvalidSlug',
          `'${input.slug}' — use [a-z0-9._-], starting alphanumeric`,
        )
      if ((await store.list()).includes(input.slug))
        throw anchoredError('RunExists', `run '${input.slug}' already exists`, [
          `resume it (anchored status ${input.slug}) or pick a new slug`,
        ])
      if (input.criteria.length === 0)
        throw anchoredError('NoCriteria', 'a run needs at least one criterion')
      const run: RunFile = {
        goal: input.goal,
        rigor: input.rigor ?? 'standard',
        ...(input.plan !== undefined ? { plan: input.plan } : {}),
        amendments: [],
        criteria: mintCriteria(input.criteria, []),
        trail: [],
      }
      return persist(input.slug, undefined, run)
    },

    async claim(slug, input: ClaimInput): Promise<Node> {
      // allowed on closed runs: the trail is annotation, not proof state (close-time hooks log here)
      const run = await read(slug)
      const entry = {
        at: clock(),
        claim: input.claim,
        ...(input.refs !== undefined && input.refs.length > 0 ? { refs: input.refs } : {}),
      }
      return persist(slug, run, { ...run, trail: [...run.trail, entry] })
    },

    async amend(slug, input: AmendInput): Promise<Node> {
      const run = await read(slug)
      assertOpen(slug, run, 'amend')
      const adds = input.add ?? []
      const supersedes = input.supersede ?? []
      const rejects = input.reject ?? []
      if (adds.length + supersedes.length + rejects.length === 0)
        throw anchoredError(
          'EmptyAmendment',
          'an amendment changes criteria — add, supersede or reject at least one',
          ['a pure note belongs in the trail: anchored claim <slug> "<note>"'],
        )

      const amendmentId = nextId('a', run.amendments)
      const created = mintCriteria(adds, run.criteria, amendmentId)
      let criteria = [...run.criteria, ...created]

      for (const s of supersedes) {
        findCriterion(run, s.id)
        const by =
          typeof s.by === 'number'
            ? (created[s.by - 1]?.id ??
              (() => {
                throw anchoredError(
                  'UnknownCriterion',
                  `supersede index ${s.by} has no added criterion`,
                )
              })())
            : (s.by ?? created[0]?.id)
        if (by === undefined)
          throw anchoredError(
            'UnknownCriterion',
            `supersede ${s.id}: no successor — pass 'by' or add one`,
          )
        criteria = criteria.map((c) =>
          c.id === s.id
            ? { ...c, status: 'superseded' as const, superseded_by: by, amended_by: amendmentId }
            : c,
        )
      }
      for (const id of rejects) {
        findCriterion(run, id)
        criteria = criteria.map((c) =>
          c.id === id ? { ...c, status: 'rejected' as const, amended_by: amendmentId } : c,
        )
      }

      const next: RunFile = {
        ...run,
        amendments: [...run.amendments, { id: amendmentId, at: clock(), reason: input.reason }],
        criteria,
      }
      return persist(slug, run, next)
    },

    async validate(slug, opts = {}): Promise<ValidationPacket> {
      const run = await read(slug)
      assertOpen(slug, run, 'validate')
      const selection = selectGate(run, opts.gate)
      const resolved = config.resolve(selection.setup)

      // asking the same question twice is one request: reuse the snapshot, add no entry
      const prior = reusableRequest(run, opts.gate, selection.criteria)
      const reuse =
        prior !== undefined && (opts.snapshot === undefined || opts.snapshot === prior.snapshot)
      const snapshot = reuse ? prior.snapshot! : (opts.snapshot ?? `snap-${clock()}-${rand()}`)

      if (!reuse) {
        const entry = {
          at: clock(),
          ...(opts.gate !== undefined ? { gate: opts.gate } : {}),
          validated: requestLine(selection.criteria),
          snapshot,
        }
        await persist(slug, run, { ...run, trail: [...run.trail, entry] })
      }
      return {
        slug,
        ...(opts.gate !== undefined ? { gate: opts.gate } : {}),
        snapshot,
        rigor: run.rigor,
        goal: run.goal,
        criteria: selection.criteria.map((c) => ({
          id: c.id,
          text: c.text,
          ...(c.setup !== undefined ? { setup: c.setup } : {}),
          status: c.status,
          // the validator must know which criteria a prose verdict may prove
          ...(c.judgment === true ? { judgment: true } : {}),
        })),
        setup: {
          ...(selection.setup !== undefined ? { name: selection.setup } : {}),
          ...(resolved.validator !== undefined ? { validator: resolved.validator } : {}),
          ...(resolved.before !== undefined ? { before: resolved.before } : {}),
        },
        fields: config.fields(),
      }
    },

    async evidence(slug, criterion, input: EvidenceInput): Promise<Node> {
      const run = await read(slug)
      assertOpen(slug, run, 'evidence')
      const c = findCriterion(run, criterion)
      if (c.status === 'superseded' || c.status === 'rejected')
        throw anchoredError(
          'InactiveCriterion',
          `criterion '${criterion}' is ${c.status} — nothing to prove`,
        )
      // grounded-for-done, pre-checked with a usable message (the schema is the backstop)
      if (input.grounded === undefined && c.judgment !== true)
        throw anchoredError(
          'UngroundedEvidence',
          `criterion '${criterion}' is not a judgment criterion — a prose verdict cannot prove it`,
          [
            'run something that proves it, then pass --grounded "<command> → <real output>"',
            `if it truly cannot be executed, it must be declared 'judgment: true' at anchor/amend time`,
            `to reject it instead: anchored fail ${slug} ${criterion} --snapshot <s> --verdict <why>`,
          ],
        )
      return persist(slug, run, { ...run, criteria: proofState(run, criterion, 'done', input) })
    },

    async fail(slug, criterion, input): Promise<Node> {
      const run = await read(slug)
      assertOpen(slug, run, 'fail')
      const c = findCriterion(run, criterion)
      if (c.status === 'superseded' || c.status === 'rejected')
        throw anchoredError(
          'InactiveCriterion',
          `criterion '${criterion}' is ${c.status} — nothing to fail`,
        )
      return persist(slug, run, { ...run, criteria: proofState(run, criterion, 'failed', input) })
    },

    async set(slug, criterion, field, value): Promise<Node> {
      // allowed on closed runs: custom fields are enrichment (close-time hooks write here)
      const run = await read(slug)
      findCriterion(run, criterion)
      const coerced = coerceField(config.fields(), field, value)
      const criteria = run.criteria.map((c) =>
        c.id === criterion ? { ...c, [field]: coerced } : c,
      )
      return persist(slug, run, { ...run, criteria })
    },

    async status(slug): Promise<Node> {
      return (await read(slug)) as unknown as Node
    },

    async list(): Promise<RunSummary[]> {
      const summaries: RunSummary[] = []
      for (const slug of await store.list()) {
        const run = await read(slug)
        const count = (s: string) => run.criteria.filter((c) => c.status === s).length
        summaries.push({
          slug,
          goal: run.goal,
          rigor: run.rigor,
          closed: run.closed !== undefined,
          open: count('open'),
          failed: count('failed'),
          done: count('done'),
        })
      }
      return summaries
    },

    async close(slug): Promise<Node> {
      const run = await read(slug)
      if (run.closed !== undefined)
        throw anchoredError('AlreadyClosed', `run '${slug}' is already closed`)
      const blockers = closeBlockers(run)
      if (blockers.length > 0)
        throw anchoredError(
          'CloseBlocked',
          `close refused — ${blockers.length} unproven active criteria`,
          blockers.map((b) => `${b.id} (${b.status}): ${b.text}`),
        )
      return persist(slug, run, { ...run, closed: { at: clock() } })
    },
  }
}
