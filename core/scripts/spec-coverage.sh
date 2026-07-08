#!/usr/bin/env bash
# spec-coverage.sh — the spec-coverage quality gate. Every runtime source file under
# lib/ · modules/ · services/ must carry a colocated test (a *.spec.ts / *.int.ts /
# *.e2e.ts in the SAME directory whose name starts with the source basename — so an
# aspect-named spec like `questions-log.spec.ts` covers `questions.ts`). A file with
# no colocated test fails the gate. This enforces the 100%-coverage rule structurally
# (see docs/design/v3/requirements.md rule 7). Pure-type and effect-shell exemptions
# are listed explicitly below.
set -euo pipefail
shopt -s nullglob
cd "$(dirname "$0")/.."

# Explicit exemptions (path under src/). Keep this list SHORT and justified.
#   (none today — every lib/modules/services file is covered.)
EXEMPT=""

missing=0
while IFS= read -r f; do
  case "$f" in
    *.spec.ts | *.int.ts | *.e2e.ts) continue ;; # the tests themselves
    *.fake.ts | *.fixtures.ts) continue ;;        # test-support (build-excluded), not runtime
  esac
  rel="${f#./}"
  case " $EXEMPT " in *" $rel "*) continue ;; esac
  dir="$(dirname "$f")"
  base="$(basename "$f" .ts)"
  # any colocated test whose name starts with the source basename counts
  tests=("$dir/$base"*.spec.ts "$dir/$base"*.int.ts "$dir/$base"*.e2e.ts)
  if [ "${#tests[@]}" -eq 0 ]; then
    echo "  UNCOVERED: $rel"
    missing=$((missing + 1))
  fi
done < <(find ./src/lib ./src/modules ./src/services -name '*.ts' | sort)

if [ "$missing" -gt 0 ]; then
  echo "spec-coverage gate FAILED: $missing file(s) under lib/modules/services lack a colocated test."
  exit 1
fi
echo "spec-coverage gate OK — every lib/modules/services file has a colocated test."
