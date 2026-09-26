import { useCallback, useId, useRef, useState, type FormEvent } from 'react'
import type { ChatQuestion, PermissionAnswer } from '@shared/agents/permission-answer'
import {
  CHAT_ANSWER_TEXT_MAX,
  PLAN_CHOICES,
  emptySelection,
  planReviseAnswer,
  questionAnswerFrom,
  toggleLabel,
  type QuestionSelection
} from '../lib/chatAnswer'

/**
 * Answer controls under the ⌘M panel's Plan / Question card — rendered ONLY on the card the node's
 * held request belongs to (`activeAnswerCard`), and keyed by that request's ticket in ChatPanel, so
 * a new hold starts clean. They build a `PermissionAnswer` and hand it to `onSubmit`
 * (`answerPermission`); what the hook prints is core's decision, never ours.
 *
 * Status, deliberately quiet: "Sending…" while the call is out, "Sent" once core wrote the answer
 * (the hook's "answered" POST then flips the node to working and the card turns read-only — so a
 * "Sent" cannot outlive the hold), and on a refusal (`false`: an expired hold, a ticket core has no
 * record of, a hook script too old to read it) or a rejected call, one line that names the terminal
 * path — the TUI dialog is still up and still works — with every control usable again for a retry.
 */

type SubmitStatus = 'idle' | 'sending' | 'sent' | 'error'

interface Common {
  onSubmit: (answer: PermissionAnswer) => Promise<boolean>
  /** The node's agent, for "Sent — waiting for Claude Code…". */
  agentLabel: string
  /** The effective ⌘M chord ('' = unbound), for the terminal fallback in the error line. */
  chip: string
}

function useSubmit(onSubmit: Common['onSubmit']) {
  const [status, setStatus] = useState<SubmitStatus>('idle')
  const inFlight = useRef(false)
  const submit = useCallback(
    async (answer: PermissionAnswer) => {
      if (inFlight.current) return
      inFlight.current = true
      setStatus('sending')
      let ok = false
      try {
        ok = (await onSubmit(answer)) === true
      } catch {
        ok = false
      }
      inFlight.current = false
      setStatus(ok ? 'sent' : 'error')
    },
    [onSubmit]
  )
  return { status, submit, busy: status === 'sending' || status === 'sent' }
}

function StatusLine({ status, agentLabel, chip }: { status: SubmitStatus; agentLabel: string; chip: string }) {
  // Always mounted, so the live region is not remounted (and re-announced) as the status changes.
  const text =
    status === 'sending'
      ? 'Sending…'
      : status === 'sent'
        ? `Sent — waiting for ${agentLabel}…`
        : status === 'error'
          ? chip
            ? `Couldn't send — answer in the terminal (${chip})`
            : "Couldn't send — answer in the terminal"
          : ''
  return (
    <div
      className={`term-chat__answer-status${status === 'error' ? ' term-chat__answer-status--error' : ''}`}
      role="status"
      aria-live="polite"
    >
      {text}
    </div>
  )
}

export function PlanAnswerControls({ onSubmit, agentLabel, chip }: Common) {
  const { status, submit, busy } = useSubmit(onSubmit)
  const [revising, setRevising] = useState(false)
  const [feedback, setFeedback] = useState('')
  const revise = planReviseAnswer(feedback)
  const feedbackId = useId()

  const sendRevise = (e: FormEvent) => {
    e.preventDefault()
    if (revise && !busy) void submit(revise)
  }

  return (
    <div className="term-chat__answer" role="group" aria-label="Answer the plan">
      {!revising ? (
        <div className="term-chat__answer-row">
          {PLAN_CHOICES.map((c, i) => (
            <button
              key={c.mode}
              type="button"
              className={`term-chat__answer-btn${i === 0 ? ' term-chat__answer-btn--primary' : ''}`}
              title={c.hint}
              disabled={busy}
              onClick={() => void submit({ kind: 'plan', mode: c.mode })}
            >
              {c.label}
            </button>
          ))}
          <button type="button" className="term-chat__answer-btn" disabled={busy} onClick={() => setRevising(true)}>
            Revise…
          </button>
        </div>
      ) : (
        <form className="term-chat__answer-revise" onSubmit={sendRevise}>
          <label htmlFor={feedbackId} className="term-chat__answer-label">
            What should change in the plan?
          </label>
          <textarea
            id={feedbackId}
            className="term-chat__input"
            rows={3}
            maxLength={CHAT_ANSWER_TEXT_MAX}
            value={feedback}
            disabled={busy}
            autoFocus
            onChange={(e) => setFeedback(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && !busy) {
                e.stopPropagation()
                setRevising(false)
              }
            }}
          />
          <div className="term-chat__answer-row">
            <button type="submit" className="term-chat__answer-btn term-chat__answer-btn--primary" disabled={busy || !revise}>
              Send feedback
            </button>
            <button type="button" className="term-chat__answer-btn" disabled={busy} onClick={() => setRevising(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <StatusLine status={status} agentLabel={agentLabel} chip={chip} />
    </div>
  )
}

export function QuestionAnswerControls({ questions, onSubmit, agentLabel, chip }: Common & { questions: ChatQuestion[] }) {
  const { status, submit, busy } = useSubmit(onSubmit)
  const [sel, setSel] = useState<QuestionSelection[]>(() => emptySelection(questions))
  const answer = questionAnswerFrom(questions, sel)
  const baseId = useId()

  const update = (i: number, next: Partial<QuestionSelection>) =>
    setSel((s) => s.map((x, k) => (k === i ? { ...x, ...next } : x)))

  const onFormSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (answer && !busy) void submit(answer)
  }

  return (
    <form className="term-chat__answer" aria-label="Answer the question" onSubmit={onFormSubmit}>
      {questions.map((q, i) => {
        const s = sel[i]
        const name = `${baseId}-q${i}`
        const otherId = `${name}-other`
        const noOptions = q.options.length === 0
        return (
          <fieldset key={q.question} className="term-chat__answer-q" disabled={busy}>
            <legend className="term-chat__answer-label">{q.question}</legend>
            {q.options.map((o) => (
              <label key={o.label} className="term-chat__answer-option">
                <input
                  type={q.multiSelect ? 'checkbox' : 'radio'}
                  name={name}
                  checked={s.labels.includes(o.label) && (q.multiSelect || !s.other)}
                  onChange={(e) =>
                    q.multiSelect
                      ? update(i, { labels: toggleLabel(s.labels, o.label, e.target.checked) })
                      : update(i, { labels: [o.label], other: false })
                  }
                />
                <span>{o.label}</span>
                {o.description && <span className="term-chat__answer-desc">{o.description}</span>}
              </label>
            ))}
            {!noOptions && (
              <label className="term-chat__answer-option">
                <input
                  type={q.multiSelect ? 'checkbox' : 'radio'}
                  name={name}
                  checked={s.other}
                  onChange={(e) =>
                    q.multiSelect
                      ? update(i, { other: e.target.checked })
                      : update(i, { other: true, labels: [] })
                  }
                />
                <span>Other</span>
              </label>
            )}
            <input
              type="text"
              className="term-chat__input term-chat__answer-text"
              aria-label={noOptions ? `Your answer: ${q.question}` : `Other answer: ${q.question}`}
              placeholder={noOptions ? 'Your answer' : 'Type another answer'}
              id={otherId}
              maxLength={CHAT_ANSWER_TEXT_MAX}
              value={s.otherText}
              // Typing is choosing "Other" (on a single choice it replaces the picked option).
              onChange={(e) =>
                update(i, q.multiSelect ? { otherText: e.target.value, other: true } : { otherText: e.target.value, other: true, labels: [] })
              }
            />
          </fieldset>
        )
      })}
      <div className="term-chat__answer-row">
        <button type="submit" className="term-chat__answer-btn term-chat__answer-btn--primary" disabled={busy || !answer}>
          Submit
        </button>
      </div>
      <StatusLine status={status} agentLabel={agentLabel} chip={chip} />
    </form>
  )
}
