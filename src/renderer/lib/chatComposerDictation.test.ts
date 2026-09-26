// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  composerFromElement,
  deliverToComposer,
  dictationTargetFromRequest,
  requestComposerDictation,
  subscribeComposerDictation
} from './chatComposerDictation'

const unsubs: Array<() => void> = []
afterEach(() => {
  while (unsubs.length) unsubs.pop()!()
})

describe('dictationTargetFromRequest', () => {
  it('targets the terminal for a bare node request (the header mic, unchanged)', () => {
    expect(dictationTargetFromRequest({ nodeId: 'n1' }, 'shell')).toEqual({ kind: 'terminal', nodeId: 'n1', title: 'shell' })
  })

  it('targets ONE composer when the request names it', () => {
    expect(dictationTargetFromRequest({ nodeId: 'n1', composerId: 'c1' }, 'shell')).toEqual({
      kind: 'chat-composer',
      nodeId: 'n1',
      composerId: 'c1',
      title: 'shell'
    })
  })

  it('ignores a composer id that is not a non-empty string (falls back to the terminal)', () => {
    expect(dictationTargetFromRequest({ nodeId: 'n1', composerId: '' }, 't').kind).toBe('terminal')
    expect(dictationTargetFromRequest({ nodeId: 'n1', composerId: 7 as unknown as string }, 't').kind).toBe('terminal')
  })
})

describe('composer dictation delivery', () => {
  it('delivers to the named composer only and reports that it landed', () => {
    const a = vi.fn()
    const b = vi.fn()
    unsubs.push(subscribeComposerDictation('a', a), subscribeComposerDictation('b', b))
    expect(deliverToComposer('b', 'hello')).toBe(true)
    expect(b).toHaveBeenCalledWith('hello')
    expect(a).not.toHaveBeenCalled()
  })

  it('reports false when the composer is gone — the overlay must say so, not drop the take', () => {
    expect(deliverToComposer('closed', 'hello')).toBe(false)
  })

  it('stops delivering after unsubscribe', () => {
    const a = vi.fn()
    const off = subscribeComposerDictation('a', a)
    off()
    expect(deliverToComposer('a', 'x')).toBe(false)
    expect(a).not.toHaveBeenCalled()
  })

  it('requestComposerDictation asks the canvas for dictation into that composer', () => {
    const seen = vi.fn()
    const h = (e: Event) => seen((e as CustomEvent).detail)
    window.addEventListener('nodeterm:dictate', h)
    unsubs.push(() => window.removeEventListener('nodeterm:dictate', h))
    requestComposerDictation('n1', 'c1')
    expect(seen).toHaveBeenCalledWith({ nodeId: 'n1', composerId: 'c1' })
  })
})

describe('composerFromElement (shortcut dictation with the caret in a composer)', () => {
  it('finds the composer box around the focused textarea', () => {
    const box = document.createElement('div')
    box.setAttribute('data-chat-composer-id', 'c9')
    box.setAttribute('data-chat-node-id', 'n9')
    const ta = document.createElement('textarea')
    box.append(ta)
    document.body.append(box)
    expect(composerFromElement(ta)).toEqual({ nodeId: 'n9', composerId: 'c9' })
    box.remove()
  })

  it('is null anywhere else, and for no element at all', () => {
    const ta = document.createElement('textarea')
    document.body.append(ta)
    expect(composerFromElement(ta)).toBeNull()
    expect(composerFromElement(null)).toBeNull()
    ta.remove()
  })

  it('both shortcut paths in Canvas ask the focused composer before the selected terminal', () => {
    // Source pin: Canvas cannot be mounted here. Without the composer check the keyed chord and
    // hold-to-talk typed the take into the HIDDEN pane under the ⌘M view.
    const src = readFileSync(resolve(__dirname, '../canvas/Canvas.tsx'), 'utf8').replace(/\r\n/g, '\n')
    const toggle = src.slice(src.indexOf('const toggleDictation = useCallback'))
    expect(toggle.indexOf('focusedComposerDictationTarget()')).toBeGreaterThan(-1)
    expect(toggle.indexOf('focusedComposerDictationTarget()')).toBeLessThan(toggle.indexOf('kanbanModalNodeRef.current'))
    const hold = src.slice(src.indexOf('armed = true\n        heldSince = Date.now()'))
    expect(hold.indexOf('focusedComposerDictationTarget()')).toBeGreaterThan(-1)
    expect(hold.indexOf('focusedComposerDictationTarget()')).toBeLessThan(hold.indexOf('setDictationNonce'))
  })
})
