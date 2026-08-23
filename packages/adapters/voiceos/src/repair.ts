/* ─────────────────────────────── disposition + voice-repair ───────────────────────────────
 *
 * The core gate emits pass | block(code, detail). The PRODUCT vocabulary is PASS / HOLD / BLOCK
 * / SURFACE (SOLUTION.md). This module is the ONLY place that maps one to the other, and it maps
 * ONLY codes the core actually emits — it never invents a disposition for a check the core does
 * not implement (no PF_AMOUNT_NOT_IN_SPEECH / PF_MISBOUND_PARAM here: those are amount/span
 * checks the core does not have yet; claiming them would be a faked catch).
 *
 * BLOCK is reserved for the injection firewall alone (`provenance_mismatch`) — a routing slot
 * whose value has no transcript span, only read-content provenance. Everything else the gate can
 * refuse is a HOLD: one spoken question completes the proof. The repair line NAMES THE SOURCE,
 * not the error (SOLUTION.md invariant 4: "that number came from the email" > "couldn't verify").
 *
 * The repair strings are the founder-editable script library from SOLUTION.md, kept as data so a
 * founder tunes copy without touching the gate — no LLM decides how to ask.
 */

import type { Verdict } from '../../../core/src/index.ts';

export type Disposition = 'PASS' | 'HOLD' | 'BLOCK' | 'SURFACE';

export interface Discrepancy {
  /** The product-facing PF_* code (stable across copy edits). */
  reasonCode: string;
  /** The raw core machine code that actually fired — the authoritative, auditable one. */
  coreCode: string;
  param: string;
  /** what the model tried to route to. */
  proposedValue: string;
  /** where that value's provenance actually came from (the source we refuse to route from). */
  source?: string;
  /** real disambiguation candidates as data — never a guess. */
  candidates?: Array<{ name: string; kind: string }>;
  resolved?: string;
}

export interface Refusal {
  disposition: 'HOLD' | 'BLOCK';
  discrepancy: Discrepancy;
  /** the one spoken question / statement VoiceOS's card renders. */
  repair: string;
}

/** core machine code → product PF_* code. Only the codes the core can emit are listed. */
const PRODUCT_CODE: Record<string, string> = {
  provenance_mismatch: 'PF_INJECTION_ROUTING_FROM_CONTENT',
  ambiguous_target: 'PF_AMBIGUOUS_TARGET',
  target_not_found: 'PF_UNKNOWN_TARGET',
  insufficient_provenance: 'PF_INSUFFICIENT_PROVENANCE',
  missing_parameter: 'PF_MISSING_PARAM',
};

/** core machine code → BLOCK (injection only) | HOLD (everything else completes with one question). */
function dispositionFor(coreCode: string): 'HOLD' | 'BLOCK' {
  return coreCode === 'provenance_mismatch' ? 'BLOCK' : 'HOLD';
}

function str(detail: Record<string, unknown>, key: string): string | undefined {
  const value = detail[key];
  return typeof value === 'string' ? value : undefined;
}

function candidatesOf(detail: Record<string, unknown>): Array<{ name: string; kind: string }> | undefined {
  const raw = detail['candidates'];
  if (!Array.isArray(raw)) return undefined;
  const out: Array<{ name: string; kind: string }> = [];
  for (const entry of raw) {
    if (entry !== null && typeof entry === 'object') {
      const name = (entry as Record<string, unknown>)['name'];
      const kind = (entry as Record<string, unknown>)['kind'];
      if (typeof name === 'string') out.push({ name, kind: typeof kind === 'string' ? kind : 'target' });
    }
  }
  return out.length > 0 ? out : undefined;
}

/** Build the human spoken-repair line for a refusal, keyed on the core code. */
function repairLine(coreCode: string, discrepancy: Discrepancy): string {
  const value = discrepancy.proposedValue;
  const candidates = discrepancy.candidates ?? [];
  switch (coreCode) {
    case 'provenance_mismatch':
      // Injection firewall: name the source it came from, not the error.
      return `"${value}" came from what was read on your behalf, not from you — I won't route to it. Say the destination if you meant it.`;
    case 'ambiguous_target': {
      if (candidates.length >= 2) {
        const a = candidates[0]!.name;
        const b = candidates[1]!.name;
        const kind = candidates[0]!.kind;
        return `Two ${kind}s match "${value}" — ${a} or ${b}?`;
      }
      return `More than one match for "${value}" — which one?`;
    }
    case 'target_not_found': {
      if (candidates.length > 0) {
        const names = candidates.map((candidate) => candidate.name).slice(0, 3).join(', ');
        return `I couldn't find "${value}" — did you mean ${names}?`;
      }
      return `I couldn't find "${value}" — who did you mean?`;
    }
    case 'insufficient_provenance': {
      const source = discrepancy.source ?? 'something read this session';
      return `"${value}" only came from ${source}, not from you — send it there anyway?`;
    }
    case 'missing_parameter': {
      const field = discrepancy.param;
      if (field === 'target' || field === 'recipient' || field === 'channel') return 'Send it to who?';
      return `I'm missing "${field}" — what should it be?`;
    }
    default:
      return `Holding "${value}" for confirmation.`;
  }
}

/** Turn a core BLOCK verdict into a product Refusal (disposition + discrepancy + spoken repair). */
export function refusalFrom(verdict: Extract<Verdict, { verdict: 'block' }>): Refusal {
  const coreCode = verdict.code;
  const detail = verdict.detail;
  const discrepancy: Discrepancy = {
    reasonCode: PRODUCT_CODE[coreCode] ?? coreCode.toUpperCase(),
    coreCode,
    param: str(detail, 'param') ?? str(detail, 'field') ?? 'unknown',
    proposedValue: str(detail, 'query') ?? str(detail, 'resolved') ?? '',
    ...(str(detail, 'found') !== undefined
      ? { source: str(detail, 'found') }
      : str(detail, 'source_kind') !== undefined
        ? { source: str(detail, 'source_kind') }
        : {}),
    ...(candidatesOf(detail) !== undefined ? { candidates: candidatesOf(detail) } : {}),
    ...(str(detail, 'resolved') !== undefined ? { resolved: str(detail, 'resolved') } : {}),
  };
  return { disposition: dispositionFor(coreCode), discrepancy, repair: repairLine(coreCode, discrepancy) };
}
