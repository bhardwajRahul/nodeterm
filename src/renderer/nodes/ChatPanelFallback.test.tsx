// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { ChatPanelFallback } from './ChatPanelFallback'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('ChatPanelFallback', () => {
  it('is the panel shell — same container classes, so it covers the terminal exactly as the panel will', () => {
    act(() => root.render(<ChatPanelFallback hint="⌘M to exit" />))
    const shell = host.firstElementChild as HTMLElement
    expect(shell.classList.contains('term-chat')).toBe(true)
    expect(shell.classList.contains('nodrag')).toBe(true)
    expect(shell.classList.contains('nowheel')).toBe(true)
    expect(shell.querySelector(':scope > .term-chat__bar')?.textContent).toContain('Chat')
    expect(shell.querySelector('.term-chat__hint')?.textContent).toBe('⌘M to exit')
    expect(shell.querySelector(':scope > .term-chat__msgs')).toBeTruthy()
  })

  it('says it is loading, with a spinner, inside a polite status region', () => {
    act(() => root.render(<ChatPanelFallback />))
    const status = host.querySelector('[role="status"]') as HTMLElement
    expect(status).toBeTruthy()
    expect(status.getAttribute('aria-live')).toBe('polite')
    expect(status.textContent).toBe('Loading conversation…')
    expect(status.querySelector('.nt-spinner')).toBeTruthy()
  })
})

// Both mount sites of the lazy ChatPanel (canvas node + kanban card modal) must show the shell
// while the chunk loads; `fallback={null}` is what left the ⌘M face blank.
describe.each([
  ['TerminalNode.tsx', join(__dirname, 'TerminalNode.tsx')],
  ['CardModal.tsx', join(__dirname, '../components/kanban/CardModal.tsx')]
])('%s lazy ChatPanel', (_name, file) => {
  const src = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  it('suspends into ChatPanelFallback, never into nothing', () => {
    const at = src.indexOf('<ChatPanel\n')
    expect(at).toBeGreaterThan(0)
    const opener = src.lastIndexOf('<Suspense', at)
    expect(opener).toBeGreaterThan(0)
    const wrapper = src.slice(opener, at)
    expect(wrapper).toContain('fallback={<ChatPanelFallback')
    expect(wrapper).not.toContain('fallback={null}')
  })
})
