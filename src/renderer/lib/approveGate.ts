import { ASK_USER_QUESTION_TOOL, type HeldPermission } from '@shared/agents/permission-answer'

/**
 * Whether the node header may offer ✓ Approve (a plain `allow`) for the node's current ticket.
 *
 * A plain allow cannot answer a held AskUserQuestion: Claude drops it, the managed hook consumes it
 * and keeps holding, and core refuses to write it. Normally the mirror strips `pendingId` from a
 * question, so the buttons never render at all — but a picker whose PreToolUse stash is missing
 * (hook lost, stash expired) is classified as an APPROVAL and keeps its `pendingId`. That is the
 * case this gate exists for. It compares the ticket, so a concurrent child approval (a different
 * `pendingId`) keeps its own Approve while a question is held.
 */
export function canPlainApprove(status: { pendingId?: string; held?: HeldPermission } | undefined): boolean {
  if (!status?.pendingId) return false
  return !(status.held?.toolName === ASK_USER_QUESTION_TOOL && status.held.pendingId === status.pendingId)
}
