#!/usr/bin/env bash
# guard-prose.sh — central guard for the plugin-prose tickets (dogfood-fixings-4).
#
# Asserts the user-facing prose stays clean. Each ticket extends this script with
# its own block; today it covers jargon-scrub. Exit 0 = all green, 1 = a violation
# (so it can wire into a build gate / CI). Run from the repo root.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REFS="$ROOT/plugin/references"
SKILLS="$ROOT/plugin/skills"
fail=0
pass() { printf '  ok   %s\n' "$1"; }
bad()  { printf '  FAIL %s\n' "$1"; fail=1; }

echo "== jargon-scrub =="

# 1) The universal hard-rule is present in communication-style.md.
if grep -q "Hard rule on framework-process jargon" "$REFS/communication-style.md"; then
  pass "universal jargon hard-rule present in communication-style.md"
else
  bad "missing 'Hard rule on framework-process jargon' in communication-style.md"
fi

# 2) The mapping table carries every listed framework term (left column).
terms=("dependency graph" "just-in-time" scaffold stub seam grounding "roll-up" "outcome acceptance criterion" executor "each:task" drafted refined concern)
missing=""
for t in "${terms[@]}"; do
  # table rows look like:  | <term> ... | <plain language> |
  grep -qE "^\| .*${t}.* \|.*\|" "$REFS/communication-style.md" || missing+=" $t"
done
if [ -z "$missing" ]; then
  pass "mapping table covers all ${#terms[@]} framework terms"
else
  bad "mapping table missing term(s):$missing"
fi

# 3) No listed jargon leaks into a Prefer / plain-words cell (the LAST cell of any
#    table row) across communication-style.md + the four SKILLs. The left columns
#    (Avoid demos + the mapping's own term column) may name jargon by design — we
#    only scan the user-facing right-hand cell.
jargon='refined|drafted|scaffold|[Ss]tub|seam|grounding|roll-up|outcome-AC|executor|each:task|concern|\bDAG\b|\bJIT\b'
scan_prefer() {
  local file="$1"
  # last content cell of pipe-table rows, minus the mapping table's own plain-words
  # (which paraphrases the terms in plain words and must stay readable).
  awk -F'|' 'NF>=3 && $0 ~ /^\|/ {print $(NF-1)}' "$file" \
    | grep -vE "the plan's ready \(a draft\)|the plan's been checked" \
    | grep -nE "$jargon"
}
leak=""
for f in "$REFS/communication-style.md" "$SKILLS"/{plan,refine,build,wrap}/SKILL.md; do
  hit="$(scan_prefer "$f")" || true
  [ -n "$hit" ] && leak+="\n  $f:\n$(echo "$hit" | sed 's/^/    /')"
done
if [ -z "$leak" ]; then
  pass "no framework jargon in any Prefer/partner-voice cell"
else
  bad "jargon leaked into a Prefer cell:"; printf '%b\n' "$leak"
fi

# 4) Each of the four SKILLs carries the mapping-apply line.
for s in plan refine build wrap; do
  if grep -q "apply the jargon mapping from" "$SKILLS/$s/SKILL.md"; then
    pass "$s/SKILL.md applies the jargon mapping"
  else
    bad "$s/SKILL.md missing the jargon-mapping line"
  fi
done

# 5) question-style.md links the mapping table.
if grep -q "jargon mapping table in .communication-style.md." "$REFS/question-style.md"; then
  pass "question-style.md links the jargon mapping table"
else
  bad "question-style.md does not link the jargon mapping table"
fi

echo "== question-discipline =="
QD="$REFS/question-discipline.md"

# 1) the reference exists + carries the four generalized v1 directives.
if [ -f "$QD" ]; then pass "question-discipline.md exists"; else bad "question-discipline.md missing"; fi
while IFS= read -r marker; do
  [ -z "$marker" ] && continue
  if grep -qF "$marker" "$QD" 2>/dev/null; then pass "directive: $marker"; else bad "question-discipline.md missing directive: $marker"; fi
done <<'MARKERS'
under-surface is the failure mode
that IS the question
by impact, not difficulty
MARKERS

# 2) it explicitly distinguishes itself from question-style.md (WHEN vs HOW).
if grep -qF "WHEN you raise one at all" "$QD" 2>/dev/null; then
  pass "question-discipline delimits WHEN vs question-style's HOW"
else
  bad "question-discipline.md missing the WHEN-vs-HOW boundary"
fi

# 3) all five question-authoring agents link it + carry a tier Question lens.
for a in plan-decompose epic-decompose refine-plan-check refine-rules-check epic-plan-check; do
  af="$ROOT/plugin/agents/$a.md"
  if grep -q "question-discipline.md" "$af" 2>/dev/null; then pass "$a links question-discipline"; else bad "$a does not link question-discipline"; fi
  if grep -q "Question lens" "$af" 2>/dev/null; then pass "$a carries a Question lens"; else bad "$a missing a Question lens"; fi
done

echo "== fanout-fastest-safe =="
RF="$SKILLS/refine/SKILL.md"
BF="$SKILLS/build/SKILL.md"

# 1) executor default flipped to the fastest safe path (workflow), not sequential.
if grep -qF "Default to the fastest safe path" "$RF"; then
  pass "refine defaults the executor to the fastest safe path"
else
  bad "refine missing the 'fastest safe path' default"
fi
if grep -qF "(sequential, the default)" "$RF"; then
  bad "refine still calls sequential 'the default' (old conservative default)"
else
  pass "old 'sequential, the default' wording is gone"
fi

# 2) the safety-floor stays, framed as correctness (not speed-vs-quality).
if grep -qF "Safety-floor" "$RF" && grep -qF "correctness, NOT" "$RF"; then
  pass "safety-floor preserved + framed as correctness"
else
  bad "refine missing the correctness-framed safety-floor"
fi

# 3) the ephemeral speed-vs-watchability preference, explicitly never-a-quality-call.
if grep -qF "the quality is identical" "$RF" && grep -qF "speed vs. watching" "$RF"; then
  pass "refine asks the speed-vs-watch preference (quality identical)"
else
  bad "refine missing the speed-vs-watch preference"
fi

# 4) build: worktree isolation is a directive for fan-out, not a caveat.
if grep -qF "directive, not caveat" "$BF"; then
  pass "build states worktree isolation as a directive"
else
  bad "build missing the worktree-isolation directive"
fi
if grep -qF "Fan-out caveat" "$BF"; then
  bad "build still frames worktree isolation as a 'Fan-out caveat'"
else
  pass "old 'Fan-out caveat' framing is gone"
fi

echo
if [ "$fail" -eq 0 ]; then echo "guard-prose: ALL GREEN"; else echo "guard-prose: VIOLATIONS"; fi
exit "$fail"
