// The header ✓ Approve writes a plain `allow`. For a held AskUserQuestion that is not an answer —
// Claude drops a bare allow on that tool, and the managed hook consumes it and keeps holding — so
// the button must not render for that ticket. Source-level pin: the header is a large component
// with no render harness, and the condition is exactly the kind of line a refactor drops silently.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('TerminalNode header Approve gate', () => {
  const src = readFileSync(resolve(__dirname, 'TerminalNode.tsx'), 'utf8')
  it('hides Approve only when THIS ticket is a held AskUserQuestion', () => {
    expect(src).toContain(
      "{!(status.held?.toolName === 'AskUserQuestion' && status.held.pendingId === status.pendingId) && ("
    )
  })
  it('Approve and Deny still speak the legacy decision words (the hook maps a plan allow)', () => {
    const block = src.slice(src.indexOf('term-node__approve nodrag'), src.indexOf('✕ Deny'))
    expect(block).toContain("decision: 'allow'")
    expect(block).toContain("decision: 'deny'")
  })
})
