// config/init.ts — createInit(deps): lazy first-run scaffolding. On the first
// anchored call in a project it (1) writes a MINIMAL anchored.yml (schema-directive
// + a pointer comment at the reference default — NOT a copy of the default config;
// the defaults are immutable, a copy would drift) and (2) appends `Bash(anchored *)`
// to .claude/settings.local.json so the CLI calls (incl. background workflows) run
// without a permission prompt. Both writes are idempotent and go through the
// injected io seam — no direct node:fs in this logic. Factory, fakeable.
import { anchoredError } from '../state/invariants/invariants.js'

export interface InitDeps {
  io: {
    atomicWrite(path: string, content: string): Promise<void>
    readFile(path: string): Promise<string>
  }
}

const ALLOW_ENTRY = 'Bash(anchored *)'

const MINIMAL_YML = `# yaml-language-server: $schema=https://raw.githubusercontent.com/chafoo/anchored/main/plugin/references/task.schema.json
# anchored.yml — your project deltas only. Everything not set here falls back to the
# framework defaults. The full default view (every tier's stages + fields) lives at:
#   plugin/references/anchored.default.yml   ← reference, do NOT copy it here.
# Add only what you want to OVERRIDE; an empty file means "use all defaults".
`

/** Build createIo-style atomic-write over the injected io.atomicWrite seam. */
export function createInit(deps: { io: InitDeps['io'] }) {
  const { io } = deps

  const exists = async (path: string): Promise<boolean> => {
    try {
      await io.readFile(path)
      return true
    } catch {
      return false
    }
  }

  return {
    /** Ensure the minimal anchored.yml + the Bash(anchored *) allowlist exist.
     *  Idempotent: never overwrites an existing anchored.yml, never duplicates the
     *  allow entry. Returns what (if anything) it wrote. */
    async ensure(projectRoot: string): Promise<{ wroteYml: boolean; wroteAllowlist: boolean }> {
      const ymlPath = `${projectRoot}/anchored.yml`
      const settingsPath = `${projectRoot}/.claude/settings.local.json`

      // 1. minimal anchored.yml — only when absent (never clobber user config)
      let wroteYml = false
      if (!(await exists(ymlPath))) {
        await io.atomicWrite(ymlPath, MINIMAL_YML)
        wroteYml = true
      }

      // 2. Bash(anchored *) allowlist — merge into existing settings, idempotent
      const wroteAllowlist = await ensureAllowlist(io, settingsPath)

      return { wroteYml, wroteAllowlist }
    },
  }
}

interface SettingsShape {
  permissions?: { allow?: string[]; [k: string]: unknown }
  [k: string]: unknown
}

async function ensureAllowlist(io: InitDeps['io'], settingsPath: string): Promise<boolean> {
  let settings: SettingsShape
  let existing = false
  let raw: string | undefined
  try {
    raw = await io.readFile(settingsPath)
    existing = true
  } catch {
    raw = undefined
  }
  if (raw === undefined) {
    settings = {}
  } else {
    try {
      settings = JSON.parse(raw) as SettingsShape
    } catch {
      throw anchoredError('SettingsParse', `${settingsPath} is not valid JSON`, [
        'fix or remove the file, then re-run anchored',
      ])
    }
  }

  const permissions = (settings.permissions ??= {})
  const allow = (permissions.allow ??= [])
  if (allow.includes(ALLOW_ENTRY)) return false // idempotent — already present

  allow.push(ALLOW_ENTRY)
  // preserve everything else; emit valid, stable JSON
  await io.atomicWrite(settingsPath, JSON.stringify(settings, null, 2) + (existing ? '\n' : '\n'))
  return true
}
