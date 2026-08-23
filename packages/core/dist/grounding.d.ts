import { type Source, type SourceKind } from './provenance.ts';
import type { Target } from './resolve.ts';
export interface GroundedMessage {
    channel: string;
    ts: string;
    author?: string;
    text?: string;
    thread_ts?: string;
}
/** Where a batch of targets came from — the store stamps rank from kind. */
export interface TargetOrigin {
    kind: SourceKind;
    /** which read produced it, e.g. 'list_channels' — lands in receipts verbatim. */
    tool?: string;
}
export interface GroundedTargetEntry {
    target: Target;
    source: Source;
}
export declare class GroundingStore {
    private readonly groundedMessages;
    private readonly targets;
    private static messageKey;
    /** Called by any read that shows a message to the user — what makes "that message" real. */
    rememberMessage(message: GroundedMessage): void;
    rememberMessages(messages: readonly GroundedMessage[]): void;
    isGrounded(channel: string, ts: string): boolean;
    /** Test seam / session reset (ported name: forgetGroundedMessages). */
    forgetGroundedMessages(): void;
    /** Record targets surfaced by a read, stamped with the source that vouches for them. */
    rememberTargets(targets: readonly Target[], origin: TargetOrigin): void;
    /** The match pool the resolver runs over. */
    pool(): Target[];
    /** The source that grounded a resolved target — cited in the receipt, judged by the lattice. */
    sourceOf(target: Target): Source | undefined;
    /** Session reset for targets. */
    forgetTargets(): void;
}
//# sourceMappingURL=grounding.d.ts.map