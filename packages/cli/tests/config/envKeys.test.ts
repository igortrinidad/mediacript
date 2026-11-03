import { describe, test, expect } from '@jest/globals'
import { loadConfigWithEnv } from '../../src/config/index.js'
import { keyStatus } from '../../src/commands/config.js'

describe('loadConfigWithEnv', () => {
  test('GROQ_API_KEY / OPENAI_API_KEY override the saved keys', () => {
    const config = loadConfigWithEnv({ GROQ_API_KEY: ' gsk_env ', OPENAI_API_KEY: 'sk_env' })
    expect(config.groqApiKey).toBe('gsk_env')
    expect(config.openaiApiKey).toBe('sk_env')
  })

  test('blank env values are ignored', () => {
    const saved = loadConfigWithEnv({})
    const config = loadConfigWithEnv({ GROQ_API_KEY: '  ' })
    expect(config.groqApiKey).toBe(saved.groqApiKey)
  })
})

describe('keyStatus', () => {
  test('reports env keys as configured without exposing them', () => {
    const status = keyStatus({ GROQ_API_KEY: 'gsk_secret' })
    expect(status.groq).toEqual({ configured: true, source: 'env' })
    expect(status.transcriptionReady).toBe(true)
    expect(JSON.stringify(status)).not.toContain('gsk_secret')
  })
})
