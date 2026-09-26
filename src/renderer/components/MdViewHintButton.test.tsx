// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { MdViewHintButton } from './MdViewHintButton'
import { NodeLabels } from './kanban/NodeLabels'
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

describe('MdViewHintButton', () => {
  it('shows the chord and the label, carries its tooltip, and is not a drag handle', () => {
    act(() =>
      root.render(<MdViewHintButton hint={{ chip: '⌘M', label: 'Markdown view' }} tooltip="Open markdown view (⌘M)" onToggle={() => {}} />)
    )
    const btn = host.querySelector('button.term-node__mdhint') as HTMLButtonElement
    expect(btn.classList.contains('nodrag')).toBe(true)
    expect(btn.querySelector('.term-node__mdhint-chip')?.textContent).toBe('⌘M')
    expect(btn.textContent).toBe('⌘M Markdown view')
    expect(btn.title).toBe('Open markdown view (⌘M)')
  })

  it('clicking toggles the view', () => {
    const onToggle = vi.fn()
    act(() => root.render(<MdViewHintButton hint={{ chip: '⌘M', label: 'Terminal' }} tooltip="t" onToggle={onToggle} />))
    act(() => (host.querySelector('button') as HTMLButtonElement).click())
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})

describe('NodeLabels trailing slot', () => {
  it('renders the trailing node at the END of the label row, after the "+ Label" button', () => {
    act(() => root.render(<NodeLabels nodeId="n1" trailing={<span className="probe">x</span>} />))
    const row = host.querySelector('.term-node__labelrow') as HTMLElement
    const last = row.lastElementChild as HTMLElement
    expect(last.classList.contains('term-node__labeltrail')).toBe(true)
    expect(last.querySelector('.probe')).toBeTruthy()
  })

  it('renders no trailing slot when none is given (other callers unchanged)', () => {
    act(() => root.render(<NodeLabels nodeId="n1" />))
    expect(host.querySelector('.term-node__labeltrail')).toBeNull()
  })
})

describe('TerminalNode wiring', () => {
  const src = readFileSync(join(__dirname, '../nodes/TerminalNode.tsx'), 'utf8').replace(/\r\n/g, '\n')
  it('passes the hint into the label row through NodeLabels\' trailing slot', () => {
    expect(src).toMatch(/<NodeLabels\s+nodeId=\{id\}\s+trailing=\{/)
  })
  it('derives the chat/markdown label from the SAME rule that picks the ⌘M face', () => {
    expect(src).toContain('const useChat = mdMode && chatAvailable')
    expect(src).toMatch(/mdViewHint\(\{[^}]*chatAvailable[^}]*\}\)/s)
  })
})

describe('trailing slot CSS', () => {
  const css = readFileSync(join(__dirname, '../styles.css'), 'utf8').replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '')
  it('is pushed to the right end of the row without moving the chips', () => {
    expect(css).toMatch(/\n\.term-node__labeltrail\s*{[^}]*margin-left:\s*auto;/)
  })
})
