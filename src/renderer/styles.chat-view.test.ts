import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Same idiom as styles.kanban.test.ts: read the checked-in stylesheet (CRLF-normalized, comments
// stripped so a rule's own comment cannot satisfy — or break — the match) and pin the declarations
// a layout depends on.
const CSS = readFileSync(join(__dirname, 'styles.css'), 'utf8')
  .replace(/\r\n/g, '\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')

/** The body of the FIRST rule whose selector is exactly `selector`. */
function ruleBody(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = CSS.match(new RegExp(`(?:^|\\n)${esc}\\s*{([^}]*)}`))
  expect(m, `rule not found: ${selector}`).toBeTruthy()
  return m![1]
}

describe('⌘M chat tool row layout (tool name rendered one letter per line)', () => {
  it('the summary row is a flex row — the reason the two children below must be sized explicitly', () => {
    expect(ruleBody('.term-chat__tool summary')).toMatch(/display:\s*flex;/)
  })

  it('never shrinks or wraps the tool NAME, however long the argument beside it', () => {
    const name = ruleBody('.term-chat__tool-name')
    expect(name).toMatch(/flex:\s*0 0 auto;/)
    expect(name).toMatch(/white-space:\s*nowrap;/)
  })

  it('lets the ARGUMENT shrink below its content width, so its own ellipsis does the truncating', () => {
    const arg = ruleBody('.term-chat__tool-arg')
    expect(arg).toMatch(/flex:\s*1 1 auto;/)
    expect(arg).toMatch(/min-width:\s*0;/)
    expect(arg).toMatch(/text-overflow:\s*ellipsis;/)
    expect(arg).toMatch(/white-space:\s*nowrap;/)
  })
})

describe('nt-spinner', () => {
  it('spins with a CSS keyframe (no dependency) that honours the app-wide animation pause', () => {
    const body = ruleBody('.nt-spinner')
    expect(body).toMatch(/animation:\s*nt-spinner-rotate\b[^;]*infinite;/)
    expect(body).toMatch(/animation-play-state:\s*var\(--nt-anim-state\);/)
    expect(CSS).toMatch(/@keyframes nt-spinner-rotate\s*{/)
  })

  it('is a STATIC indicator under prefers-reduced-motion — still visible, no rotation', () => {
    const blocks = [...CSS.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*{([\s\S]*?)\n}/g)].map((m) => m[1])
    const mine = blocks.find((b) => /\.nt-spinner\s*{/.test(b))
    expect(mine, 'no reduced-motion rule for .nt-spinner').toBeTruthy()
    expect(mine).toMatch(/\.nt-spinner\s*{[^}]*animation:\s*none;/)
    // Not hidden: a frozen ring still says "working", an absent one says nothing.
    expect(mine).not.toMatch(/\.nt-spinner\s*{[^}]*(display:\s*none|visibility:\s*hidden|opacity:\s*0;)/)
  })
})
