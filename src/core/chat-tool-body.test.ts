import { describe, expect, it } from 'vitest'
import { TOOL_BODY_CAP, TOOL_BODY_TRUNCATED, toolBody } from './chat-tool-body'

// Input shapes measured on this server's transcripts (2026-09-26):
//   ExitPlanMode    → {"plan": "<full markdown plan>"}
//   AskUserQuestion → {"questions": [{"question", "header", "multiSelect", "options": [{"label", "description"?}]}]}

describe('toolBody — ExitPlanMode', () => {
  it('returns the plan markdown verbatim', () => {
    const plan = '# Fix the chat view\n\n1. Parse the plan\n2. Render it'
    expect(toolBody('ExitPlanMode', { plan })).toBe(plan)
  })

  it('degrades to no body for a missing, non-string or blank plan', () => {
    expect(toolBody('ExitPlanMode', {})).toBeUndefined()
    expect(toolBody('ExitPlanMode', { plan: 42 })).toBeUndefined()
    expect(toolBody('ExitPlanMode', { plan: ['a'] })).toBeUndefined()
    expect(toolBody('ExitPlanMode', { plan: '   \n ' })).toBeUndefined()
    expect(toolBody('ExitPlanMode', null)).toBeUndefined()
    expect(toolBody('ExitPlanMode', 'plan')).toBeUndefined()
  })

  it('caps an oversized plan with a truncation marker', () => {
    const body = toolBody('ExitPlanMode', { plan: 'x'.repeat(TOOL_BODY_CAP + 500) })!
    expect(body.startsWith('x'.repeat(100))).toBe(true)
    expect(body.endsWith(TOOL_BODY_TRUNCATED)).toBe(true)
    expect(body.length).toBe(TOOL_BODY_CAP + TOOL_BODY_TRUNCATED.length)
  })

  it('never splits a surrogate pair at the cap', () => {
    const plan = 'a'.repeat(TOOL_BODY_CAP - 1) + '😀' + 'tail'
    const body = toolBody('ExitPlanMode', { plan })!
    const kept = body.slice(0, body.length - TOOL_BODY_TRUNCATED.length)
    expect(kept).toBe('a'.repeat(TOOL_BODY_CAP - 1))
  })

  it('leaves a plan exactly at the cap untouched', () => {
    const plan = 'y'.repeat(TOOL_BODY_CAP)
    expect(toolBody('ExitPlanMode', { plan })).toBe(plan)
  })
})

describe('toolBody — AskUserQuestion', () => {
  it('renders header, question and options with descriptions', () => {
    const input = {
      questions: [
        {
          question: 'Which database should we use?',
          header: 'Database',
          multiSelect: false,
          options: [
            { label: 'Postgres', description: 'Relational, battle-tested' },
            { label: 'SQLite' }
          ]
        }
      ]
    }
    expect(toolBody('AskUserQuestion', input)).toBe(
      '**Database**\n\nWhich database should we use?\n\n- **Postgres** — Relational, battle-tested\n- **SQLite**'
    )
  })

  it('notes multiple choice and separates several questions', () => {
    const input = {
      questions: [
        { question: 'Pick features', header: 'Scope', multiSelect: true, options: [{ label: 'A' }, { label: 'B' }] },
        { question: 'Ship today?', options: [{ label: 'Yes' }] }
      ]
    }
    expect(toolBody('AskUserQuestion', input)).toBe(
      '**Scope**\n\nPick features _(multiple choice)_\n\n- **A**\n- **B**\n\nShip today?\n\n- **Yes**'
    )
  })

  it('skips malformed questions and options, and degrades to no body when nothing is left', () => {
    expect(toolBody('AskUserQuestion', {})).toBeUndefined()
    expect(toolBody('AskUserQuestion', { questions: 'x' })).toBeUndefined()
    expect(toolBody('AskUserQuestion', { questions: [] })).toBeUndefined()
    expect(toolBody('AskUserQuestion', { questions: [null, 3, { header: 'H' }, { question: 7 }] })).toBeUndefined()
    const input = {
      questions: [
        null,
        { question: 'Q?', header: 5, multiSelect: 'yes', options: [null, { label: 3 }, { label: 'ok', description: 9 }] }
      ]
    }
    expect(toolBody('AskUserQuestion', input)).toBe('Q?\n\n- **ok**')
  })

  it('renders a question with no options as just the question', () => {
    expect(toolBody('AskUserQuestion', { questions: [{ question: 'Anything else?' }] })).toBe('Anything else?')
  })
})

describe('toolBody — every other tool', () => {
  it('has no body (it stays a collapsed chip)', () => {
    expect(toolBody('Bash', { command: 'ls', plan: 'not a plan' })).toBeUndefined()
    expect(toolBody('ToolSearch', { query: 'x' })).toBeUndefined()
  })
})
