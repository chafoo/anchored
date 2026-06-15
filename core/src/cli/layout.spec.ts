import { test, expect } from 'bun:test'
import { pathFor, archivePathFor } from './layout.js'

const R = '/p'

test('pathFor: epic → its folder/_epic.yml; in-epic task → epic folder; standalone task → tasks/', () => {
  expect(pathFor(R, 'my-epic', 'epic')).toBe('/p/.claude/anchored/my-epic/_epic.yml')
  expect(pathFor(R, 'my-epic/login', 'task')).toBe('/p/.claude/anchored/my-epic/login.yml')
  expect(pathFor(R, 'solo', 'task')).toBe('/p/.claude/anchored/tasks/solo.yml')
  // phase reads task files → tier 'task' on the task slug, same mapping
  expect(pathFor(R, 'my-epic/login', 'task')).toBe('/p/.claude/anchored/my-epic/login.yml')
})

test('archivePathFor: an epic moves its FOLDER; a task moves its FILE', () => {
  expect(archivePathFor(R, 'my-epic', 'epic')).toEqual({
    from: '/p/.claude/anchored/my-epic',
    to: '/p/.claude/anchored/_archive/my-epic',
  })
  expect(archivePathFor(R, 'solo', 'task')).toEqual({
    from: '/p/.claude/anchored/tasks/solo.yml',
    to: '/p/.claude/anchored/_archive/tasks/solo.yml',
  })
  expect(archivePathFor(R, 'my-epic/login', 'task')).toEqual({
    from: '/p/.claude/anchored/my-epic/login.yml',
    to: '/p/.claude/anchored/_archive/my-epic/login.yml',
  })
})
