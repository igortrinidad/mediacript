import { describe, it, expect } from '@jest/globals'
import { limitFileNameLength, getSafeBaseName, MAX_BASE_NAME_BYTES } from '../../src/utils/fileHelpers.js'

describe('limitFileNameLength', () => {
  it('leaves short names untouched', () => {
    expect(limitFileNameLength('video')).toBe('video')
  })

  it('caps long ascii names and stays deterministic', () => {
    const long = 'a'.repeat(400)
    const out = limitFileNameLength(long)
    expect(Buffer.byteLength(out)).toBeLessThanOrEqual(MAX_BASE_NAME_BYTES)
    expect(limitFileNameLength(long)).toBe(out)
  })

  it('does not split multibyte characters and caps by bytes', () => {
    const out = limitFileNameLength('ação😀'.repeat(60))
    expect(Buffer.byteLength(out)).toBeLessThanOrEqual(MAX_BASE_NAME_BYTES)
    expect(out).not.toContain('�')
  })

  it('keeps names sharing a long prefix distinct', () => {
    const prefix = 'x'.repeat(300)
    expect(limitFileNameLength(`${prefix}1`)).not.toBe(limitFileNameLength(`${prefix}2`))
  })

  it('getSafeBaseName drops dir and extension', () => {
    expect(getSafeBaseName('/tmp/a/' + 'b'.repeat(300) + '.mp4')).toMatch(/^b+_[0-9a-f]{8}$/)
  })
})
