import { Spinner } from '../components/Spinner'
import { chipFor } from '../lib/keybindingOverrides'

/**
 * What the ⌘M face shows while the lazy `ChatPanel` chunk (it carries the markdown renderer) is
 * still loading — the `<Suspense>` fallback at BOTH of its mount sites, the canvas terminal node
 * and the kanban card modal.
 *
 * It used to be `fallback={null}`, which rendered nothing: the terminal stayed visible under a
 * face that had "opened", then the panel popped in over it — read as a blank or broken ⌘M. This
 * is the panel's own shell instead: the same `.term-chat` container (absolutely positioned over
 * the whole terminal, same z-index, same background — so it covers the terminal exactly where the
 * panel will, with no flash of the xterm underneath), the same bar, and a centred spinner with
 * "Loading conversation…" in the message area.
 *
 * Deliberately free of any transcript logic and of ChatPanel's props: it must stay tiny, because
 * it lives in the STARTUP chunk with the node that imports it — the whole point of the split.
 */
export function ChatPanelFallback({ hint }: { hint?: string }) {
  // Same bar text ChatPanel renders by default, so the swap is not a visible jump.
  const mdChip = chipFor('node.toggleMarkdown')
  return (
    <div className="term-chat nodrag nowheel">
      <div className="term-chat__bar">
        <span>Chat</span>
        <span className="term-chat__bar-end">
          <span className="term-chat__hint">{hint ?? (mdChip ? `${mdChip} to exit` : 'Exit')}</span>
        </span>
      </div>
      <div className="term-chat__msgs">
        <div className="term-chat__fallback-status" role="status" aria-live="polite">
          <Spinner />
          Loading conversation…
        </div>
      </div>
    </div>
  )
}
