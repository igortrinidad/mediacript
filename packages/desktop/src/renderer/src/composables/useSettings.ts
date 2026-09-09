import { reactive, readonly } from 'vue'
import type { Config, AIProviderOption, FfmpegStatus } from '@shared/types'
import { toPlain } from '../shared/toPlain'

const state = reactive({
  config: {} as Config,
  aiProviders: [] as AIProviderOption[],
  ffmpeg: { installed: true } as FfmpegStatus,
  loaded: false
})

async function load(): Promise<void> {
  const [config, aiProviders, ffmpeg] = await Promise.all([
    window.api.config.get(),
    window.api.config.listAIProviders(),
    window.api.ffmpeg.check()
  ])
  state.config = config
  state.aiProviders = aiProviders
  state.ffmpeg = ffmpeg
  state.loaded = true
}

/**
 * Re-runs just the FFmpeg probe. The help screen calls it after the user
 * installs FFmpeg, so every screen reading this state (the home badge included)
 * flips over without a full settings reload.
 */
async function checkFfmpeg(): Promise<FfmpegStatus> {
  state.ffmpeg = await window.api.ffmpeg.check()
  return state.ffmpeg
}

async function save(values: Partial<Config>): Promise<void> {
  state.config = await window.api.config.save(toPlain(values))
  state.aiProviders = await window.api.config.listAIProviders()
}

export function useSettings() {
  return { state: readonly(state), load, save, checkFfmpeg }
}
