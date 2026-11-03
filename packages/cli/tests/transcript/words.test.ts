import { describe, test, expect } from '@jest/globals'
import { planChunkRanges, mergeChunkTranscripts, findSpeechHoles } from '../../src/transcript/words.js'

describe('findSpeechHoles', () => {
  // 60s: noise floor -50dB, speech -20dB everywhere except a real pause at 20–30s
  const levels = Array.from({ length: 600 }, (_, i) => (i >= 200 && i < 300 ? -50 : -20))

  test('flags a loud stretch with no words, ignoring words stretched over it', () => {
    const words = [
      { word: 'um', start: 0, end: 1 },
      { word: 'dois', start: 1, end: 9 },
      { word: 'tres', start: 18, end: 19 }
    ]
    expect(findSpeechHoles(words, levels, 0.1, 19.5)).toEqual([{ start: 2.5, end: 18 }])
  })

  test('ignores a quiet stretch with no words', () => {
    const words = [{ word: 'a', start: 19, end: 20 }, { word: 'b', start: 30, end: 31 }]
    const holes = findSpeechHoles(words, levels, 0.1, 31)
    expect(holes).toEqual([{ start: 0, end: 19 }])
  })

  test('adapts the threshold to noisy recordings where speech is only a few dB above the floor', () => {
    // Crowd noise at -30dB, recognized speech at -26dB, a skipped stretch (10–30s) peaking at -27dB
    const noisy = Array.from({ length: 400 }, (_, i) => {
      if (i < 100 || i >= 300) return i % 2 === 0 ? -26 : -30
      return i % 4 === 0 ? -30 : -27
    })
    const words = [
      ...Array.from({ length: 10 }, (_, i) => ({ word: 'a', start: i, end: i + 0.9 })),
      ...Array.from({ length: 10 }, (_, i) => ({ word: 'b', start: 30 + i, end: 30 + i + 0.9 }))
    ]
    expect(findSpeechHoles(words, noisy, 0.1, 40)).toEqual([{ start: 9.9, end: 30 }])
  })

  test('returns nothing when words cover the audio', () => {
    const words = Array.from({ length: 30 }, (_, i) => ({ word: 'x', start: i * 2, end: i * 2 + 1.5 }))
    expect(findSpeechHoles(words, levels, 0.1, 60)).toEqual([])
  })
})

describe('planChunkRanges', () => {
  test('returns a single range when the audio fits in one chunk', () => {
    expect(planChunkRanges([], 0.1, 50, 60)).toEqual([{ start: 0, end: 50 }])
  })

  test('splits at the quietest point before each limit', () => {
    // 200s of speech at -20dB with a pause (-60dB) around 85s and 170s
    const levels = Array.from({ length: 2000 }, (_, i) => (i >= 848 && i <= 852) || (i >= 1698 && i <= 1702) ? -60 : -20)
    const ranges = planChunkRanges(levels, 0.1, 200, 100, 30)
    expect(ranges).toHaveLength(3)
    expect(ranges[0].start).toBe(0)
    expect(ranges[0].end).toBeCloseTo(85.05, 1)
    expect(ranges[1].start).toBe(ranges[0].end)
    expect(ranges[1].end).toBeCloseTo(170.05, 1)
    expect(ranges[2]).toEqual({ start: ranges[1].end, end: 200 })
  })

  test('never exceeds the max chunk duration and covers the whole file without gaps', () => {
    const levels = Array.from({ length: 6000 }, (_, i) => -20 - (i % 37))
    const ranges = planChunkRanges(levels, 0.1, 600, 90, 30)
    expect(ranges[0].start).toBe(0)
    expect(ranges[ranges.length - 1].end).toBe(600)
    for (let i = 0; i < ranges.length; i++) {
      expect(ranges[i].end - ranges[i].start).toBeLessThanOrEqual(90)
      if (i > 0) expect(ranges[i].start).toBe(ranges[i - 1].end)
    }
  })
})

describe('mergeChunkTranscripts', () => {
  test('rebases word and segment timings by each chunk start', () => {
    const merged = mergeChunkTranscripts([
      { range: { start: 0, end: 10 }, result: { text: 'olá mundo', segments: [{ start: 0, end: 2, text: 'olá mundo' }], words: [{ word: 'olá', start: 0.1, end: 0.5 }, { word: 'mundo', start: 0.6, end: 1 }] } },
      { range: { start: 10, end: 20 }, result: { text: 'tchau', segments: [{ start: 1, end: 2, text: 'tchau' }], words: [{ word: 'tchau', start: 1.2, end: 1.6 }] } }
    ])
    expect(merged.words).toEqual([
      { word: 'olá', start: 0.1, end: 0.5 },
      { word: 'mundo', start: 0.6, end: 1 },
      { word: 'tchau', start: 11.2, end: 11.6 }
    ])
    expect(merged.segments[1]).toMatchObject({ start: 11, end: 12, text: 'tchau' })
    expect(merged.text).toBe('olá mundo tchau')
  })

  test('drops punctuation-only words and words inside segments flagged as silence', () => {
    const merged = mergeChunkTranscripts([{
      range: { start: 0, end: 30 },
      result: {
        text: '. Obrigado.',
        segments: [
          { start: 0, end: 20, text: '.', noSpeechProb: 0.1, avgLogprob: -0.6 },
          { start: 20, end: 30, text: 'Obrigado.', noSpeechProb: 0.9, avgLogprob: -1.4 }
        ],
        words: [{ word: '.', start: 19, end: 19.1 }, { word: 'Obrigado.', start: 25, end: 25.5 }]
      }
    }])
    expect(merged.words).toEqual([])
    expect(merged.segments).toEqual([])
  })

  test('makes overlapping word timings monotonic', () => {
    const merged = mergeChunkTranscripts([{
      range: { start: 0, end: 10 },
      result: { text: 'tempo real permite', segments: [], words: [{ word: 'real', start: 6.08, end: 6.4 }, { word: 'permite', start: 5.98, end: 7.36 }] }
    }])
    expect(merged.words[1]).toEqual({ word: 'permite', start: 6.4, end: 7.36 })
  })
})
