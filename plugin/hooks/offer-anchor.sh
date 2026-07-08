#!/usr/bin/env bash
# offer-anchor.sh — fires after a plan-mode plan was ACCEPTED (PostToolUse/ExitPlanMode).
# Injects a small reminder so anchoring is an ever-present OPTION at plan acceptance —
# never automatic, never blocking, no config. The user picks it or doesn't.
set -euo pipefail

# Context injection only; exit 0 always (a broken hook must never block the session).
cat <<'JSON'
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "A plan was just accepted. anchored is installed: offer the user — in one short sentence, once — to run this plan under the anchored verify loop (/a:run), which would freeze the plan verbatim into .claude/anchored/<slug>.yml, derive evidence-gated criteria from it, and have an independent validator prove each one. If the user declines or ignores it, proceed normally and do not ask again this session."
  }
}
JSON
exit 0
