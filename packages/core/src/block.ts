/* ─────────────────────────────────── failure vocabulary ───────────────────────────────────
 *
 * PORTED from universal-voiceos-oauth/integrations/slack/tools-t2.ts:98 (PreflightBlock),
 * byte-for-byte except comments. The machine `code` is the unit the eval harness counts and
 * the unit the receipts/shadow log name; `detail` carries real candidates/limits so a card
 * can show the user their actual options. SPEC-v4 §1: blocked pre-dispatch with a machine
 * error code and a human card — never a guess, never a silent fix.
 */

/**
 * A preflight refusal: the gate declined to pass a call because a parameter could not be
 * *proved*. `code` is a stable machine string, `detail` carries the evidence.
 */
export class PreflightBlock extends Error {
  readonly code: string;
  readonly detail: Record<string, unknown>;
  constructor(code: string, detail: Record<string, unknown> = {}) {
    super(`preflight blocked: ${code}`);
    this.name = 'PreflightBlock';
    this.code = code;
    this.detail = detail;
  }
}

/**
 * The one required-string reader: a missing/blank argument is a block, never a default.
 * PORTED from tools-t2.ts:407 (`requiredText`). Note: this is a *structural* malformed-call
 * check (SPEC-v4 §1 "malformed in the same way that a call missing a required field is
 * malformed") — it applies to content params too without violating §2's "content is never
 * blocked", which is about provenance blocking, not required-field validation.
 */
export function requiredText(args: Record<string, unknown>, key: string, code: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.trim() === '') throw new PreflightBlock(code, { field: key });
  return value;
}
