import { describe, expect, it } from 'bun:test'

describe('package entry', () => {
  it('loads without side effects', async () => {
    const mod = await import('./index.js')
    expect(mod).toBeDefined()
  })
})
