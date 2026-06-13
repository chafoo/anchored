// spawn.ts — the injected AI seam. createSpawn(cfg, deps) → { run(input) }, the
// exact contract worker-step + loop-step call. Two interchangeable impls behind
// ONE seam: headless `claude -p` (via injected exec) and in-process subagent (via
// injected agent). The runners only ever see `run` — the mode is cfg/env only.
// No real AI here, no module-level child_process import (effects are injected).

export interface SpawnInput {
  tier: string
  slug: string
  stage: string
  instructions: string
  cwd?: string
  context?: string
  /** workflow-mode hook: 'implement' | 'workflow' — passed through to the worker. */
  executor?: string
}

/** Discriminated, machine-parseable result (cli-only-transport: data, not prose). */
export interface SpawnResult {
  ok: boolean
  kind: string
  evidence?: string[]
  stdout?: string
  error?: string
}

export interface ExecResult {
  code: number
  stdout: string
  stderr: string
}

export interface AgentResult {
  ok: boolean
  evidence?: string[]
  output?: string
}

export interface SpawnDeps {
  /** headless seam — a node:child_process wrapper, injected at wiring time. */
  exec?: (argv: string[], opts: { cwd?: string }) => Promise<ExecResult>
  /** subagent seam — the in-session CC agent()/Task tool, injected at wiring time. */
  agent?: (req: {
    instructions: string
    context?: string
    executor?: string
  }) => Promise<AgentResult>
  /** env seam — reads an override var without touching process.env directly. */
  env?: (name: string) => string | undefined
}

export interface SpawnCfg {
  spawn?: { mode?: string; model?: string }
}

const MODE_ENV = 'ANCHORED_SPAWN_MODE'

function buildClaudeArgv(input: SpawnInput, cfg: SpawnCfg): string[] {
  const argv = ['claude', '-p', input.instructions]
  if (cfg.spawn?.model) argv.push('--model', cfg.spawn.model)
  argv.push('--output-format', 'json') // structured output
  return argv
}

async function runHeadless(
  input: SpawnInput,
  cfg: SpawnCfg,
  deps: SpawnDeps,
): Promise<SpawnResult> {
  if (!deps.exec) return { ok: false, kind: 'config-error', error: 'headless mode needs deps.exec' }
  const argv = buildClaudeArgv(input, cfg)
  try {
    const r = await deps.exec(argv, { cwd: input.cwd })
    if (r.code !== 0) {
      return {
        ok: false,
        kind: 'exec-failed',
        error: `claude -p exited ${r.code}: ${r.stderr}`,
        stdout: r.stdout,
      }
    }
    if (r.stdout.trim() === '') {
      return { ok: false, kind: 'empty-output', error: 'claude -p produced no output' }
    }
    return { ok: true, kind: 'headless', stdout: r.stdout }
  } catch (e) {
    return { ok: false, kind: 'exec-error', error: (e as Error).message }
  }
}

async function runSubagent(input: SpawnInput, deps: SpawnDeps): Promise<SpawnResult> {
  if (!deps.agent)
    return { ok: false, kind: 'config-error', error: 'subagent mode needs deps.agent' }
  try {
    const r = await deps.agent({
      instructions: input.instructions,
      context: input.context,
      executor: input.executor,
    })
    return { ok: r.ok, kind: 'subagent', evidence: r.evidence, stdout: r.output }
  } catch (e) {
    return { ok: false, kind: 'agent-error', error: (e as Error).message }
  }
}

export function createSpawn(cfg: SpawnCfg, deps: SpawnDeps) {
  // resolution precedence: env override > cfg > default(headless)
  const resolveMode = (): string => deps.env?.(MODE_ENV) ?? cfg.spawn?.mode ?? 'headless'
  return {
    async run(input: SpawnInput): Promise<SpawnResult> {
      const mode = resolveMode()
      if (mode === 'headless') return runHeadless(input, cfg, deps)
      if (mode === 'subagent') return runSubagent(input, deps)
      return {
        ok: false,
        kind: 'config-error',
        error: `unknown spawn mode '${mode}' (expected headless|subagent)`,
      }
    },
  }
}

/** Injectable test-double: scripted results + recorded inputs. Used by the engine
 *  tests so the runners are exercised without real CC. */
export function createFakeSpawn(scripted: SpawnResult[] = []) {
  const calls: SpawnInput[] = []
  let i = 0
  return {
    calls,
    spawn: {
      async run(input: SpawnInput): Promise<SpawnResult> {
        calls.push(input)
        return scripted[i++] ?? { ok: true, kind: 'fake', evidence: ['fake evidence'] }
      },
    },
  }
}
