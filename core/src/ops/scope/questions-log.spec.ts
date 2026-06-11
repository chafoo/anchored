import { test, expect } from 'bun:test'
import { addQuestion, resolveQuestion } from './questions.js'
import { appendLog } from './log.js'
import { createNodeOps, type NodeOpsDeps } from '../node-ops.js'
import { taskDescriptor } from '../../schema/tiers/task.js'

// a1 — add → resolve cycle over the default-template field shape
test('add-question then resolve-question', () => {
  const opened = addQuestion([], { text: 'spawn mode?', priority: 'high', origin: 'scaffold' })
  expect(opened[0]).toMatchObject({
    id: 'q1',
    status: 'open',
    priority: 'high',
    origin: 'scaffold',
  })
  const resolved = resolveQuestion(opened, 'q1', {
    answer: 'both modes',
    source: 'user',
    reasoning: 'no MVP',
  })
  expect(resolved[0]).toMatchObject({
    status: 'resolved',
    answer: 'both modes',
    source: 'user',
    reasoning: 'no MVP',
  })
})

// decision-trail F7 — an AI-resolved question REQUIRES reasoning (invariant)
test('resolve-question source=ai without reasoning throws; with reasoning ok', () => {
  const opened = addQuestion([], { text: 'lib?', priority: 'low' })
  expect(() => resolveQuestion(opened, 'q1', { answer: 'X', source: 'ai' })).toThrow(/reasoning/i)
  const ok = resolveQuestion(opened, 'q1', {
    answer: 'X',
    source: 'ai',
    reasoning: 'X is spec-correct',
  })
  expect(ok[0]).toMatchObject({ status: 'resolved', source: 'ai', reasoning: 'X is spec-correct' })
})

// a2 — log append is immutable: order preserved, first entry untouched
test('log append-only: order preserved, existing entry untouched', () => {
  const first = { at: 'p1', kind: 'decision', note: 'one' }
  const log1 = appendLog([], first)
  const log2 = appendLog(log1, { at: 'p2', kind: 'learning', note: 'two' })
  expect(log2.length).toBe(2)
  expect(log2[0]).toEqual(first)
  expect(log2[1]?.note).toBe('two')
})

// a3 — node-ops question/log verbs persist through io.atomicWrite
test('question + log mutations write through io.atomicWrite', async () => {
  const writes: string[] = []
  const deps: NodeOpsDeps = {
    io: {
      async atomicWrite(path: string) {
        writes.push(path)
      },
      async readFile() {
        return ''
      },
    },
    render: (n) => JSON.stringify(n),
    parse: (r) => JSON.parse(r),
    pathFor: (s) => s,
  }
  const ops = createNodeOps(taskDescriptor, deps)
  // persist now validates the full task schema before write (G1) → complete nodes
  const node = { schema_version: 2, slug: 't', title: 'T', status: 'plan' }
  await ops.addQuestion(node, { text: 'x', priority: 'low' })
  await ops.appendLog(node, { at: 'p', kind: 'decision', note: 'n' })
  expect(writes.length).toBe(2)
})
