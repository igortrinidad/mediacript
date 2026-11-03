import fs from 'fs'
import path from 'path'
import os from 'os'
import inquirer from 'inquirer'
import { Config } from '../types/index.js'
import { AI_PROVIDER_LABELS, type AIProviderName } from '../ai/index.js'

/** The subset of `Config` keys that hold a plain API key string (as opposed to structured settings like `highlightFallbackModels`) */
export type ApiKeyConfigKey = 'anthropicApiKey' | 'geminiApiKey' | 'openrouterApiKey' | 'openaiApiKey' | 'groqApiKey'

const AI_PROVIDER_CONFIG_KEYS: Record<AIProviderName, ApiKeyConfigKey> = {
  anthropic: 'anthropicApiKey',
  gemini: 'geminiApiKey',
  openrouter: 'openrouterApiKey',
  // Reuse the same keys already used for Whisper transcription
  openai: 'openaiApiKey',
  groq: 'groqApiKey'
}

export interface ApiKeyProviderDef {
  configKey: ApiKeyConfigKey
  label: string
}

/**
 * All providers whose key can be configured from the setup screen (ensureConfig),
 * in addition to being configurable on demand from the highlights workflow.
 * Exported so the CLI's wizard-based prompt (src/cli/configWizard.ts) can reuse
 * the same list without config/index.ts depending on any CLI-only, ESM-only code
 * — this module is shared by both the ESM and CommonJS library builds.
 */
export const ALL_API_KEY_PROVIDERS: ApiKeyProviderDef[] = [
  { configKey: 'groqApiKey', label: 'Groq (transcrição + IA de destaques)' },
  { configKey: 'openaiApiKey', label: 'OpenAI (transcrição + IA de destaques)' },
  { configKey: 'anthropicApiKey', label: 'Anthropic / Claude (IA de destaques)' },
  { configKey: 'geminiApiKey', label: 'Google Gemini (IA de destaques)' },
  { configKey: 'openrouterApiKey', label: 'OpenRouter (IA de destaques)' }
]

function hasAnyConfiguredKey(config: Config): boolean {
  return ALL_API_KEY_PROVIDERS.some((provider) => !!config[provider.configKey])
}

/**
 * Returns the configuration directory based on the operating system
 * Linux/Mac: ~/.config/ffmpeg-simple-converter
 * Windows: %APPDATA%/ffmpeg-simple-converter
 * Exported so other consumers (e.g. the desktop app) can place their own
 * files (like a run history) next to config.json, in the same shared directory.
 */
export function getConfigDir(): string {
  const homeDir = os.homedir()
  
  if (process.platform === 'win32') {
    // Windows
    const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming')
    return path.join(appData, 'ffmpeg-simple-converter')
  } else {
    // Linux/Mac
    return path.join(homeDir, '.config', 'ffmpeg-simple-converter')
  }
}

function getConfigFilePath(): string {
  return path.join(getConfigDir(), 'config.json')
}

/**
 * Loads saved configuration
 */
export function loadConfig(): Config {
  try {
    const configPath = getConfigFilePath()
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8')
      return JSON.parse(data)
    }
  } catch (error) {
    console.warn('Error loading configuration:', error)
  }
  return {}
}

/** Environment variables that override the saved transcription keys (CI, agents, one-off runs) */
export const TRANSCRIPTION_KEY_ENV: Record<'groqApiKey' | 'openaiApiKey', string> = {
  groqApiKey: 'GROQ_API_KEY',
  openaiApiKey: 'OPENAI_API_KEY'
}

/**
 * Saved configuration with `GROQ_API_KEY` / `OPENAI_API_KEY` taking precedence
 * over the file. Meant for reading only: saving its result would persist the env keys.
 */
export function loadConfigWithEnv(env: NodeJS.ProcessEnv = process.env): Config {
  const config = loadConfig()
  for (const [configKey, envName] of Object.entries(TRANSCRIPTION_KEY_ENV) as [keyof typeof TRANSCRIPTION_KEY_ENV, string][]) {
    const value = env[envName]?.trim()
    if (value) config[configKey] = value
  }
  return config
}

/** Path of the config file, for messages that tell the user where keys live */
export function getConfigFile(): string {
  return getConfigFilePath()
}

/**
 * Saves configuration
 */
export function saveConfig(config: Config, quiet = false): void {
  try {
    const configDir = getConfigDir()
    const configPath = getConfigFilePath()
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
    if (!quiet) console.log(`✓ Configuration saved in: ${configPath}`)
  } catch (error) {
    console.error('Error saving configuration:', error)
  }
}

/**
 * Prompts the user for API keys (interactive).
 *
 * First asks which provider(s) they want to configure (checkbox), then iterates
 * over just the selected ones asking for each key one at a time — instead of
 * showing every provider's input up front.
 *
 * This is the plain (non-wizard) implementation used as the default for
 * `ensureConfig` — e.g. when the library's `getConfig()` is called outside the
 * interactive CLI. The CLI itself passes `promptApiKeysWizard` (src/cli/configWizard.ts)
 * instead, which adds back/forward arrow-key navigation between steps; that
 * version isn't used here so this module stays free of CLI-only, ESM-only code.
 * @param existingConfig - Current config, used to pre-check already configured
 *   providers and prefill their key as the default (so re-running this to add
 *   one new provider doesn't blank out the ones already set).
 */
export async function promptApiKeys(existingConfig: Config = {}): Promise<Config> {
  console.log('\n🔑 Configuração de API Keys\n')

  const { selectedProviders } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedProviders',
      message: 'Quais provedores você deseja configurar agora? (espaço para marcar, enter para confirmar)',
      choices: ALL_API_KEY_PROVIDERS.map((provider) => ({
        name: `${provider.label}${existingConfig[provider.configKey] ? ' — já configurado' : ''}`,
        value: provider.configKey,
        checked: !!existingConfig[provider.configKey]
      }))
    }
  ])

  const config: Config = {}

  for (const configKey of selectedProviders as (keyof Config)[]) {
    const provider = ALL_API_KEY_PROVIDERS.find((p) => p.configKey === configKey)!

    const { apiKey } = await inquirer.prompt([
      {
        type: 'input',
        name: 'apiKey',
        message: `${provider.label} — API Key:`,
        default: existingConfig[configKey] || ''
      }
    ])

    if (apiKey.trim()) {
      config[configKey] = apiKey.trim()
    }
  }

  return config
}

/**
 * Checks if at least one API key is configured
 */
export function hasApiKey(config: Config): boolean {
  return !!(config.openaiApiKey || config.groqApiKey)
}

/**
 * Returns the configured API key for an AI provider (Anthropic/Gemini/OpenRouter),
 * prompting and persisting it on the spot if it hasn't been configured yet.
 * This lets the highlight-extraction workflow ask for the key exactly when it's
 * needed, instead of requiring it upfront alongside the transcription keys.
 */
export async function getOrPromptAIProviderApiKey(provider: AIProviderName, config: Config): Promise<string> {
  const configKey = AI_PROVIDER_CONFIG_KEYS[provider]
  const existing = config[configKey]
  if (existing) return existing

  console.log(`\n🔑 Nenhuma chave de API configurada para ${AI_PROVIDER_LABELS[provider]}.`)

  const { apiKey } = await inquirer.prompt([
    {
      type: 'input',
      name: 'apiKey',
      message: `Informe sua API Key da ${AI_PROVIDER_LABELS[provider]}:`,
      validate: (value: string) => value.trim().length > 0 || 'A API Key é obrigatória'
    }
  ])

  config[configKey] = apiKey.trim()
  saveConfig(config)
  return config[configKey] as string
}

/**
 * Gets configuration, prompting the user if necessary.
 * @param promptApiKeysImpl - Which prompting implementation to use. Defaults to
 *   the plain `promptApiKeys` above; the interactive CLI passes in
 *   `promptApiKeysWizard` (src/cli/configWizard.ts) for arrow-key navigation.
 */
export async function ensureConfig(
  promptApiKeysImpl: (existingConfig: Config) => Promise<Config> = promptApiKeys
): Promise<Config> {
  let config = loadConfig()

  // Display where API keys are being loaded from
  const configPath = getConfigFilePath()
  console.log(`\n🔑 API Keys Configuration`)
  console.log(`ℹ️  Loading from: ${configPath}`)

  // If no API keys are found
  if (!hasAnyConfiguredKey(config)) {
    console.log('⚠️  No API keys found.')

    const { shouldConfigure } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldConfigure',
        message: 'Would you like to configure your API keys now?',
        default: true
      }
    ])

    if (shouldConfigure) {
      const newConfig = await promptApiKeysImpl(config)

      if (Object.keys(newConfig).length > 0) {
        config = { ...config, ...newConfig }
        saveConfig(config)
      }
    }
  } else {
    // Display current API keys status
    console.log('✓ API Keys found:')
    for (const provider of ALL_API_KEY_PROVIDERS) {
      if (config[provider.configKey]) {
        console.log(`  • ${provider.label}: Configured`)
      }
    }

    const { updateKeys } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'updateKeys',
        message: 'Would you like to update or add new API keys?',
        default: false
      }
    ])

    if (updateKeys) {
      const newConfig = await promptApiKeysImpl(config)

      if (Object.keys(newConfig).length > 0) {
        config = { ...config, ...newConfig }
        saveConfig(config)
      }
    }
  }

  return config
}
