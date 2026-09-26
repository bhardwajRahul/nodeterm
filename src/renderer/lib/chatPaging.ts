import type { ChatMessage, ChatPart, ChatTranscriptResult } from '@shared/types'

/**
 * Pure paging state for the ⌘M chat panel (`nodes/ChatPanel.tsx`). The panel reads a SMALL tail
 * window first and older windows as the user scrolls up (`chat.readTranscript`'s `page` argument —
 * see `shared/chat-page.ts` and the ⌘M bullet in CLAUDE.md). Everything that decides what the
 * thread looks like after a read lives here so it is unit-tested without a DOM.
 */

/** First (and every turn-end / ↻) read: the newest window only. Small on purpose — it is what the
 *  user waits for, and on an SSH project it crosses the network on every open and every turn end. */
export const CHAT_TAIL_PAGE_BYTES = 256 * 1024
/** Each older page fetched on scroll-up. Larger than the tail: the user is already reading. */
export const CHAT_OLDER_PAGE_BYTES = 512 * 1024
/** Within this many px of the top, the next older page is fetched. */
export const CHAT_OLDER_FETCH_THRESHOLD_PX = 200

export interface ChatThread {
  /** Which transcript these messages came from. Keys are byte offsets INTO ONE FILE, so a thread
   *  of another session/node must never be merged by key with this one. */
  identity: string
  messages: ChatMessage[]
  /** Cursor of the OLDEST loaded page: pass as `before` to fetch the next older one. `null` = the
   *  start of the transcript is loaded (or the reader does not page — grok). */
  olderCursor: number | null
  /** Tool results whose `tool_use` has not been loaded yet (it is in an older page), by id. */
  pending: ReadonlyMap<string, string>
}

export const emptyThread = (identity: string): ChatThread => ({
  identity,
  messages: [],
  olderCursor: null,
  pending: new Map()
})

type ToolPart = Extract<ChatPart, { kind: 'tool' }>

/**
 * Attach held results to the tool parts they belong to. Returns a new array in which ONLY the
 * messages that changed are new objects (the rest keep identity, so their bubbles don't
 * re-render), plus what is still unclaimed. A tool that already has a result keeps it.
 */
export function attachCarried(
  messages: ChatMessage[],
  pending: ReadonlyMap<string, string>
): { messages: ChatMessage[]; pending: Map<string, string> } {
  const left = new Map(pending)
  if (left.size === 0) return { messages, pending: left }
  const out = messages.map((m) => {
    let changed = false
    const parts = m.parts.map((p) => {
      if (p.kind !== 'tool' || !p.id || p.result || !left.has(p.id)) return p
      const withResult: ToolPart = { ...p, result: left.get(p.id)! }
      left.delete(p.id)
      changed = true
      return withResult
    })
    return changed ? { ...m, parts } : m
  })
  return { messages: out, pending: left }
}

const carriedOf = (res: ChatTranscriptResult): Array<[string, string]> =>
  (res.unmatchedResults ?? []).map((r) => [r.id, r.result])

/**
 * Apply a TAIL read (first open, turn-end reload, ↻) to the thread.
 *
 * - Another identity, or a reader that returned the whole thing (`olderCursor` null — grok, a
 *   small file, a legacy-shaped result): replace.
 * - Otherwise merge by key: every loaded message older than the tail window is KEPT (older pages
 *   the user already scrolled through survive a turn end), everything from the window on is
 *   replaced by the tail — so nothing duplicates, and the optimistic unkeyed "just sent" bubble
 *   is dropped because the transcript now carries the real one.
 * - Unless no loaded message reaches into the new window: then the turn wrote more than a whole
 *   window, and the bytes between what is rendered and the new window were never read. Stitching
 *   would hide them silently, so the thread resets to the tail and pages back normally.
 */
export function applyTail(t: ChatThread, identity: string, res: ChatTranscriptResult): ChatThread {
  const cursor = res.olderCursor ?? null
  const fresh = (): ChatThread => ({
    identity,
    messages: res.messages,
    olderCursor: cursor,
    pending: cursor === null ? new Map() : new Map(carriedOf(res))
  })
  if (t.identity !== identity || cursor === null) return fresh()
  const keyed = t.messages.filter((m) => m.key !== undefined)
  if (!keyed.some((m) => m.key! >= cursor)) return fresh()
  const kept = keyed.filter((m) => m.key! < cursor)
  // A result written this turn for a tool rendered from an earlier read arrives as carried.
  const attached = attachCarried(kept, new Map([...t.pending, ...carriedOf(res)]))
  return {
    identity,
    messages: [...attached.messages, ...res.messages],
    olderCursor: t.olderCursor,
    pending: t.olderCursor === null ? new Map() : attached.pending
  }
}

/**
 * Prepend an OLDER page (a read with `before` = the thread's cursor). Held results claim their
 * tools in it; its own carried results (tools older still) join the held set; at the start of the
 * file whatever is still held is dropped — nothing older can ever claim it.
 *
 * Defensive: messages at or after the oldest loaded key are skipped (no duplicate), and a cursor
 * that did not move backwards ends paging rather than re-requesting the same window forever.
 */
export function applyOlder(t: ChatThread, res: ChatTranscriptResult): ChatThread {
  let oldest = Infinity
  for (const m of t.messages) if (m.key !== undefined && m.key < oldest) oldest = m.key
  const older = res.messages.filter((m) => m.key === undefined || m.key < oldest)
  let cursor = res.olderCursor ?? null
  if (cursor !== null && t.olderCursor !== null && cursor >= t.olderCursor) cursor = null
  const attached = attachCarried(older, new Map([...t.pending, ...carriedOf(res)]))
  return {
    identity: t.identity,
    messages: [...attached.messages, ...t.messages],
    olderCursor: cursor,
    pending: cursor === null ? new Map() : attached.pending
  }
}

/** Scroll position that keeps the same content under the viewport after content was inserted
 *  ABOVE it: shift by exactly the height that was added. */
export function anchoredScrollTop(prev: { scrollTop: number; scrollHeight: number }, nextScrollHeight: number): number {
  return prev.scrollTop + (nextScrollHeight - prev.scrollHeight)
}

/** Fetch the next older page? Only near the top, only when there is one, one at a time, never on
 *  its own after a failure (the retry row owns that), and never before the first read landed. */
export function shouldFetchOlder(s: {
  scrollTop: number
  olderCursor: number | null
  inFlight: boolean
  failed: boolean
  loaded: boolean
}, threshold = CHAT_OLDER_FETCH_THRESHOLD_PX): boolean {
  return s.loaded && !s.inFlight && !s.failed && s.olderCursor !== null && s.scrollTop <= threshold
}
