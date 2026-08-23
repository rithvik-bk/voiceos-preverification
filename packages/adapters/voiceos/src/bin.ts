#!/usr/bin/env node
/* ─────────────────────────── the stdio entrypoint VoiceOS launches ──────────────────────────
 *
 * VoiceOS adds this via custom-mcp:add (SOLUTION.md L31725):
 *   { name: "preflight", transport: "stdio",
 *     command: "node",
 *     args: ["<repo>/packages/adapters/voiceos/src/bin.ts"],
 *     env: { PREFLIGHT_MODE: "observe", PREFLIGHT_LOG: "<path>/preflight.jsonl" } }
 * VoiceOS then launches it (StdioClientTransport L21142), lists tools (L21158), and calls them
 * (client.callTool {name, arguments} L21045).
 *
 * ENV:
 *   PREFLIGHT_MODE      observe | enforce      (default observe — the safe mode)
 *   PREFLIGHT_LOG       path to a JSONL file for PreflightReceipts (default: stderr)
 *   PREFLIGHT_SERVER_ID server id in receipts  (default preflight-voiceos)
 *
 * IMPORTANT: stdout is the MCP protocol wire. Receipts go to the JSONL file or stderr — NEVER
 * stdout. This bin wraps a DEMO downstream `send_message` (an echo) so the server is
 * launch-and-register-able without a real backend; replace `demoSend` with your real tool and
 * `demoContext` with a provider that queries your backend for the grounded pool (README §Wiring).
 */

import { appendFileSync } from 'node:fs';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createPreflightServer } from './server.ts';
import type { WrappedTool } from './withPreflight.ts';
import type { PreflightContext } from './context.ts';
import type { PreflightReceipt } from './receipt.ts';

const mode = (process.env['PREFLIGHT_MODE'] === 'enforce' ? 'enforce' : 'observe') as 'observe' | 'enforce';
const logPath = process.env['PREFLIGHT_LOG'];
const serverId = process.env['PREFLIGHT_SERVER_ID'] ?? 'preflight-voiceos';

function emitReceipt(receipt: PreflightReceipt): void {
  const line = JSON.stringify(receipt);
  if (logPath !== undefined && logPath !== '') {
    try {
      appendFileSync(logPath, line + '\n');
      return;
    } catch {
      // fall through to stderr — never lose the audit line, never touch stdout.
    }
  }
  process.stderr.write(line + '\n');
}

/* ── DEMO downstream: replace with your real tool + a real grounding provider (README §Wiring) ── */

function demoSend(args: Record<string, unknown>): { sent: true; target: unknown; text: unknown } {
  return { sent: true, target: args['target'], text: args['text'] };
}

/**
 * DEMO context provider: at true zero-mod (no `_preflight` seam) VoiceOS gives us only
 * {name,arguments}. A real provider would query the downstream (e.g. Slack conversations.list)
 * to build the pool. This static stub lets the server run standalone; it returns NO transcript,
 * so the server correctly runs args-only degraded mode unless a `_preflight` seam is supplied.
 */
function demoContext(): PreflightContext | undefined {
  return { referents: [{ kind: 'channel', id: 'C_ENG', label: '#eng-backend', aliases: ['eng-backend'], origin: 'tool_output', tool: 'list_channels' }] };
}

const sendMessage: WrappedTool = {
  name: 'send_message',
  description: 'Send a message to a channel or person (DEMO downstream — echoes the call).',
  tier: 3,
  params: {
    target: { class: 'routing', required: true, slot: 'destination' },
    text: { class: 'content', required: true },
  },
  handler: demoSend,
  // Supplies the demo grounded pool. If VoiceOS passes a `_preflight` seam (transcript +
  // referents), withPreflight merges it FIRST and only falls back to this stub's referents
  // when the seam carried none — so a real transcript is never shadowed.
  context: demoContext,
};

const { server } = createPreflightServer({ serverId, mode, tools: [sendMessage], onReceipt: emitReceipt });

const transport = new StdioServerTransport();
server
  .connect(transport)
  .then(() => {
    process.stderr.write(`[preflight-voiceos] mode=${mode} serverId=${serverId} log=${logPath ?? 'stderr'} — ready\n`);
  })
  .catch((error: unknown) => {
    process.stderr.write(`[preflight-voiceos] failed to start: ${String(error)}\n`);
    process.exit(1);
  });
