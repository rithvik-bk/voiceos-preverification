/* ─────────────────────────────── the plan / proof-tree types ───────────────────────────────
 *
 * THE NEW LAYER (SOLUTION.md §"THE PROOF-TREE"): the built gate verifies ONE action; this layer
 * verifies a whole autonomous PLAN — a DAG of steps — BEFORE any step fires. It adds nothing to
 * the single-step physics; it THREADS the built lattice across steps. Two new rules make that
 * safe (both enforced in compose.ts + taint.ts, both tested):
 *
 *   COMPOSITION — a later step's routing/destination slot may be licensed by an EARLIER step's
 *   output, but ONLY if that output was STRUCTURED tool_output AND was surfaced/read back to the
 *   user. That is the `prior_step` source (taint.ts): when `surfaced`, it is card-tap-equivalent
 *   (rank-4-authorized), so "email the top lead you FOUND" passes even though no address was
 *   spoken. (The gate's rank-4 destination licensor is `transcript_span`; compose.ts expresses a
 *   surfaced prior-step referent to the unmodified gate as a rank-4 store source tagged
 *   `prior_step:<id>`, and records the honest provenance in ProofNode.licensedBy.)
 *
 *   TAINT — a CONTENT_READ output is tainted; a tainted value may license CONTENT but NEVER a
 *   routing sink, and taint propagates to anything derived from it. "read the billing email and
 *   PAY the address in it" blocks: the address is content-tainted, structurally unroutable.
 *
 *   POISON — a step that depends on a held/blocked/deferred step is itself `deferred`: no green
 *   downstream of a hole.
 *
 * Deterministic: no LLM, no clock, no network. The plan+outputs are DATA (scripted for
 * pre-verification — we verify the plan the model produced; we do not run the model. Lane: PRE-
 * verification only; the receipt seam to post-verification/Arav is already emitted by receipt.ts).
 */

import type { Receipt, ToolCall, ToolContract } from './gate.ts';
import type { Target } from './resolve.ts';

/**
 * How an executed step's output is classified — the fork the whole taint story turns on.
 *  - `structured`  — a tool RETURNED data (search → a lead, list → channels). Its grounded
 *                    targets can license a later routing slot IFF `surfaced` (read back to user).
 *  - `content_read`— the agent READ free text (an email body, a web page, screen text). TAINTED:
 *                    may fill later CONTENT params, never a routing/destination sink.
 */
export type StepOutputKind = 'structured' | 'content_read';

export interface StepOutput {
  kind: StepOutputKind;
  /** structured: grounded targets this tool surfaced (a found lead) — license routing IFF `surfaced`. */
  provides?: Target[];
  /** the raw value strings this output introduces (addresses, ids, amounts) — the taint + licensing unit. */
  values?: string[];
  /** structured only: was the output surfaced/read back to the user? Unsurfaced can never license routing. */
  surfaced?: boolean;
  /** values this output was derived from — the propagation edge (derive-from-tainted ⇒ tainted). */
  derivedFrom?: string[];
}

/** One node of the plan DAG: a single gate-checkable call plus its dependency edges + scripted output. */
export interface PlanStep {
  id: string;
  call: ToolCall;
  contract: ToolContract;
  dependsOn: string[];
  /** what this step yields when it executes (applied to session state only if the node passes). */
  output?: StepOutput;
}

export interface Plan {
  steps: PlanStep[];
}

/**
 * pass     — proof complete, the action may fire.
 * hold     — proof incomplete; one spoken question completes it (the single-step HOLD dispositions).
 * block    — a firewall BLOCK: injection / min-rank / a tainted value reaching a routing sink.
 * deferred — POISON: a dependency did not cleanly pass, so this node cannot be trusted to run.
 */
export type NodeVerdict = 'pass' | 'hold' | 'block' | 'deferred';

/** The honest record that a routing slot was licensed by a prior step's surfaced structured output. */
export interface LicensedBy {
  stepId: string;
  kind: 'prior_step';
  surfaced: boolean;
}

export interface ProofNode {
  id: string;
  tool: string;
  verdict: NodeVerdict;
  /** present on pass — the single-step receipt this node's verdict rests on. */
  receipt?: Receipt;
  /** present on block/hold — the wire code + detail from the gate or the taint firewall. */
  block?: { code: string; detail: Record<string, unknown> };
  dependsOn: string[];
  /** present when a routing slot was licensed by an earlier step's surfaced output (composition). */
  licensedBy?: LicensedBy[];
}

export interface ProofTree {
  nodes: ProofNode[];
  summary: {
    steps: number;
    green: number;
    held: number;
    blocked: number;
    deferred: number;
  };
}
