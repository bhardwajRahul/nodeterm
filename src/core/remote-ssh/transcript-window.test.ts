import { describe, expect, it } from 'vitest'
import { parseTranscriptPage, parseTranscriptWindow, transcriptPageCommand, transcriptWindowCommand } from './transcript-window'

const frame = (payload: string, status = 0): string => Buffer.from(payload + `\nNODETERM_READ_STATUS:${status}\n`).toString('base64')
describe('strict transcript window framing', () => {
  it('preserves bytes rather than re-encoding UTF-8 and trims block alignment', () => {
    const r = parseTranscriptWindow('1 1 3 0\n' + frame('aé'), 2)
    expect(r.data).toEqual(Buffer.from([0xc3]))
    expect(r.newOffset).toBe(2)
  })
  it.each([
    'bad\n', '0 5 4 0\n', '0 5 5 0\n', '0 0 0 1\nAAAA',
    '0 1 1 0\n' + frame('a', 1), '0 1 1 0\n' + frame(''),
    '0 1 1 0\n' + frame('a') + '!', '0 1 1 0\n' + Buffer.from('a').toString('base64')
  ])('rejects malformed, oversized, failed or short responses: %s', response => {
    expect(() => parseTranscriptWindow(response, 4)).toThrow()
  })
  it.each([-1, 1.5, NaN, Infinity])('rejects an invalid offset %s before invoking a shell', offset => {
    expect(() => transcriptWindowCommand('/fixture', offset, 1024)).toThrow()
  })
  it.each([0, -1, 1.5, Infinity, 1024 * 1024 + 1])('rejects an invalid cap %s', cap => {
    expect(() => transcriptWindowCommand('/fixture', null, cap)).toThrow()
  })
})

describe('paged transcript read (⌘M panel) framing', () => {
  it('trims block alignment to exactly the asked range, lookbehind byte included', () => {
    const r = parseTranscriptPage('1 2 3\n' + frame('aéb'), 65536)
    expect(r.data).toEqual(Buffer.from('é'))
    expect(r).toMatchObject({ start: 1, end: 3, size: 3 })
  })
  it('an empty file is a valid empty page', () => {
    expect(parseTranscriptPage('0 0 0\n', 65536)).toMatchObject({ start: 0, end: 0, size: 0 })
  })
  it.each([
    'bad\n', '0 5 4\n', '0 1 1 0\n' + frame('a'), '0 0 0\nAAAA',
    '0 1 1\n' + frame('a', 1), '0 1 1\n' + frame(''), '0 1 1\n' + Buffer.from('a').toString('base64')
  ])('rejects malformed, failed or short responses: %s', response => {
    expect(() => parseTranscriptPage(response, 65536)).toThrow()
  })
  it('rejects a reply wider than maxBytes + the lookbehind byte', () => {
    expect(() => parseTranscriptPage('0 3 3\n' + frame('abc'), 1)).toThrow()
    expect(parseTranscriptPage('0 2 2\n' + frame('ab'), 1).data.toString()).toBe('ab')
  })
  it.each([-1, 1.5, NaN, Infinity])('rejects an invalid before %s before invoking a shell', before => {
    expect(() => transcriptPageCommand('/fixture', before, 65536)).toThrow()
  })
  it.each([0, -1, 1.5, Infinity, 5 * 1024 * 1024 + 1])('rejects an invalid maxBytes %s', maxBytes => {
    expect(() => transcriptPageCommand('/fixture', null, maxBytes)).toThrow()
  })
})
