#!/usr/bin/env bash
# skill-contract-eval.sh — deterministic per-file validation that every `anchored <tier> <verb>`
# the plugin (skills + agents + references) invokes actually EXISTS in the v3 core CLI, with the
# tier it is addressed on. Catches integration drift (a skill calling a renamed/removed/invented
# verb) without AI. The verb lists are probed LIVE from the real binary (ground truth).
#
#   bash scripts/skill-contract-eval.sh            # uses the global `anchored` (or core/dist/bin.js)
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="${ANCHORED:-anchored}"; command -v "$BIN" >/dev/null 2>&1 || BIN="node $ROOT/core/dist/bin.js"
PROBE="$(mktemp -d)"; trap 'rm -rf "$PROBE"' EXIT

# probe the binary for each tier's known verbs (an unknown verb prints "known: a, b, c"),
# one verb-per-line file per tier (bash 3.2 has no associative arrays).
for tier in phase task epic project; do
  (cd "$PROBE" && $BIN "$tier" __probe__ 2>&1) \
    | grep -o '"known: [^"]*"' | sed 's/"known: //; s/"$//; s/, /\'$'\n''/g' > "$PROBE/$tier.verbs"
done

has() { # has <tier> <verb>
  case "$2" in plan|refine|build|wrap) return 0 ;; esac   # the 4 stage verbs exist on every tier
  grep -qxF "$2" "$PROBE/$1.verbs"
}

bad=0; total=0
echo "anchored skill-contract eval — binary: $BIN"
echo

# scan every plugin doc; pull concrete `anchored <tier> <verb>` calls (placeholders like
# `anchored <tier> …` don't match — only real tier tokens do).
while IFS= read -r f; do
  hits="$(grep -noE "anchored (phase|task|epic|project) [a-z][a-z-]*" "$f" 2>/dev/null || true)"
  [ -z "$hits" ] && continue
  filebad=""
  while IFS= read -r line; do
    ln="${line%%:*}"; call="${line#*:}"
    tier="$(printf '%s' "$call" | awk '{print $2}')"; verb="$(printf '%s' "$call" | awk '{print $3}')"
    total=$((total+1))
    if ! has "$tier" "$verb"; then
      filebad+=$'\n'"    INVALID  $f:$ln  →  anchored $tier $verb   (no such verb on $tier)"
      bad=$((bad+1))
    fi
  done <<< "$hits"
  [ -n "$filebad" ] && printf '  %s%s\n' "${f#"$ROOT"/}" "$filebad"
done < <(find "$ROOT/plugin" -name "*.md" | sort)

echo
echo "== checked $total concrete 'anchored <tier> <verb>' calls across the plugin =="
if [ "$bad" -eq 0 ]; then echo "ALL VERB REFERENCES VALID ✓"; else echo "$bad INVALID reference(s) ✗"; exit 1; fi
