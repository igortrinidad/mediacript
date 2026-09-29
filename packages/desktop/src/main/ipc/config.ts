import { ipcMain, nativeTheme } from 'electron'
import { getStoredConfig, saveStoredConfig, getConfigDirectory, AI_MODELS_BY_PROVIDER, AI_PROVIDER_LABELS, MODEL_PRICING } from 'mediacript'
import { getDefaultOutputRoot, getOutputRoot } from '../lib/outputPaths'
import type { AIProviderName, AIProviderOption, Config, OutputRootInfo } from '../../shared/types'

/**
 * Keeps Electron's own chrome (native dialogs, scrollbars, window background)
 * in sync with the theme the user picked in Settings › Aparência.
 */
export function applyStoredTheme(): void {
  nativeTheme.themeSource = getStoredConfig().theme ?? 'system'
}

export function registerConfigIpc(): void {
  ipcMain.handle('config:get', (): Config => {
    return getStoredConfig()
  })

  ipcMain.handle('config:save', (_event, values: Partial<Config>): Config => {
    const saved = saveStoredConfig(values)
    if (values.theme) nativeTheme.themeSource = values.theme
    return saved
  })

  ipcMain.handle('config:getConfigDir', (): string => {
    return getConfigDirectory()
  })

  ipcMain.handle('config:getOutputRoot', (): OutputRootInfo => {
    const defaultRoot = getDefaultOutputRoot()
    const root = getOutputRoot()
    return { root, defaultRoot, isDefault: root === defaultRoot }
  })

  ipcMain.handle('config:listAIProviders', (): AIProviderOption[] => {
    const config = getStoredConfig()
    const configKeyByProvider: Record<AIProviderName, keyof Config> = {
      anthropic: 'anthropicApiKey',
      gemini: 'geminiApiKey',
      openrouter: 'openrouterApiKey',
      openai: 'openaiApiKey',
      groq: 'groqApiKey'
    }

    return (Object.keys(AI_PROVIDER_LABELS) as AIProviderName[]).map((provider) => ({
      provider,
      label: AI_PROVIDER_LABELS[provider],
      models: [...AI_MODELS_BY_PROVIDER[provider]],
      pricing: { ...MODEL_PRICING[provider] },
      hasApiKey: !!config[configKeyByProvider[provider]]
    }))
  })
}
