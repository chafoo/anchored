import { describe, test, expect } from 'bun:test'
import {
  buildRunSchema,
  buildCriterionSchema,
  RunSchema,
  EvidenceSchema,
  TrailEntrySchema,
} from './run.schemas.js'
import { minimalRun, midFlightRun, closedRun, doneEvidence } from './run.fixtures.js'

const criterion = (over: Record<string, unknown>) => ({
  goal: 'g',
  criteria: [{ id: 'c1', text: 't', ...over }],
})

describe('defaults + happy paths', () => {
  test('the minimal run parses and defaults fill in', () => {
    const run = RunSchema.parse(minimalRun)
    expect(run.rigor).toBe('standard')
    expect(run.amendments).toEqual([])
    expect(run.trail).toEqual([])
    expect(run.criteria[0]!.status).toBe('open')
  })

  test('the mid-flight fixture (every criterion state) parses', () => {
    const run = RunSchema.parse(midFlightRun)
    expect(run.criteria).toHaveLength(5)
    expect(run.amendments[0]!.id).toBe('a1')
  })

  test('a legally closed run parses (superseded does not block)', () => {
    expect(RunSchema.parse(closedRun).closed?.at).toBe('2026-07-08T15:00:00Z')
  })
})

describe('the evidence invariant', () => {
  test('done without evidence is rejected', () => {
    expect(() => RunSchema.parse(criterion({ status: 'done' }))).toThrow(
      /done requires validator evidence/,
    )
  })

  test('done with validator evidence parses', () => {
    const run = RunSchema.parse(criterion({ status: 'done', evidence: doneEvidence }))
    expect(run.criteria[0]!.evidence?.by).toBe('validator')
  })

  test('evidence not authored by the validator is rejected', () => {
    expect(() =>
      RunSchema.parse(
        criterion({ status: 'done', evidence: { ...doneEvidence, by: 'implementer' } }),
      ),
    ).toThrow()
  })

  test('evidence without grounded output AND without verdict is rejected', () => {
    expect(() =>
      EvidenceSchema.parse({ by: 'validator', snapshot: 's', at: '2026-07-08T14:00:00Z' }),
    ).toThrow(/grounded.*or a verdict/)
  })

  test('done on a reasoned verdict is valid — executing is a method of proof, not its nature', () => {
    const verdictOnly = {
      by: 'validator',
      snapshot: 's',
      verdict: 'opened the asset, compared it to the spec sheet, every measure matches',
      at: doneEvidence.at,
    }
    const run = RunSchema.parse(criterion({ status: 'done', evidence: verdictOnly }))
    expect(run.criteria[0]!.status).toBe('done')
    // whether prose is ACCEPTED is the setup's policy (`require: grounded`), checked by the
    // verb — the schema only insists that a validator authored something.
  })

  test('a judgment criterion carries its declaration through', () => {
    const run = RunSchema.parse(
      criterion({ status: 'done', judgment: true, evidence: doneEvidence }),
    )
    expect(run.criteria[0]!.judgment).toBe(true)
  })

  test('judgment is reserved — a custom field may not shadow it', () => {
    expect(() => buildCriterionSchema({ judgment: 'boolean' })).toThrow(/collides with a built-in/)
  })

  test('failed without a reasoned verdict is rejected (grounded alone is not a verdict)', () => {
    expect(() =>
      RunSchema.parse(
        criterion({
          status: 'failed',
          evidence: { by: 'validator', snapshot: 's', grounded: 'test run', at: doneEvidence.at },
        }),
      ),
    ).toThrow(/failed requires a reasoned verdict/)
  })

  test('open must not carry evidence', () => {
    expect(() => RunSchema.parse(criterion({ status: 'open', evidence: doneEvidence }))).toThrow(
      /open must not carry evidence/,
    )
  })

  test('superseded requires superseded_by', () => {
    expect(() => RunSchema.parse(criterion({ status: 'superseded' }))).toThrow(
      /superseded requires superseded_by/,
    )
  })
})

describe('the close gate (schema backstop)', () => {
  test('closed with an open criterion is rejected', () => {
    expect(() => RunSchema.parse({ ...minimalRun, closed: { at: doneEvidence.at } })).toThrow(
      /closed run has unproven active criterion c1 \(open\)/,
    )
  })

  test('closed with a failed criterion is rejected', () => {
    const run = {
      goal: 'g',
      criteria: [
        {
          id: 'c1',
          text: 't',
          status: 'failed',
          evidence: { by: 'validator', snapshot: 's', verdict: 'broken', at: doneEvidence.at },
        },
      ],
      closed: { at: doneEvidence.at },
    }
    expect(() => RunSchema.parse(run)).toThrow(/unproven active criterion c1 \(failed\)/)
  })
})

describe('id integrity', () => {
  test('duplicate criterion ids are rejected', () => {
    const run = {
      goal: 'g',
      criteria: [
        { id: 'c1', text: 'a' },
        { id: 'c1', text: 'b' },
      ],
    }
    expect(() => RunSchema.parse(run)).toThrow(/duplicate criterion id c1/)
  })

  test('superseded_by must resolve to an existing criterion', () => {
    expect(() => RunSchema.parse(criterion({ status: 'superseded', superseded_by: 'c9' }))).toThrow(
      /superseded_by c9 does not resolve/,
    )
  })

  test('added_by / amended_by must resolve to an existing amendment', () => {
    expect(() => RunSchema.parse(criterion({ added_by: 'a7' }))).toThrow(
      /amendment a7 does not resolve/,
    )
  })

  test('criterion and amendment ids follow c\\d+ / a\\d+', () => {
    expect(() => RunSchema.parse({ goal: 'g', criteria: [{ id: 'x1', text: 't' }] })).toThrow()
    expect(() =>
      RunSchema.parse({
        ...minimalRun,
        amendments: [{ id: 'c1', at: doneEvidence.at, reason: 'r' }],
      }),
    ).toThrow()
  })
})

describe('custom fields (built from config)', () => {
  const schema = buildRunSchema({ commit: 'string', coverage_pct: 'number' })

  test('declared fields are typed and optional', () => {
    const run = schema.parse(
      criterion({ status: 'done', evidence: doneEvidence, commit: 'abc123', coverage_pct: 91 }),
    )
    expect(run.criteria[0]).toMatchObject({ commit: 'abc123', coverage_pct: 91 })
    expect(() => schema.parse(criterion({ commit: 42 }))).toThrow()
  })

  test('an undeclared field is a hard error (strict)', () => {
    expect(() => RunSchema.parse(criterion({ commit: 'abc123' }))).toThrow()
  })

  test('a custom field colliding with a built-in key throws ReservedField', () => {
    expect(() => buildCriterionSchema({ status: 'string' })).toThrow(/collides with a built-in/)
  })
})

describe('trail + strictness', () => {
  test('a trail entry must be a claim or a validation record', () => {
    expect(() => TrailEntrySchema.parse({ at: doneEvidence.at })).toThrow(
      /claim or a validation record/,
    )
  })

  test('unknown top-level keys are rejected (strict)', () => {
    expect(() => RunSchema.parse({ ...minimalRun, extra: true })).toThrow()
  })

  test('a run needs at least one criterion', () => {
    expect(() => RunSchema.parse({ goal: 'g', criteria: [] })).toThrow()
  })
})
