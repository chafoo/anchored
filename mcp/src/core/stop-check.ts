/**
 * Build-time stop-condition decision contract.
 *
 * This is the deterministic SEAM between the `stop-check` mini-agent
 * (a pure-thinker prompt at plugin/agents/stop-check.md) and the MCP
 * operations the orchestrator applies. The agent is a natural-language
 * judge — given a pending build-time decision, the global `build.stop`
 * rules, and the plan/phase context, it returns a {verdict, matched_rule?,
 * reasoning} payload. It CANNOT call MCP (bug #13605); the /impl-build
 * SKILL (Phase 4) and the dynamic-workflow-executor's phase-end gate
 * (Phase 5) call `classifyStopVerdict` on that payload to learn EXACTLY
 * which task-op to run, then run it.
 *
 * Two outcomes, mapped onto EXISTING question infra (no new storage):
 *
 *   PROCEED → record the autonomous decision via
 *             task.question.resolve(source='ai', reasoning=...).
 *             This lands in the decisions log /impl-wrap reviews. The
 *             source='ai'-requires-non-empty-reasoning invariant
 *             (ops/question.ts resolve guard) is satisfied because the
 *             agent's reasoning is carried through verbatim.
 *
 *   STOP    → escalate to the user via task.question.add (a NEW open
 *             question, priority 'high', origin 'stop-check'). NOT
 *             auto-resolved — the build halts and hands control back.
 *
 * Keeping this as a pure function (no I/O, no MCP knowledge) means it's
 * unit-testable without a live LLM: feed it a verdict payload, assert
 * the routed action. The agent's judgment is exercised separately via
 * its decision-table examples; the PLUMBING is exercised here.
 */

import type { QuestionPriority, QuestionOrigin } from '../schema/task-file.js';

/** The shipped default `build.stop` rule. Single source of truth so the
 *  agent prompt, the schema default, and tests all agree on the wording. */
export const DEFAULT_STOP_RULE = 'a decision deviates from the plan';

/** Origin tag stamped on STOP-escalation questions. */
export const STOP_CHECK_ORIGIN: Extract<QuestionOrigin, 'stop-check'> = 'stop-check';

/** Priority for STOP-escalation questions — always high (a halt blocks
 *  the autonomous run; the user must weigh in before build continues). */
export const STOP_ESCALATION_PRIORITY: Extract<QuestionPriority, 'high'> = 'high';

/** Synthetic `matched_rule` for a stop forced by the SECOND eye: the
 *  implement worker self-reported a plan-deviation even though the
 *  stop-check evaluator returned `proceed`. The double safety net is
 *  deterministic, not advisory — a self-reported deviation always halts
 *  (asymmetric cost: a needless stop is one cheap question; a wrong
 *  proceed bakes in an unreviewed call). See classifyStopVerdict's
 *  `workerFlaggedDeviation` option. */
export const SECOND_EYE_RULE = 'worker self-reported a plan-deviation (second-eye override)';

/**
 * The structured payload the stop-check mini-agent returns. Mirrors the
 * "Return contract" section of plugin/agents/stop-check.md.
 */
export interface StopCheckVerdict {
  /** 'stop' = decision matched a build.stop rule → escalate to user.
   *  'proceed' = no rule matched → autonomous decision, document it. */
  verdict: 'stop' | 'proceed';
  /** The build.stop rule string that matched, present iff verdict==='stop'. */
  matched_rule?: string;
  /** The agent's natural-language justification — REQUIRED. For proceed
   *  it becomes the question_resolve reasoning; for stop it explains the
   *  halt to the user. */
  reasoning: string;
  /** Optional 1-2 sentence pair-programmer summary the agent produces for
   *  the orchestrator to RELAY to the user (proceed/stop + the gist, in
   *  human terms). It is communication, NOT routing — classifyStopVerdict
   *  ignores it; the /impl-build SKILL reads it directly off the agent
   *  return and surfaces it in chat. Present so this interface honestly
   *  mirrors the agent's full "Return contract". */
  partner_voice_summary?: string;
}

/**
 * Action descriptor for a PROCEED verdict — routes to question_resolve
 * with source='ai'. The orchestrator pairs this with the open question's
 * id (the pending build-time decision is itself an open question) and
 * the chosen answer.
 */
export interface ResolveAction {
  op: 'question_resolve';
  source: 'ai';
  /** Carried into question.resolve as `reasoning`; guaranteed non-empty
   *  so the source='ai' invariant in ops/question.ts is satisfied. */
  reasoning: string;
}

/**
 * Action descriptor for a STOP verdict — routes to question_add (a new
 * open question for the user). NOT resolved.
 */
export interface EscalateAction {
  op: 'question_add';
  priority: QuestionPriority;
  origin: QuestionOrigin;
  /** The rule that triggered the halt, for the question text + audit. */
  matched_rule: string;
  /** The agent's reasoning, surfaced to the user in the question prose. */
  reasoning: string;
}

export type StopCheckAction = ResolveAction | EscalateAction;

/** Thrown when a verdict payload is internally inconsistent — e.g. a
 *  proceed with empty reasoning (would violate the question.resolve
 *  invariant downstream) or a stop without a matched_rule. Surfacing it
 *  here, at the deterministic seam, beats a confusing MCP-layer error. */
export class InvalidStopVerdict extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStopVerdict';
  }
}

/**
 * Pure router: classify a stop-check verdict into the single MCP action
 * the orchestrator must perform.
 *
 *   - proceed → ResolveAction (question_resolve, source='ai', reasoning)
 *   - stop    → EscalateAction (question_add, priority='high',
 *                               origin='stop-check')
 *
 * The SECOND eye (the double safety net) is enforced HERE, deterministically:
 * pass `opts.workerFlaggedDeviation: true` when the implement worker
 * self-reported a plan-deviation for this decision. A worker-flagged
 * deviation on a `proceed` verdict is forced to STOP — it is NOT a
 * judgment call the orchestrator may waive (asymmetric cost: favor the
 * human). The forced stop escalates under the synthetic SECOND_EYE_RULE.
 *
 * Validates the verdict's own invariants so a malformed agent return
 * fails fast and loud rather than producing a silently-wrong task-op.
 */
export function classifyStopVerdict(
  verdict: StopCheckVerdict,
  opts: { workerFlaggedDeviation?: boolean } = {},
): StopCheckAction {
  if (verdict.reasoning === undefined || verdict.reasoning.trim() === '') {
    throw new InvalidStopVerdict(
      'stop-check verdict missing reasoning — both proceed and stop ' +
        'verdicts must justify themselves (proceed reasoning feeds the ' +
        "source='ai' question_resolve invariant; stop reasoning is the " +
        'halt explanation shown to the user).',
    );
  }

  if (verdict.verdict === 'proceed') {
    // Second-eye override: a worker-self-reported plan-deviation forces a
    // stop even on a proceed verdict. Deterministic, not advisory.
    if (opts.workerFlaggedDeviation) {
      return {
        op: 'question_add',
        priority: STOP_ESCALATION_PRIORITY,
        origin: STOP_CHECK_ORIGIN,
        matched_rule: SECOND_EYE_RULE,
        reasoning: verdict.reasoning,
      };
    }
    return {
      op: 'question_resolve',
      source: 'ai',
      reasoning: verdict.reasoning,
    };
  }

  // verdict === 'stop'
  if (verdict.matched_rule === undefined || verdict.matched_rule.trim() === '') {
    throw new InvalidStopVerdict(
      "stop-check returned verdict='stop' without a matched_rule — a halt " +
        'must name which build.stop rule it matched so the escalation ' +
        'question and the audit trail can cite it.',
    );
  }

  return {
    op: 'question_add',
    priority: STOP_ESCALATION_PRIORITY,
    origin: STOP_CHECK_ORIGIN,
    matched_rule: verdict.matched_rule,
    reasoning: verdict.reasoning,
  };
}

/** Narrowing helper for callers that branch on the action. */
export function isEscalateAction(action: StopCheckAction): action is EscalateAction {
  return action.op === 'question_add';
}
