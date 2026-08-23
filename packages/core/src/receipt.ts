/* ─────────────────────────────── the PreflightReceipt emitter (the seam) ─────────────────────
 *
 * SOLUTION.md §"HOW IT SLOTS IN": the ONE object that crosses every boundary — the smart card
 * renders it, the enterprise audit trail stores it (immutable, which the app's own db cannot do:
 * input_json is 134/134 NULL, L26838), and ARAV'S POST-VERIFIER consumes it. This module builds
 * exactly that object and NOTHING else. Post-verification logic is not ours (KICKOFF lane) — we
 * define only the seam.
 *
 * It is a PURE FUNCTION of the gate result. It reads no clock (firedAt is passed in — the
 * determinism rule of SOLUTION.md §TESTING HARNESS: "no Date.now in any library path"), does no
 * I/O, and makes no decision the gate did not already make. Same inputs ⇒ byte-identical receipt.
 */

import { dispositionFor, type Disposition } from './codes.ts';
import type { ToolCall, ToolContract, Verdict } from './gate.ts';
import type { SourceKind } from './provenance.ts';

/** A routing param as the receipt carries it: value + the source that licensed it (+ span). */
export interface ReceiptRoutingParam {
  name: string;
  value: string;
  /** the licensing source kind (transcript_span when spoken; the offending source on a block). */
  source: SourceKind;
  /** present iff a transcript span licensed it — the audit-grade proof of "your words". */
  transcriptSpan?: string;
}

/** A content param as the receipt carries it: never routing-gated, only consent-surfaced (§2). */
export interface ReceiptContentParam {
  name: string;
  consentSurfaced: boolean;
}

/**
 * The receipt object, field-for-field from SOLUTION.md §"HOW IT SLOTS IN". `verdict` carries the
 * DISPOSITION (PASS / HOLD / BLOCK / SURFACE); the reason `code` is co-located for the audit log.
 */
export interface PreflightReceipt {
  interactionId: string;
  voiceSessionId: string;
  serverId: string;
  toolName: string;
  args: Record<string, unknown>;
  verdict: Disposition;
  /** the wire reason code on a non-pass ('' on pass) — the eval-count / audit unit. */
  code: string;
  routingParams: ReceiptRoutingParam[];
  contentParams: ReceiptContentParam[];
  transcriptSnapshot: string;
  firedAt: number;
}

/** The identity + timing the host stamps on the receipt. `firedAt` is the host's clock, not ours. */
export interface ReceiptMeta {
  interactionId: string;
  voiceSessionId: string;
  serverId: string;
  firedAt: number;
}

/** On a block, the source kind the gate named as the OFFENDING one for `param`, if any. */
function offendingSource(param: string, verdict: Verdict): SourceKind | undefined {
  if (verdict.verdict !== 'block') return undefined;
  if (verdict.detail['param'] !== param) return undefined;
  const found = verdict.detail['found'];
  return typeof found === 'string' ? (found as SourceKind) : undefined;
}

/**
 * Build the PreflightReceipt from a gate Verdict. Pure: derives every field from the call, the
 * contract, and the verdict — never re-runs the gate, never adds a check.
 */
export function emitReceipt(
  call: ToolCall,
  contract: ToolContract,
  verdict: Verdict,
  meta: ReceiptMeta,
): PreflightReceipt {
  const receipt = verdict.verdict === 'pass' ? verdict.receipt : undefined;
  const routingParams: ReceiptRoutingParam[] = [];
  const contentParams: ReceiptContentParam[] = [];

  for (const [name, spec] of Object.entries(contract.params)) {
    const raw = call.args[name];

    if (spec.class === 'content') {
      contentParams.push({ name, consentSurfaced: raw !== undefined });
      continue;
    }

    if (raw === undefined) continue;

    const param = receipt?.params[name];
    // Prefer the transcript span (the audit-grade "your words" proof); else the best cited source.
    const licensing = param?.sources.find((source) => source.kind === 'transcript_span') ?? param?.sources[0];
    const entry: ReceiptRoutingParam = {
      name,
      value: String(raw),
      source: licensing?.kind ?? offendingSource(name, verdict) ?? 'model_composed',
    };
    if (licensing?.span_id !== undefined) entry.transcriptSpan = licensing.span_id;
    routingParams.push(entry);
  }

  return {
    interactionId: meta.interactionId,
    voiceSessionId: meta.voiceSessionId,
    serverId: meta.serverId,
    toolName: call.tool,
    args: call.args,
    verdict: verdict.verdict === 'pass' ? 'PASS' : dispositionFor(verdict.code),
    code: verdict.verdict === 'pass' ? '' : verdict.code,
    routingParams,
    contentParams,
    transcriptSnapshot: call.transcript?.text ?? '',
    firedAt: meta.firedAt,
  };
}
