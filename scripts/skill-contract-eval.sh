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

# probe the binary for each tier's known verbs. An unknown verb prints a single line ending in
#   … · fix: known: get, status, set, ac add, ac evidence, …
# (plain text, no quotes). We take everything after the last "known: " and split on ", " into
# one verb-per-line file per tier (bash 3.2 has no associative arrays). Verbs may be two-token
# namespaced verbs ("ac add", "child add", "phase list") — kept verbatim, one per line.
for tier in phase task epic; do
  (cd "$PROBE" && $BIN "$tier" __probe__ 2>&1) \
    | grep -o 'known: .*$' | sed 's/^known: //; s/, /\'$'\n''/g; s/ *$//' > "$PROBE/$tier.verbs"
done

has() { # has <tier> <verb>   (verb may be a two-token namespaced verb, e.g. "ac add")
  case "$2" in plan|refine|build|wrap) return 0 ;; esac   # the 4 stage verbs exist on every tier
  grep -qxF "$2" "$PROBE/$1.verbs"
}

bad=0; total=0
echo "anchored skill-contract eval — binary: $BIN"
echo

# scan every plugin doc; pull concrete `anchored <tier> <verb> [subverb]` calls (placeholders like
# `anchored <tier> …` don't match — only real tier tokens do). Verbs are either a single token
# (`get`, `status`) or a two-token namespaced verb (`ac add`, `child add`, `phase list`); the
# regex captures the optional second word and we prefer the two-token match before the single.
while IFS= read -r f; do
  hits="$(grep -noE "anchored (phase|task|epic) [a-z][a-z-]+( [a-z][a-z-]+)?" "$f" 2>/dev/null || true)"
  [ -z "$hits" ] && continue
  filebad=""
  while IFS= read -r line; do
    ln="${line%%:*}"; call="${line#*:}"
    tier="$(printf '%s' "$call" | awk '{print $2}')"
    w1="$(printf '%s' "$call" | awk '{print $3}')"; w2="$(printf '%s' "$call" | awk '{print $4}')"
    total=$((total+1))
    if [ -n "$w2" ] && has "$tier" "$w1 $w2"; then continue; fi   # two-token verb is valid
    if has "$tier" "$w1"; then continue; fi                       # single-token verb is valid
    verb="$w1"; [ -n "$w2" ] && verb="$w1 $w2"
    filebad+=$'\n'"    INVALID  $f:$ln  →  anchored $tier $verb   (no such verb on $tier)"
    bad=$((bad+1))
  done <<< "$hits"
  [ -n "$filebad" ] && printf '  %s%s\n' "${f#"$ROOT"/}" "$filebad"
done < <(find "$ROOT/plugin" -name "*.md" | sort)

echo
echo "== checked $total concrete 'anchored <tier> <verb>' calls across the plugin =="
if [ "$bad" -eq 0 ]; then echo "ALL VERB REFERENCES VALID ✓"; else echo "$bad INVALID reference(s) ✗"; exit 1; fi
