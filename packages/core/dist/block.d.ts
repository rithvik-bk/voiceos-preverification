/**
 * A preflight refusal: the gate declined to pass a call because a parameter could not be
 * *proved*. `code` is a stable machine string, `detail` carries the evidence.
 */
export declare class PreflightBlock extends Error {
    readonly code: string;
    readonly detail: Record<string, unknown>;
    constructor(code: string, detail?: Record<string, unknown>);
}
/**
 * The one required-string reader: a missing/blank argument is a block, never a default.
 * PORTED from tools-t2.ts:407 (`requiredText`). Note: this is a *structural* malformed-call
 * check (SPEC-v4 §1 "malformed in the same way that a call missing a required field is
 * malformed") — it applies to content params too without violating §2's "content is never
 * blocked", which is about provenance blocking, not required-field validation.
 */
export declare function requiredText(args: Record<string, unknown>, key: string, code: string): string;
//# sourceMappingURL=block.d.ts.map