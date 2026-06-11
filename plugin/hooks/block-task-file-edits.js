#!/usr/bin/env node
// PreToolUse hook — structural enforcement of cli-only-transport (F8).
//
// Blocks raw Write/Edit/MultiEdit on anchored task-files (.claude/tasks/**/*.yml
// and any _epic.yml). Task-files are CLI-only: every mutation MUST go through the
// validating `anchored` CLI (which enforces the hard invariant — no ac→done
// without evidence — and atomic writes). Source-code files are NOT touched.
//
// Scope escape (per q2): the main session's planning/design phase may still edit
// task-files by hand — set ANCHORED_TASKFILE_EDIT=1 in the environment to opt out.
// Build-time agents run without that flag, so they are structurally forced to the
// CLI.
//
// Deny protocol: exit code 2 + a message on stderr (Claude Code blocks the tool
// call and surfaces the message to the model).

let raw = ''
process.stdin.on('data', (d) => (raw += d))
process.stdin.on('end', () => {
  let filePath = ''
  try {
    const input = JSON.parse(raw)
    filePath = (input.tool_input && input.tool_input.file_path) || ''
  } catch {
    process.exit(0) // can't parse → don't block (fail-open on malformed input)
  }

  const isTaskFile = /\.claude\/tasks\/.*\.ya?ml$/.test(filePath) || /(^|\/)_epic\.ya?ml$/.test(filePath)
  if (isTaskFile && process.env.ANCHORED_TASKFILE_EDIT !== '1') {
    process.stderr.write(
      `anchored: '${filePath}' is a task-file — task-files are CLI-only. ` +
        `Mutate it via 'anchored node …' (the CLI enforces the no-done-without-evidence ` +
        `invariant + atomic writes). To override for a manual planning edit, set ` +
        `ANCHORED_TASKFILE_EDIT=1.\n`,
    )
    process.exit(2) // block
  }
  process.exit(0) // allow
})
