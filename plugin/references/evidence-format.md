# Evidence format

Reference for what makes "good" evidence in an acceptance criterion's
`evidence:` slot. Used by:

- **implement agent** when filling evidence after satisfying an AC
- **task-check agent** when verifying evidence honesty

Anchored's USP is "no AC is done without concrete evidence". This
file defines what "concrete" actually means.

---

## The shape

Evidence is a single-line string that lets a reader (human or AI)
verify the AC is satisfied without having to interpret intent.

There are four common evidence shapes; pick what fits the AC:

### 1. File:line + one-liner
For ACs about code being written, structures being added, files being
created.

```
src/auth/store.ts:42 — TokenStore.expires() method added
src/middleware/rate-limit.ts:1-28 — full middleware module created
```

The file:line should point at the most relevant location (the
canonical definition, not a usage site). The one-liner describes what
the reader will see there.

### 2. Command + outcome
For ACs about tests passing, builds succeeding, scripts running.

```
pnpm test src/auth (12 passing, 0 failing)
npm run build → dist/cli/bin.js (4.2kb gzipped)
pytest tests/test_token.py::test_expiry (passed in 0.04s)
```

The command should be runnable in this project's normal toolchain.
The outcome should describe the observable result (counts, sizes,
exit codes).

### 3. Test name + result
For ACs explicitly about test coverage.

```
TokenStore.expires test green via vitest
test_concurrent_access (passing) in src/auth/store-memory.test.ts
"refresh-token rotation" integration test (passed)
```

The test name should be unique enough to grep for. Including the file
path is fine but not required if the test name is distinctive.

### 4. Commit SHA + summary
For ACs that ship work whose evidence is the commit itself.

```
abc1234 — initial TokenStore interface + tests
def5678 — rate-limit middleware registered with Fastify hooks
```

Use sparingly — file:line evidence is usually more useful for
verification. SHA evidence is good when the AC is about HAVING
committed something (e.g., a config change in the right place).

---

## Combining shapes

When an AC is satisfied by multiple things, combine shapes naturally:

```
src/auth/store.ts:42 + tests in store.test.ts (8/8 green via pnpm test src/auth)
```

```
@fastify/rate-limit registered in src/middleware/rate-limit.ts:14;
integration test verified via "POST /api/* gets 429 after 100 reqs" passing
```

Combine when it helps verification. Don't combine just for length.

---

## Anti-patterns — DO NOT write these

These will fail task-check immediately:

### Substanceless

```
done
implemented
works
looks good
complete
```

These say nothing verifiable. Task-check flags these as
`block`-severity findings.

### Empty

```
(empty string)
—
" "
```

Same as no evidence at all. `block` severity.

### Vague gestures

```
added the function
created files in src/auth
tests added
see commit
implemented per spec
```

What function? Which files? Which spec? task-check downgrades to
`warn` at best.

### Lying about completeness

```
all edge cases covered
production-ready
fully tested
```

Untestable claims. If the test count is 12, say 12. If you covered
the null case, say "null-input test at line 47". Vague assertions of
quality fail task-check.

---

## Evidence in different methodologies

**TDD:**
```
ac: "user registration validates email format"
evidence: "test_register_invalid_email + test_register_valid_email both passing via pytest"
```

**BDD:**
```
ac: "user can request password reset"
evidence: "features/password_reset.feature: 3 scenarios passing via cucumber-js"
```

**Code-first / spike:**
```
ac: "token storage works in-memory"
evidence: "src/auth/store-memory.ts:18 — createMemoryStore factory; manual smoke test verified TTL eviction at 60s"
```

**No tests:**
```
ac: "config schema accepts new oauth_provider field"
evidence: "src/config/schema.ts:34 — oauth_provider added as optional string; manually verified app boots with field set"
```

All shapes work as long as the evidence is **concrete and verifiable**.
TDD evidence is easy because tests provide natural concreteness.
Non-test evidence requires more specific language (file:line, command
+ outcome, observable result).

---

## What task-check checks for

1. **Non-empty.** Empty/—/whitespace → `block`.
2. **Has substance.** "done"/"works"/etc. → `block`.
3. **File:line refs resolve.** File must exist, line must be in range.
4. **Commands plausibly real.** Runner exists in package.json or
   binary findable.
5. **Test names resolve via grep.** Missing test name → `warn`.
6. **Evidence ties back to AC text.** Vague gestures that don't
   articulate WHAT was satisfied → `info` finding (doesn't block,
   notes for audit).

Read task-check.md (in `plugin/agents/`) for the full check procedure.
