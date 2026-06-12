#!/usr/bin/env node
// PreToolUse hook — structural enforcement of cli-only-transport (F8 + B5).
//
// Blocks raw mutations of anchored task-files (.claude/tasks/**/*.yml and any
// _epic.yml). Task-files are CLI-only: every mutation MUST go through the
// validating `anchored` CLI (which enforces the hard invariant — no ac→done
// without evidence — and atomic writes). Source-code files are NOT touched.
//
// Two surfaces are covered:
//   • Write/Edit/MultiEdit  → the tool's `file_path` is a task-file.
//   • Bash                  → the command writes to a task-file (redirect, tee,
//     sed -i, cp/mv destination, or a python/node open(...,'w')). This closes the
//     gap where an agent bypassed the CLI via `echo > …yml` / `python > …yml`
//     (B5). Reads are intentionally NOT blocked — read-only access can't corrupt
//     the substrate; `anchored node read` is merely recommended.
//
// Scope escape (per q2): the main session's planning/design phase may still edit
// task-files by hand — set ANCHORED_TASKFILE_EDIT=1 in the environment to opt out.
// Build-time agents run without that flag, so they are structurally forced to the
// CLI.
//
// Deny protocol: exit code 2 + a message on stderr (Claude Code blocks the tool
// call and surfaces the message to the model).

const TASK_FILE_PATH = /\.claude\/tasks\/[^\s'"]*\.ya?ml/
const EPIC_FILE_PATH = /(^|\/)_epic\.ya?ml/

// Heuristic: does a Bash command WRITE to a task-file? Matches the common write
// shapes; reads (cat/grep/less/head/tail) are deliberately not matched. Best-effort
// defence-in-depth — the authoritative guard is the validating CLI (persist), since
// an allowlist-of-shapes can never be exhaustive (see the header note).
function bashWritesTaskFile(cmd) {
  const hits = (re) => re.test(cmd)
  // a task-file path token — with a leading path-prefix so ABSOLUTE paths match too
  // (Q2: the .claude/tasks branch used to require the path to START at .claude, so
  // `echo x > /abs/.../.claude/tasks/foo.yml` — the common form — slipped through).
  const P = `[^\\s'"|&;>]*`
  const tasks = `(?:${P}\\.claude\\/tasks\\/${P}\\.ya?ml|${P}_epic\\.ya?ml)`
  return (
    // redirect into a task-file:  > x.yml   >> x.yml   >| x.yml
    hits(new RegExp(`>>?\\|?\\s*['"]?${tasks}`)) ||
    // tee x.yml
    hits(new RegExp(`\\btee\\b[^|&;]*${tasks}`)) ||
    // in-place edit: sed -i … / perl -i … / gawk -i inplace … x.yml
    hits(new RegExp(`\\b(?:sed|perl)\\b[^|&;]*-i\\b[^|&;]*${tasks}`)) ||
    hits(new RegExp(`\\bgawk\\b[^|&;]*-i[^|&;]*inplace[^|&;]*${tasks}`)) ||
    // dd of=…x.yml  /  truncate … x.yml
    hits(new RegExp(`\\bdd\\b[^|&;]*\\bof=['"]?${tasks}`)) ||
    hits(new RegExp(`\\btruncate\\b[^|&;]*${tasks}`)) ||
    // cp/mv/install … x.yml  (writing TO a task-file as the destination)
    hits(new RegExp(`\\b(?:cp|mv|install)\\b[^|&;]*${tasks}`)) ||
    // python/node opening a task-file for writing:  open('…x.yml', 'w') / write_text
    hits(new RegExp(`open\\s*\\([^)]*${tasks}[^)]*['"][wa]`)) ||
    hits(new RegExp(`write_text\\s*\\(`)) && hits(new RegExp(tasks)) ||
    // node fs writers fed a task path
    hits(new RegExp(`(?:writeFileSync|writeFile|appendFileSync|appendFile)\\s*\\([^)]*${tasks}`))
  )
}

let raw = ''
process.stdin.on('data', (d) => (raw += d))
process.stdin.on('end', () => {
  let tool = ''
  let filePath = ''
  let command = ''
  try {
    const input = JSON.parse(raw)
    tool = input.tool_name || ''
    const ti = input.tool_input || {}
    filePath = ti.file_path || ''
    command = ti.command || ''
  } catch {
    process.exit(0) // can't parse → don't block (fail-open on malformed input)
  }

  const editTools = tool === 'Write' || tool === 'Edit' || tool === 'MultiEdit'
  // Q4a: the ANCHORED_TASKFILE_EDIT opt-out is ONLY for the main session's manual
  // planning edits via the Write/Edit tools — it must NOT excuse Bash writes (a
  // build-time agent that inherits the flag in its env could otherwise echo > …yml
  // straight past the CLI). Bash writes are always blocked.
  const optedOut = process.env.ANCHORED_TASKFILE_EDIT === '1'
  const editHit =
    editTools && !optedOut && (TASK_FILE_PATH.test(filePath) || EPIC_FILE_PATH.test(filePath))
  const bashHit = tool === 'Bash' && bashWritesTaskFile(command)

  if (editHit || bashHit) {
    const what = editHit ? `'${filePath}'` : 'a task-file via Bash'
    process.stderr.write(
      `anchored: ${what} — task-files are CLI-only. Mutate via 'anchored node …' ` +
        `(the CLI enforces the no-done-without-evidence invariant + atomic writes). ` +
        `Reading is fine via 'anchored node read'. ` +
        `To clean up / reset a run, use the CLI verbs — 'anchored archive <slug>' ` +
        `(freeze + branches) or 'anchored reset <slug>' (remove + branches); never ` +
        `mv/rm the file by hand. To override for a manual planning edit, set ` +
        `ANCHORED_TASKFILE_EDIT=1.\n`,
    )
    process.exit(2) // block
  }
  process.exit(0) // allow
})
