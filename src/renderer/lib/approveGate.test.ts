// Behavior test for the header ✓ Approve gate: real hook payloads through the real normalizer into
// the real agent-status store, then the gate. The no-stash question case is the one the gate exists
// for (the mirror then classifies the picker as an APPROVAL and keeps its pendingId — pinned in
// core/agent-status-mirror.test.ts); with a stash the mirror strips pendingId and nothing renders.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeClaude } from '@shared/agents/normalize'
import { useAgentStatus } from '../state/agentStatus'
import { canPlainApprove } from './approveGate'

let seq = 0
function held(tool: string, toolInput: unknown): string {
  const id = `gate-${++seq}`
  const e = normalizeClaude({
    nodeId: id,
    agentId: 'claude',
    payload: { hook_event_name: 'PermissionRequest', session_id: 's', tool_name: tool, tool_input: toolInput, nodeterm_pending_id: `${id}-1-1` }
  })!
  useAgentStatus.getState().setState(id, e.state, e.agentId, e.newTurn, e.pendingId, e.verified, e.errored, e.held)
  return id
}
const statusOf = (id: string) => useAgentStatus.getState().byId[id]

describe('canPlainApprove', () => {
  it('a held plan offers Approve (the hook maps a plain allow to updatedInput:{})', () => {
    expect(canPlainApprove(statusOf(held('ExitPlanMode', { plan: 'p' })))).toBe(true)
  })
  it('an ordinary permission offers Approve', () => {
    expect(canPlainApprove(statusOf(held('Bash', { command: 'ls' })))).toBe(true)
  })
  it('a held question whose ticket kept its pendingId does NOT offer Approve', () => {
    const id = held('AskUserQuestion', { questions: [{ question: 'Q?', options: [{ label: 'A' }] }] })
    expect(statusOf(id).pendingId).toBeTruthy() // the case the gate exists for
    expect(canPlainApprove(statusOf(id))).toBe(false)
  })
  it('a concurrent child approval keeps its own Approve while a question is held', () => {
    expect(
      canPlainApprove({ pendingId: 'child-1-1', held: { pendingId: 'parent-2-2', toolName: 'AskUserQuestion' } })
    ).toBe(true)
  })
  it('no ticket, no button', () => {
    expect(canPlainApprove(undefined)).toBe(false)
    expect(canPlainApprove({})).toBe(false)
  })
  it('the node header renders ✓ Approve through this gate', () => {
    const src = readFileSync(resolve(__dirname, '../nodes/TerminalNode.tsx'), 'utf8')
    expect(src).toContain('{canPlainApprove(status) && (')
  })
})
