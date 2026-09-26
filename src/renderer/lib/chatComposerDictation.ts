// Dictation INTO the ⌘M chat composer's textarea, reusing the one dictation machine
// (`nodeterm:dictate` → Canvas → DictationOverlay). The overlay's terminal target types the take
// into the pane with `pty.sendText`; a composer target must not — the composer is a draft the user
// edits and sends themselves — so the take is handed to the composer that asked, by id.
//
// Keyed by a per-mount COMPOSER id, not the node id: one session can have two composers mounted at
// once (the canvas node's ⌘M face and the kanban card modal's), and a take must land in the one
// whose mic was clicked, exactly once.
import type { DictationTarget } from '../components/DictationOverlay'

interface ComposerDictationDetail {
  composerId: string
  text: string
  /** Set by the listener that took the text — `dispatchEvent` is synchronous, so the sender reads
   *  it right after dispatching. */
  delivered: boolean
}

/** The `nodeterm:dictate` request the composer's mic sends. */
export function requestComposerDictation(nodeId: string, composerId: string): void {
  window.dispatchEvent(new CustomEvent('nodeterm:dictate', { detail: { nodeId, composerId } }))
}

/**
 * What a `nodeterm:dictate` request targets. A bare `{nodeId}` (the terminal header mic, the card
 * modal's mic) keeps its terminal target byte-for-byte; a request naming a composer targets that
 * composer's textarea instead.
 */
export function dictationTargetFromRequest(
  detail: { nodeId: string; composerId?: unknown },
  title: string
): DictationTarget {
  const composerId = detail.composerId
  if (typeof composerId === 'string' && composerId) {
    return { kind: 'chat-composer', nodeId: detail.nodeId, composerId, title }
  }
  return { kind: 'terminal', nodeId: detail.nodeId, title }
}

/** Hand a transcribed take to the composer that asked for it. `false` = no such composer is
 *  mounted any more (the ⌘M view was closed mid-take): the caller must say so, since nothing else
 *  will — the text went nowhere. */
export function deliverToComposer(composerId: string, text: string): boolean {
  const detail: ComposerDictationDetail = { composerId, text, delivered: false }
  window.dispatchEvent(new CustomEvent('nodeterm:chat-dictation', { detail }))
  return detail.delivered
}

/** A composer's end of `deliverToComposer`. Returns the unsubscribe. */
export function subscribeComposerDictation(composerId: string, onText: (text: string) => void): () => void {
  const handler = (e: Event): void => {
    const d = (e as CustomEvent<ComposerDictationDetail>).detail
    if (!d || d.composerId !== composerId || d.delivered) return
    d.delivered = true
    onText(d.text)
  }
  window.addEventListener('nodeterm:chat-dictation', handler)
  return () => window.removeEventListener('nodeterm:chat-dictation', handler)
}
