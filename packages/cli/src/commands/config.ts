/**
 * Non-interactive key management, for scripts and agents that can't answer prompts:
 *
 *   mediacript config status              JSON with which transcription keys are set (never the keys)
 *   mediacript config set <groq|openai> <key> [--no-verify]
 *   mediacript config unset <groq|openai>
 *   mediacript config path
 *
 * `set` checks the key against the provider before saving unless --no-verify.
 * Exit codes: 0 ok, 1 key rejected / provider unreachable, 2 bad arguments.
 */

import axios from 'axios'
import { getConfigFile, loadConfig, saveConfig, TRANSCRIPTION_KEY_ENV } from '../config/index.js'

type Provider = 'groq' | 'openai'

const PROVIDERS: Record<Provider, { configKey: 'groqApiKey' | 'openaiApiKey'; modelsUrl: string; keysUrl: string }> = {
  groq: { configKey: 'groqApiKey', modelsUrl: 'https://api.groq.com/openai/v1/models', keysUrl: 'https://console.groq.com/keys' },
  openai: { configKey: 'openaiApiKey', modelsUrl: 'https://api.openai.com/v1/models', keysUrl: 'https://platform.openai.com/api-keys' }
}

export const CONFIG_USAGE = `Usage: mediacript config <command>

Commands:
  status                              Which transcription keys are configured (JSON, keys never printed)
  set <groq|openai> <key> [--no-verify]  Save a key (checked against the provider first)
  unset <groq|openai>                 Remove a saved key
  path                                Print the config file location

Keys can also come from the GROQ_API_KEY / OPENAI_API_KEY environment variables,
which take precedence over the saved ones.
Get a key: Groq ${PROVIDERS.groq.keysUrl} | OpenAI ${PROVIDERS.openai.keysUrl}
`

export type KeyCheck = { ok: true } | { ok: false; reason: 'rejected' | 'unreachable'; detail: string }

/** Lists models with the key: cheap, no usage cost, and fails with 401 on a bad key */
export async function verifyApiKey(provider: Provider, apiKey: string, timeoutMs = 15000): Promise<KeyCheck> {
  try {
    await axios.get(PROVIDERS[provider].modelsUrl, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: timeoutMs })
    return { ok: true }
  } catch (error: any) {
    const status = error?.response?.status
    if (status === 401 || status === 403) return { ok: false, reason: 'rejected', detail: `HTTP ${status}` }
    return { ok: false, reason: 'unreachable', detail: status ? `HTTP ${status}` : error?.code || error?.message || 'unknown error' }
  }
}

export function keyStatus(env: NodeJS.ProcessEnv = process.env) {
  const saved = loadConfig()
  const status: Record<Provider, { configured: boolean; source: 'env' | 'config' | null }> = {} as any
  for (const provider of Object.keys(PROVIDERS) as Provider[]) {
    const { configKey } = PROVIDERS[provider]
    const source = env[TRANSCRIPTION_KEY_ENV[configKey]]?.trim() ? 'env' : saved[configKey] ? 'config' : null
    status[provider] = { configured: source !== null, source }
  }
  return { configFile: getConfigFile(), ...status, transcriptionReady: status.groq.configured || status.openai.configured }
}

function parseProvider(value: string | undefined): Provider {
  const provider = value?.toLowerCase()
  if (provider !== 'groq' && provider !== 'openai') throw new Error(`Provider must be groq or openai, got: ${value ?? '(none)'}`)
  return provider
}

export async function runConfigCommand(argv: string[]): Promise<void> {
  const [command, ...rest] = argv
  try {
    switch (command) {
      case 'status':
        process.stdout.write(JSON.stringify(keyStatus(), null, 2) + '\n')
        return
      case 'path':
        process.stdout.write(getConfigFile() + '\n')
        return
      case 'set': {
        const positional = rest.filter((a) => !a.startsWith('--'))
        const provider = parseProvider(positional[0])
        const key = positional[1]?.trim()
        if (!key) throw new Error('Missing key')
        if (!rest.includes('--no-verify')) {
          const check = await verifyApiKey(provider, key)
          if (!check.ok) {
            const why = check.reason === 'rejected'
              ? `the ${provider} key was rejected (${check.detail}); nothing was saved. Get a valid key at ${PROVIDERS[provider].keysUrl}`
              : `could not reach ${provider} to check the key (${check.detail}); nothing was saved. Retry, or pass --no-verify`
            process.stderr.write(`Error: ${why}\n`)
            process.exit(1)
          }
        }
        const config = loadConfig()
        config[PROVIDERS[provider].configKey] = key
        saveConfig(config, true)
        if (loadConfig()[PROVIDERS[provider].configKey] !== key) {
          process.stderr.write(`Error: could not write ${getConfigFile()}\n`)
          process.exit(1)
        }
        process.stderr.write(`${provider} key saved in ${getConfigFile()}\n`)
        return
      }
      case 'unset': {
        const provider = parseProvider(rest[0])
        const config = loadConfig()
        delete config[PROVIDERS[provider].configKey]
        saveConfig(config, true)
        process.stderr.write(`${provider} key removed\n`)
        return
      }
      case undefined: case '--help': case '-h': case 'help':
        process.stderr.write(CONFIG_USAGE)
        if (command === undefined) process.exit(2)
        return
      default:
        throw new Error(`Unknown config command: ${command}`)
    }
  } catch (error: any) {
    process.stderr.write(`${error.message}\n\n${CONFIG_USAGE}`)
    process.exit(2)
  }
}
