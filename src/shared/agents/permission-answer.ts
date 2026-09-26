// Structured answers to a HELD Claude PermissionRequest (docs/hook-reply-approvals.md).
//
// The managed hook holds a PermissionRequest open and polls an answer file. The legacy answer is
// one word, `allow` | `deny`. That cannot answer the two tools that set `requiresUserInteraction`:
// Claude Code DROPS a bare allow for them (`if(!I.updatedInput&&e.requiresUserInteraction?.())
// return null` — docs/superpowers/plans/2026-09-26-answer-paths-research.md §2), so approving a plan
// or answering a question needs a decision that carries `updatedInput`. These are the shapes the
// renderer may ask for; core (`core/agents/permission-decision.ts`) validates every field against the
// pending request file and builds the JSON the hook prints. The renderer never builds hook JSON.
//
// Shared (not core) because the renderer and both shells' IPC types name it.

/** Claude's plan-approval tool. Its hold is long, and a plain `allow` maps to "restore the mode
 *  that preceded plan mode" (`updatedInput:{}`) inside the hook script itself. */
export const EXIT_PLAN_MODE_TOOL = 'ExitPlanMode'
/** Claude's question picker. A plain `allow` cannot answer it; only `{kind:'question'}` can. */
export const ASK_USER_QUESTION_TOOL = 'AskUserQuestion'

/** The two tools a person reads for minutes rather than seconds — the hook holds them for
 *  `PERM_WAIT_SECS_INTERACTIVE` instead of the 45 s default. */
export const INTERACTIVE_HOLD_TOOLS: readonly string[] = [EXIT_PLAN_MODE_TOOL, ASK_USER_QUESTION_TOOL]

/**
 * What an answerer may send. `allow` / `deny` are the legacy verbs (phone, older desktop, the header
 * buttons) and still travel as the one-word answer file.
 *
 *  - `plan` — approve an ExitPlanMode. `restore` = the mode that preceded plan mode (no
 *    `updatedPermissions`; the tool's own call() restores it, including auto's dangerous-rule
 *    strip). `acceptEdits` / `manual` add a session `setMode`. There is deliberately no `auto`:
 *    a hook `setMode auto` skips that strip (research §2(A)).
 *  - `plan-revise` — "No, keep planning": a deny whose message is the user's feedback.
 *  - `question` — answer an AskUserQuestion. Keys are the EXACT question texts; a string is one
 *    option label, a string[] is several labels of a multiSelect question. A key listed in
 *    `freeText` carries typed text (the picker's "Other") instead of a label — that is the ONLY way
 *    an answer may be something other than an existing label.
 */
export type PermissionAnswer =
  | { kind: 'allow' }
  | { kind: 'deny' }
  | { kind: 'plan'; mode: 'restore' | 'acceptEdits' | 'manual' }
  | { kind: 'plan-revise'; message: string }
  | { kind: 'question'; answers: Record<string, string | string[]>; freeText?: string[] }

/** The payload of `window.nodeTerminal.answerPermission`. `decision` is the pre-structured
 *  contract and still works alone; when `answer` is present it wins. */
export interface AnswerPermissionPayload {
  nodeId: string
  pendingId: string
  decision?: 'allow' | 'deny'
  answer?: PermissionAnswer
}

/**
 * The request a node's managed hook is currently holding: its answer-file ticket plus the tool it
 * is asking about. Lets the renderer tell a plan / question hold from an ordinary permission and
 * render the right controls. Deliberately SEPARATE from the approve/deny `pendingId`, which the
 * mirror strips from a question (approve/deny is the wrong UX for a picker) — so adding this lights
 * no existing button.
 */
export interface HeldPermission {
  pendingId: string
  toolName: string
}

/** Tool names are agent-controlled text (MCP tools are `mcp__<server>__<tool>`); only a plain
 *  identifier ever rides an event. Anything else is dropped, never repaired. */
const TOOL_NAME_RE = /^[A-Za-z0-9_.:-]{1,128}$/

export function isSafeToolName(name: unknown): name is string {
  return typeof name === 'string' && TOOL_NAME_RE.test(name)
}
