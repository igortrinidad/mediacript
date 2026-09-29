#!/usr/bin/env node

import { verifyFfmpeg } from './utils/ffmpegCheck.js'
import { ensureConfig, hasApiKey, getOrPromptAIProviderApiKey } from './config/index.js'
import { promptApiKeysWizard } from './cli/configWizard.js'
import { listMediaFiles, detectFileType, createOutputFolderForFile } from './utils/fileHelpers.js'
import { convertVideo, extractAudio, convertAudio, type ConversionOptions, type ConversionPreset } from './utils/ffmpegOperations.js'
import { transcribeAudio, transcribeAudioWithSegments, saveTranscription } from './transcript/index.js'
import { saveSrtFile } from './subtitles/srt.js'
import { extractHighlightsFromTranscript } from './highlights/index.js'
import { cutHighlightClipsWithAssets } from './lib.js'
import { AI_MODELS_BY_PROVIDER, AI_PROVIDER_LABELS, getModelPrice, type AIProviderName } from './ai/index.js'
import type { TranscriptSegment, HighlightSegment } from './types/index.js'
import { runWizard, type WizardStep } from './cli/wizard.js'
import {
  createWorkflowState,
  updateStepStatus,
  nextStep,
  printWorkflowProgress,
  saveWorkflowState,
  getCurrentStep
} from './workflow/state.js'
import path from 'path'

const CUSTOM_MODEL_VALUE = '__custom__'

interface WorkflowOption {
  name: string
  value: string
  steps: string[]
  requiresType: 'video' | 'audio' | 'any'
}

const WORKFLOW_OPTIONS: WorkflowOption[] = [
  {
    name: '🎬 Convert video + Extract audio + Transcribe',
    value: 'video-full',
    steps: ['Convert video', 'Extract audio', 'Transcribe audio'],
    requiresType: 'video'
  },
  {
    name: '🎬 Extract audio from video + Transcribe',
    value: 'video-extract-transcribe',
    steps: ['Extract audio', 'Transcribe audio'],
    requiresType: 'video'
  },
  {
    name: '🎵 Convert audio + Transcribe',
    value: 'audio-convert-transcribe',
    steps: ['Convert audio', 'Transcribe audio'],
    requiresType: 'audio'
  },
  {
    name: '🎙️  Transcribe audio only',
    value: 'audio-transcribe',
    steps: ['Transcribe audio'],
    requiresType: 'audio'
  },
  {
    name: '🎬 Convert video only',
    value: 'video-convert',
    steps: ['Convert video'],
    requiresType: 'video'
  },
  {
    name: '🎵 Convert audio only',
    value: 'audio-convert',
    steps: ['Convert audio'],
    requiresType: 'audio'
  },
  {
    name: '🎵 Extract audio from video only',
    value: 'video-extract',
    steps: ['Extract audio'],
    requiresType: 'video'
  },
  {
    name: '📝 Extract subtitles with timeline (.srt) from video',
    value: 'video-subtitles',
    steps: ['Extract audio', 'Generate subtitles'],
    requiresType: 'video'
  },
  {
    name: '📝 Extract subtitles with timeline (.srt) from audio',
    value: 'audio-subtitles',
    steps: ['Generate subtitles'],
    requiresType: 'audio'
  },
  {
    name: '✨ Generate AI highlight clips from video',
    value: 'video-highlights',
    steps: ['Extract audio', 'Generate subtitles', 'Select highlights with AI', 'Cut clips'],
    requiresType: 'video'
  }
]

interface HighlightWorkflowOptions {
  provider: AIProviderName
  model: string
  apiKey: string
  prompt: string
  /** Extra seconds kept before/after each highlight so the cut doesn't land exactly on the AI-picked boundary */
  clipMarginSeconds: number
}

async function executeWorkflow(
  workflow: WorkflowOption,
  inputFile: string,
  config: any,
  conversionOptions?: ConversionOptions,
  highlightOptions?: HighlightWorkflowOptions
): Promise<void> {
  const state = createWorkflowState(inputFile, workflow.steps)
  // Highlight runs generate many files (audio, subtitles, clips, thumbnails),
  // so they get grouped into a folder named after the input file.
  const generatesHighlightClips = workflow.steps.includes('Cut clips')
  const outputDir = generatesHighlightClips
    ? createOutputFolderForFile(inputFile)
    : path.dirname(inputFile)

  console.log(`\n🚀 Starting workflow: ${workflow.name}`)
  console.log(`📁 Input file: ${path.basename(inputFile)}\n`)

  let currentFile = inputFile
  let audioFile: string | undefined
  let transcriptionFile: string | undefined
  let transcriptSegments: TranscriptSegment[] | undefined
  let selectedHighlights: HighlightSegment[] | undefined

  for (let i = 0; i < state.steps.length; i++) {
    const step = getCurrentStep(state)
    if (!step) break

    updateStepStatus(state, i, 'running')
    console.log(`\n[${ i + 1}/${state.steps.length}] ${step.name}...`)

    try {
      switch (step.name) {
        case 'Convert video':
          currentFile = await convertVideo(currentFile, conversionOptions)
          state.intermediateFiles.convertedVideo = currentFile
          updateStepStatus(state, i, 'completed', { outputFile: currentFile })
          break

        case 'Extract audio':
          audioFile = await extractAudio(currentFile, outputDir)
          state.intermediateFiles.extractedAudio = audioFile
          currentFile = audioFile
          updateStepStatus(state, i, 'completed', { outputFile: audioFile })
          break

        case 'Convert audio':
          audioFile = await convertAudio(currentFile, outputDir)
          currentFile = audioFile
          updateStepStatus(state, i, 'completed', { outputFile: audioFile })
          break

        case 'Transcribe audio':
          // Usa o arquivo de áudio atual ou o arquivo de entrada se for áudio
          const fileToTranscribe = audioFile || currentFile
          
          // Check if API key is configured
          if (!hasApiKey(config)) {
            console.log('\n⚠️  Skipping transcription - no API key configured')
            updateStepStatus(state, i, 'skipped')
            break
          }

          const transcription = await transcribeAudio(fileToTranscribe, config)
          
          if (transcription) {
            transcriptionFile = saveTranscription(fileToTranscribe, transcription)
            state.intermediateFiles.transcriptionText = transcriptionFile
            console.log(`✓ Transcrição salva: ${path.basename(transcriptionFile)}`)
            updateStepStatus(state, i, 'completed', { outputFile: transcriptionFile })
          } else {
            throw new Error('Failed to transcribe audio')
          }
          break

        case 'Generate subtitles': {
          // Usa o arquivo de áudio atual ou o arquivo de entrada se for áudio
          const fileToTranscribe = audioFile || currentFile

          if (!hasApiKey(config)) {
            console.log('\n⚠️  Skipping subtitles - no transcription API key configured (Groq/OpenAI)')
            updateStepStatus(state, i, 'skipped')
            break
          }

          const transcriptionWithSegments = await transcribeAudioWithSegments(fileToTranscribe, config)

          if (transcriptionWithSegments && transcriptionWithSegments.segments.length > 0) {
            const srtPath = saveSrtFile(transcriptionWithSegments.segments, inputFile, outputDir)
            transcriptSegments = transcriptionWithSegments.segments
            state.intermediateFiles.subtitlesFile = srtPath
            console.log(`✓ Legendas salvas: ${path.basename(srtPath)}`)
            updateStepStatus(state, i, 'completed', { outputFile: srtPath })
          } else {
            throw new Error('Failed to generate subtitles (no timeline returned by transcription)')
          }
          break
        }

        case 'Select highlights with AI': {
          if (!transcriptSegments || transcriptSegments.length === 0) {
            throw new Error('No transcript timeline available to analyze')
          }
          if (!highlightOptions) {
            throw new Error('AI highlight options were not configured')
          }

          selectedHighlights = await extractHighlightsFromTranscript(transcriptSegments, highlightOptions.prompt, {
            provider: highlightOptions.provider,
            model: highlightOptions.model,
            apiKey: highlightOptions.apiKey
          })

          if (selectedHighlights.length === 0) {
            console.log('\n⚠️  A IA não encontrou destaques relevantes para esse pedido.')
          }
          updateStepStatus(state, i, 'completed')
          break
        }

        case 'Cut clips': {
          if (!selectedHighlights || selectedHighlights.length === 0) {
            console.log('\n⚠️  Skipping clip cutting - no highlights selected')
            updateStepStatus(state, i, 'skipped')
            break
          }

          const marginSeconds = highlightOptions?.clipMarginSeconds ?? 0
          if (marginSeconds > 0) {
            console.log(`\n✂️  Aplicando margem de ${marginSeconds}s antes/depois de cada corte...`)
          }

          console.log(`\n🖼️  Gerando thumbnails de prévia para cada corte...`)
          const clipResults = await cutHighlightClipsWithAssets(inputFile, selectedHighlights, outputDir, {
            marginSeconds
          })
          state.intermediateFiles.highlightClips = clipResults.map((result) => result.clip.outputPath)
          updateStepStatus(state, i, 'completed', { outputFile: state.intermediateFiles.highlightClips.join(', ') })
          break
        }

        default:
          throw new Error(`Unknown step: ${step.name}`)
      }

      nextStep(state)
    } catch (error: any) {
      console.error(`\n❌ Error in step "${step.name}":`, error.message)
      updateStepStatus(state, i, 'failed', undefined, error.message)
      break
    }
  }

  // Save final state
  saveWorkflowState(state, outputDir)

  // Display summary
  printWorkflowProgress(state)

  // Display generated files
  if (generatesHighlightClips) {
    console.log(`\n📁 Todos os arquivos deste vídeo foram salvos em: ${outputDir}`)
  }
  console.log('\n📦 Generated files:')
  if (state.intermediateFiles.convertedVideo) {
    console.log(`  • Video: ${path.basename(state.intermediateFiles.convertedVideo)}`)
  }
  if (state.intermediateFiles.extractedAudio) {
    console.log(`  • Audio: ${path.basename(state.intermediateFiles.extractedAudio)}`)
  }
  if (state.intermediateFiles.transcriptionText) {
    console.log(`  • Transcription: ${path.basename(state.intermediateFiles.transcriptionText)}`)
  }
  if (state.intermediateFiles.subtitlesFile) {
    console.log(`  • Subtitles: ${path.basename(state.intermediateFiles.subtitlesFile)}`)
  }
  if (state.intermediateFiles.highlightClips?.length) {
    console.log(`  • Highlight clips (com thumbnails de prévia e ideias de prompt em cada pasta):`)
    for (const clipPath of state.intermediateFiles.highlightClips) {
      console.log(`      - ${path.relative(outputDir, clipPath)}`)
    }
  }
  console.log('')
}

interface MainWizardAnswers {
  selectedFile: string
  selectedWorkflow: string
  confirmNoApiKey?: boolean
  conversionPreset?: ConversionPreset
  useHwAccel?: boolean
  aiProvider?: AIProviderName
  aiModelChoice?: string
  customModel?: string
  highlightPromptText?: string
  clipMarginSeconds?: string
}

function computeMainSteps(
  answers: Partial<MainWizardAnswers>,
  ctx: { mediaFiles: ReturnType<typeof listMediaFiles>; config: any }
): WizardStep[] {
  const steps: WizardStep[] = [
    {
      id: 'selectedFile',
      type: 'list',
      message: 'Select the file:',
      choices: ctx.mediaFiles.map((f) => ({
        name: `${f.type === 'video' ? '🎬' : '🎵'} ${f.name}`,
        value: f.fullPath
      }))
    }
  ]

  if (!('selectedFile' in answers)) return steps

  const fileType = detectFileType(answers.selectedFile as string)
  const availableWorkflows = WORKFLOW_OPTIONS.filter((w) => w.requiresType === 'any' || w.requiresType === fileType)

  const workflowChoices = availableWorkflows.map((w) => {
    const requiresTranscription = w.steps.some((s) => s.includes('Transcribe') || s === 'Generate subtitles')
    const hasKey = hasApiKey(ctx.config)

    let name = w.name
    if (requiresTranscription && !hasKey) {
      name += ' ⚠️  (requires API key)'
    }

    return { name, value: w.value }
  })

  steps.push({
    id: 'selectedWorkflow',
    type: 'list',
    message: 'Select what you want to do:',
    choices: workflowChoices
  })

  if (!('selectedWorkflow' in answers)) return steps

  const workflow = availableWorkflows.find((w) => w.value === answers.selectedWorkflow)!
  const requiresTranscription = workflow.steps.some((s) => s.includes('Transcribe') || s === 'Generate subtitles')

  if (requiresTranscription && !hasApiKey(ctx.config)) {
    steps.push({
      id: 'confirmNoApiKey',
      type: 'confirm',
      message: 'This workflow includes transcription, but no API key is configured. Continue anyway?',
      default: true
    })

    if (!('confirmNoApiKey' in answers)) return steps
    if (answers.confirmNoApiKey === false) return steps
  }

  const hasVideoConversion = workflow.steps.some((s) => s === 'Convert video')
  if (hasVideoConversion) {
    steps.push({
      id: 'conversionPreset',
      type: 'list',
      message: '⚙️  Video Conversion Settings\n  Select conversion speed (faster = lower quality/size):',
      choices: [
        { name: '⚡ Ultra Fast (fastest, lowest quality)', value: 'ultrafast' },
        { name: '⚡ Super Fast (very fast, low quality)', value: 'superfast' },
        { name: '🚀 Very Fast (fast, good for large files)', value: 'veryfast' },
        { name: '⚡ Faster (faster, good quality)', value: 'faster' },
        { name: '🎯 Fast (good speed/quality balance)', value: 'fast' },
        { name: '📊 Medium (balanced - default)', value: 'medium' },
        { name: '🎨 Slow (slower, better quality)', value: 'slow' }
      ],
      default: 'medium'
    })

    if (!('conversionPreset' in answers)) return steps

    steps.push({
      id: 'useHwAccel',
      type: 'confirm',
      message: 'Try to use hardware acceleration (GPU)?',
      default: true
    })

    if (!('useHwAccel' in answers)) return steps
  }

  const hasHighlightSelection = workflow.steps.some((s) => s === 'Select highlights with AI')
  if (hasHighlightSelection) {
    steps.push({
      id: 'aiProvider',
      type: 'list',
      message: '✨ Configuração da IA de destaques (highlights)\n  Qual provedor de IA deseja usar para escolher os melhores trechos?',
      choices: (Object.keys(AI_PROVIDER_LABELS) as AIProviderName[]).map((provider) => ({
        name: AI_PROVIDER_LABELS[provider],
        value: provider
      }))
    })

    if (!('aiProvider' in answers)) return steps

    steps.push({
      id: 'aiModelChoice',
      type: 'list',
      message: 'Qual modelo deseja usar?',
      choices: [
        ...AI_MODELS_BY_PROVIDER[answers.aiProvider as AIProviderName].map((model) => {
          const price = getModelPrice(answers.aiProvider as AIProviderName, model)
          return { name: price ? `${model}  ($${price.input} in / $${price.output} out por 1M tokens)` : model, value: model }
        }),
        { name: '✏️  Outro (digitar manualmente)', value: CUSTOM_MODEL_VALUE }
      ]
    })

    if (!('aiModelChoice' in answers)) return steps

    if (answers.aiModelChoice === CUSTOM_MODEL_VALUE) {
      steps.push({
        id: 'customModel',
        type: 'input',
        message: 'Digite o id do modelo:',
        validate: (value: string) => value.trim().length > 0 || 'Informe o id do modelo'
      })

      if (!('customModel' in answers)) return steps
    }

    steps.push({
      id: 'highlightPromptText',
      type: 'input',
      message: 'Descreva o que a IA deve procurar (ex: "os 3 melhores momentos de humor"):',
      validate: (value: string) => value.trim().length > 0 || 'Descreva o que você quer destacar'
    })

    if (!('highlightPromptText' in answers)) return steps

    steps.push({
      id: 'clipMarginSeconds',
      type: 'input',
      message: 'Quantos segundos de margem antes/depois de cada corte? (evita cortar partes importantes, ex: 2):',
      default: '2',
      validate: (value: string) => {
        const n = Number(value)
        return (!isNaN(n) && n >= 0) || 'Informe um número maior ou igual a 0'
      }
    })
  }

  return steps
}

async function main() {
  console.log('🎬 FFmpeg Simple Converter - Workflow Multi-Step\n')

  // Check ffmpeg
  const ffmpegInstalled = verifyFfmpeg()
  if (!ffmpegInstalled) {
    process.exit(1)
  }

  console.log('')

  // Ensure configuration exists (even without API keys)
  const config = await ensureConfig(promptApiKeysWizard)

  // List files
  const currentDir = process.cwd()
  const mediaFiles = listMediaFiles(currentDir)

  if (mediaFiles.length === 0) {
    console.log('\n⚠️  No media files found in current directory.')
    console.log('Supported formats:')
    console.log('  • Audio: .ogg, .wav, .mp3, .m4a, .aac, .flac')
    console.log('  • Video: .mp4, .mov, .mkv, .webm, .avi\n')
    process.exit(0)
  }

  console.log(`\n📁 Found ${mediaFiles.length} media file(s)\n`)
  console.log('ℹ️  Use ← to go back to the previous step and → to redo a step you already answered.\n')

  // Walk through file/workflow/options selection as a back/forward-navigable wizard
  const answers = await runWizard<MainWizardAnswers>((current) => computeMainSteps(current, { mediaFiles, config }))

  if (answers.confirmNoApiKey === false) {
    process.exit(0)
  }

  const workflow = WORKFLOW_OPTIONS.find((w) => w.value === answers.selectedWorkflow)
  if (!workflow) {
    console.error('❌ Invalid workflow')
    process.exit(1)
  }

  const conversionOptions: ConversionOptions | undefined = answers.conversionPreset
    ? { preset: answers.conversionPreset, hwaccel: answers.useHwAccel ? 'auto' : 'none' }
    : undefined

  let highlightOptions: HighlightWorkflowOptions | undefined
  if (answers.aiProvider) {
    // Prompts (and persists) the API key for the chosen provider, right here in the flow
    const aiApiKey = await getOrPromptAIProviderApiKey(answers.aiProvider, config)

    highlightOptions = {
      provider: answers.aiProvider,
      model: (answers.customModel || answers.aiModelChoice || '').trim(),
      apiKey: aiApiKey,
      prompt: (answers.highlightPromptText || '').trim(),
      clipMarginSeconds: Number(answers.clipMarginSeconds) || 0
    }
  }

  // Execute workflow
  await executeWorkflow(workflow, answers.selectedFile, config, conversionOptions, highlightOptions)
}

// Execute
main().catch((error) => {
  console.error('\n❌ Error:', error.message)
  process.exit(1)
})
