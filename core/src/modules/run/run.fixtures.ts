// modules/run/run.fixtures.ts — shared test DATA (sample runs). Mirrors the states of
// docs/examples/fix-navbar.yml. Test-support: build-excluded, no spec of its own.

/** The smallest valid run — schema defaults fill rigor/amendments/trail. */
export const minimalRun = {
  goal: 'Fix the thing',
  criteria: [{ id: 'c1', text: 'it works' }],
}

/** A proven criterion’s evidence block. */
export const doneEvidence = {
  by: 'validator',
  snapshot: '3f2a91c',
  grounded: 'web-inspector screenshot at 375px + `bun test navbar.layout`, exit 0',
  at: '2026-07-08T14:32:00Z',
}

/** Mid-flight: done + failed + superseded (via amendment) + open — every state visible. */
export const midFlightRun = {
  rigor: 'standard',
  goal: 'Navbar overflow on mobile is fixed without changing desktop behavior',
  plan: 'Accepted plan (plan mode, 2026-07-08):\n1. Replace fixed widths.\n2. Add a 375px viewport test.\n3. Desktop stays identical.\n',
  amendments: [
    {
      id: 'a1',
      at: '2026-07-08T14:40:00Z',
      reason: '.nav-actions is shared with the footer — extract a shared token instead.',
    },
  ],
  criteria: [
    {
      id: 'c1',
      text: 'Navbar items wrap correctly at 375px viewport width',
      setup: 'frontend',
      gate: 'layout',
      status: 'done',
      evidence: doneEvidence,
    },
    {
      id: 'c2',
      text: 'No horizontal scrollbar on any breakpoint',
      setup: 'frontend',
      gate: 'layout',
      status: 'superseded',
      superseded_by: 'c5',
      amended_by: 'a1',
    },
    {
      id: 'c3',
      text: 'Desktop navbar is pixel-identical to before',
      setup: 'frontend',
      gate: 'final',
      status: 'open',
    },
    {
      id: 'c4',
      text: 'Solution follows the existing layout-component pattern',
      setup: 'frontend',
      gate: 'final',
      judgment: true, // pattern fidelity: nothing to execute — prose may prove it
      status: 'failed',
      evidence: {
        by: 'validator',
        snapshot: '3f2a91c',
        verdict: 'introduces a bespoke NavFlex wrapper instead of layout/Flex.vue',
        at: '2026-07-08T14:32:00Z',
      },
    },
    {
      id: 'c5',
      text: '.nav-actions width comes from a shared token',
      setup: 'frontend',
      gate: 'layout-2',
      status: 'open',
      added_by: 'a1',
    },
  ],
  trail: [
    {
      at: '2026-07-08T14:12:00Z',
      claim: 'replaced fixed widths in Navbar.vue with the flex layout components',
      refs: ['c1', 'c2'],
    },
    {
      at: '2026-07-08T14:31:00Z',
      gate: 'layout',
      validated: 'requested c1, c4',
      snapshot: '3f2a91c',
    },
  ],
}

/** A legally closed run: every ACTIVE criterion is done; superseded stays visible. */
export const closedRun = {
  goal: 'Small docs sweep',
  rigor: 'light',
  criteria: [
    { id: 'c1', text: 'links resolve', status: 'done', evidence: doneEvidence },
    {
      id: 'c2',
      text: 'obsolete wording',
      status: 'superseded',
      superseded_by: 'c1',
    },
  ],
  closed: { at: '2026-07-08T15:00:00Z' },
}
