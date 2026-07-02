#!/usr/bin/env bash
# smoke.sh — drive the ENTIRE anchored v3 CLI surface through the real binary, once each.
# Not a benchmark — a "does every function work" smoke + a hands-on demo you can re-run.
# Runs in a throwaway temp project; prints ok/FAIL per call + a final tally. Exit 1 on any fail.
#
#   bash scripts/smoke.sh            # uses core/dist/bin.js (run `npm --prefix core run build` first)
#   ANCHORED=/path/to/anchored bash scripts/smoke.sh   # or point at any anchored binary
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="${ANCHORED:-node $ROOT/core/dist/bin.js}"
DIR="$(mktemp -d -t anchored-smoke-XXXX)"
pass=0; fail=0
trap 'rm -rf "$DIR"' EXIT

# run a verb in the temp project; $1 = expect:
#   ok  → JSON envelope with "ok":true   ·   err → "ok":false   ·   out → plain text, exit 0 (meta verbs)
run() {
  local expect="$1"; shift
  # --json so the envelope (with "ok":true/false) is emitted — the default output is the readable line.
  local out code; out="$(cd "$DIR" && $BIN "$@" --json 2>&1)"; code=$?
  local got; got="$(printf '%s' "$out" | grep -o '"ok":[a-z]*' | head -1 | cut -d: -f2)"
  local good=1
  case "$expect" in
    ok)  [ "$got" = true ]  && good=0 ;;
    err) [ "$got" = false ] && good=0 ;;
    out) [ "$code" -eq 0 ] && [ -n "$out" ] && good=0 ;;
  esac
  if [ "$good" -eq 0 ]; then
    printf '  ok   [%s] %s\n' "$expect" "$*"; pass=$((pass+1))
  else
    printf '  FAIL [%s, got ok=%s code=%s] %s\n     %s\n' "$expect" "${got:-—}" "$code" "$*" "$(printf '%s' "$out" | head -c 200)"; fail=$((fail+1))
  fi
}

echo "anchored smoke — binary: $BIN"
echo "project dir: $DIR"

echo "== meta =="
run out version
run out help
run ok validate

echo "== phase content verbs (on a task file) =="
run ok task create t1 "Task one"
run ok task phase add t1 setup "Setup"
run ok phase status t1/setup in-progress
run ok phase ac add t1/setup "the handler is validated"   # a1
run ok phase ac add t1/setup "edge cases covered"         # a2
run ok phase ac add t1/setup "perf acceptable"            # a3
run ok phase ac evidence t1/setup a1 "src/h.ts saveTasks() — bun test green"
run ok phase ac fail t1/setup a2 "missing the empty-input case"
run ok phase ac evidence t1/setup a2 "src/h.ts — empty-input guarded; test added"
run ok phase ac defer t1/setup a3 "perf work moved to the hardening milestone"
run err phase ac defer t1/setup a3            # no reason → AcNoReason
run ok phase ac done t1/setup a1             # already evidenced → re-done ok
run ok phase rule add t1/setup .claude/rules/factory-functions.md "factory pattern"
run ok phase set t1/setup context "a free-text phase context"
run err phase status t1/setup done            # ACs terminal but pipeline unreceipted → StepsUnreceipted
run ok phase step done t1/setup build implement "code + notes written"
run err phase step skip t1/setup build task-validate   # a skip without a reason → schema refuses
run ok phase step skip t1/setup build task-validate "verified by hand in the smoke"
run ok phase step list t1/setup
run ok phase status t1/setup done             # all ACs terminal (2 done, 1 deferred) + steps receipted
run ok phase get t1/setup

echo "== task node + phase-existence verbs =="
run ok task get t1
run ok task phase list t1
run ok task phase next t1
run ok task phase ready t1
run ok task set t1 title "Task one (renamed)"
run ok task question add t1 "which storage backend?" high
run err task status t1 build                  # open question blocks build (still drafted? we're at plan)
run err task status t1 drafted                # plan steps unreceipted → StepsUnreceipted
run ok task step done t1 plan discover "codebase scanned"
run ok task step done t1 plan rules-scan "2 rules collected"
run ok task step done t1 plan decompose "1 phase, 3 ACs"
run ok task step list t1
run ok task status t1 drafted                 # plan receipted → closes
run err task status t1 build                  # still blocked by the open question
run ok task question resolve t1 q1 "localStorage" user
run ok task status t1 build                   # skip-refine edge, question resolved
run ok task log add t1 build note "smoke build note"
run ok task concern add t1 "double-check rollout" medium
run err task status t1 done                   # open concern blocks done
run ok task concern resolve t1 c1 "fine" user
run ok task status t1 done                    # skip-wrap edge (build→done), phase terminal

echo "== epic tier (stubs, outcome-ACs, DoD, roll-up) =="
run ok epic create e1 "Epic one"
run ok epic child add e1 login "login flow"
run ok epic child add e1 audit "audit log"
run ok epic child set e1 audit depends_on "login"
run ok epic child next e1
run ok epic child ready e1
run ok epic child ac add e1 login "auth path proven"      # a1
run ok epic child ac evidence e1 login a1 "login/auth a1 — delivered"
run ok epic child status e1 login active
run ok epic child status e1 login done
run ok epic child ac add e1 audit "retention policy decided"
run ok epic child ac defer e1 audit a1 "compliance epic owns it"
run ok epic child status e1 audit done
run ok epic acceptance add e1 "ships end to end"          # e1
run ok epic acceptance add e1 "dashboard"                 # e2 (deferred)
run ok epic child roll-up e1
run ok epic question add e1 "monolith or service?" high
run err epic status e1 build                              # open question blocks build (at plan)
run ok epic question resolve e1 q1 "service" user
run err epic status e1 drafted                # epic plan steps unreceipted → StepsUnreceipted
run ok epic step done e1 plan discover "scanned"
run ok epic step skip e1 plan scaffold "stubs added by hand above"
run ok epic status e1 drafted
run ok epic status e1 build
run ok epic status e1 wrap
run err epic status e1 done                               # DoD items not terminal
run ok epic acceptance status e1 e1 done "login+audit — delivered"
run err epic acceptance status e1 e2 deferred          # no reason
run ok epic acceptance status e1 e2 deferred "next quarter"
run err epic status e1 done                               # wrap step (roll-up) unreceipted
run ok epic step done e1 wrap roll-up "children checked, DoD terminal"
run ok epic status e1 done

echo "== negative: illegal transition + unknown verb/slug =="
run ok task create t2 "Task two"
run err task status t2 done                   # plan→done illegal (can't skip drafted)
run err task bogus-verb t2                     # unknown verb
run ok phase get t2/nope                         # lenient get → null, ok=true

echo "== archive / reset =="
run ok task archive t1
run ok task reset t2

echo
echo "== smoke result: $pass passed, $fail failed =="
[ "$fail" -eq 0 ] && echo "ALL GREEN ✓" || { echo "RED ✗"; exit 1; }
