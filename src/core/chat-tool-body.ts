// The readable body of a tool call in the ⌘M chat view. Most tool calls are plumbing — a one-line
// chip (`Bash ls`) says all there is to say. Two are not: `ExitPlanMode` carries the full plan the
// user is being asked to approve, and `AskUserQuestion` carries the question and its options. The
// terminal shows both in full ("Ready to code? Here is Claude's plan: …"); the chat view showed a
// bare `ExitPlanMode` chip, so the one thing ⌘M exists for — reading it properly — was missing.
//
// PURE. Input shapes measured on real transcripts (2026-09-26):
//   ExitPlanMode    → {"plan": "<full markdown plan>"}
//   AskUserQuestion → {"questions": [{"question", "header", "multiSelect", "options": [{"label", "description"?}]}]}
// Anything that does not match degrades to NO body (today's chip) — never a half-rendered guess.

/** The body crosses IPC/WS with every chat read; a plan is prose, and 64 KB is far past any real one. */
export const TOOL_BODY_CAP = 64 * 1024
export const TOOL_BODY_TRUNCATED = '\n\n… (truncated)'

function capBody(s: string): string {
  if (s.length <= TOOL_BODY_CAP) return s
  let end = TOOL_BODY_CAP
  // Do not leave half a surrogate pair (an emoji) dangling at the cut.
  const last = s.charCodeAt(end - 1)
  if (last >= 0xd800 && last <= 0xdbff) end -= 1
  return s.slice(0, end) + TOOL_BODY_TRUNCATED
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const nonBlank = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

function planBody(input: Record<string, unknown>): string | undefined {
  return nonBlank(input.plan) ? input.plan : undefined
}

function questionsBody(input: Record<string, unknown>): string | undefined {
  if (!Array.isArray(input.questions)) return undefined
  const blocks: string[] = []
  for (const q of input.questions) {
    if (!isObj(q) || !nonBlank(q.question)) continue
    const lines: string[] = []
    if (nonBlank(q.header)) lines.push(`**${q.header}**`, '')
    lines.push(q.multiSelect === true ? `${q.question} _(multiple choice)_` : q.question)
    const options = Array.isArray(q.options)
      ? q.options
          .filter((o): o is Record<string, unknown> => isObj(o) && nonBlank(o.label))
          .map((o) => `- **${o.label}**${nonBlank(o.description) ? ` — ${o.description}` : ''}`)
      : []
    if (options.length) lines.push('', ...options)
    blocks.push(lines.join('\n'))
  }
  return blocks.length ? blocks.join('\n\n') : undefined
}

/** Markdown body for a tool call worth reading in full, or undefined (render the plain chip). */
export function toolBody(name: string, input: unknown): string | undefined {
  if (!isObj(input)) return undefined
  const body =
    name === 'ExitPlanMode' ? planBody(input) : name === 'AskUserQuestion' ? questionsBody(input) : undefined
  return body === undefined ? undefined : capBody(body)
}
