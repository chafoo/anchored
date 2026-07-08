import { describe, test, expect } from 'bun:test'
import { safeWrite, type SafeWriteDeps } from './safe-write.js'
import type { FileSystem, Lock } from '../../../lib/contracts/fs.js'
import type { AnchoredError } from '../../../lib/utils/error.js'

function memFs(versions = new Map<string, string>()) {
  const files = new Map<string, string>()
  const fs: FileSystem = {
    readFile: async (p) => files.get(p) ?? '',
    writeFile: async (p, d) => void files.set(p, d),
    rename: async (a, b) => {
      files.set(b, files.get(a)!)
      files.delete(a)
    },
    unlink: async (p) => void files.delete(p),
    mkdir: async () => undefined,
    readdir: async () => [],
    stat: async (p) => versions.get(p),
  }
  return { files, fs }
}

function deps(fs: FileSystem, lock?: Lock): SafeWriteDeps {
  return {
    fs,
    lock: lock ?? { acquire: async () => async () => {} },
    rand: () => 'r',
    pid: () => 7,
  }
}

describe('safeWrite', () => {
  test('happy path: temp write + atomic rename, no temp residue', async () => {
    const { files, fs } = memFs()
    await safeWrite(deps(fs), '/runs/r1.yml', 'content')
    expect(files.get('/runs/r1.yml')).toBe('content')
    expect([...files.keys()]).toEqual(['/runs/r1.yml'])
  })

  test('an unacquirable lock throws WriteContention', async () => {
    const { fs } = memFs()
    const stuck: Lock = {
      acquire: async () => {
        throw new Error('held elsewhere')
      },
    }
    try {
      await safeWrite(deps(fs, stuck), '/runs/r1.yml', 'c')
      expect.unreachable()
    } catch (e) {
      expect((e as AnchoredError).kind).toBe('WriteContention')
    }
  })

  test('a CAS mismatch under the lock rejects and writes nothing', async () => {
    const versions = new Map([['/runs/r1.yml', 'v2']])
    const { files, fs } = memFs(versions)
    files.set('/runs/r1.yml', 'original')
    try {
      await safeWrite(deps(fs), '/runs/r1.yml', 'clobber', 'v1')
      expect.unreachable()
    } catch (e) {
      expect((e as AnchoredError).kind).toBe('WriteContention')
      expect((e as AnchoredError).suggestions?.[0]).toMatch(/re-read/)
    }
    expect(files.get('/runs/r1.yml')).toBe('original')
  })

  test('the lock is released even when the write throws', async () => {
    const { fs } = memFs()
    let released = false
    const lock: Lock = { acquire: async () => async () => void (released = true) }
    const failing: FileSystem = {
      ...fs,
      writeFile: async () => {
        throw new Error('disk full')
      },
    }
    expect(safeWrite(deps(failing, lock), '/runs/r1.yml', 'c')).rejects.toThrow('disk full')
    await Bun.sleep(0)
    expect(released).toBe(true)
  })
})
