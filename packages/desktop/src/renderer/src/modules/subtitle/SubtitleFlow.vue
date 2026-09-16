<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { FileKind, JobRequest, SubtitleOptionsInput } from '@shared/types'
import { useStepFlow } from '../../composables/useStepFlow'
import { useRetry } from '../../composables/useRetry'
import { useNavigation } from '../../composables/useNavigation'
import FileDropzone from '../../shared/components/FileDropzone.vue'
import SubtitleActionStep from './steps/SubtitleActionStep.vue'
import SubtitleOptionsStep from './steps/SubtitleOptionsStep.vue'
import ProcessingPanel from '../../shared/components/ProcessingPanel.vue'
import { actionFor, operationFor, type SubtitleAction } from './actions'

const retry = useRetry()
const nav = useNavigation()

const stepOrder = computed(() => ['action', 'files', 'options', 'processing'])
const flow = useStepFlow(stepOrder)

const action = ref<SubtitleAction>('apply')
const filePaths = ref<string[]>([])
const fileKind = ref<FileKind>('video')
const subtitleOptions = ref<SubtitleOptionsInput>({ mode: 'hardsub' })
// Set when another module (Screencast) hands us a video — the action is still
// asked, but the dropzone step is skipped since the file is already chosen.
const preselectedFile = ref<string | null>(null)

// Only applying a subtitle needs the hardsub/softsub picker — the two
// extractions go straight from the files step to processing.
const needsOptionsStep = computed(() => action.value === 'apply')

const FILE_INTRO: Record<SubtitleAction, string> = {
  apply: 'Selecione 1 vídeo para gerar e aplicar a legenda.',
  srt: 'Selecione os arquivos de vídeo ou áudio para extrair a legenda (.srt).',
  text: 'Selecione os arquivos de vídeo ou áudio para extrair o texto da legenda.'
}

onMounted(() => {
  const handedFile = nav.consumeSubtitleFile()
  if (handedFile) {
    preselectedFile.value = handedFile
    filePaths.value = [handedFile]
    fileKind.value = 'video'
    return
  }

  const pending = retry.consumeRetry()
  if (!pending) return

  const previous = actionFor(pending.operation)
  if (!previous) return

  action.value = previous.action
  fileKind.value = previous.kind
  filePaths.value = [pending.filePath]
  if (pending.subtitleOptions) subtitleOptions.value = { ...pending.subtitleOptions }
  flow.goTo(needsOptionsStep.value ? 'options' : 'processing')
})

function onActionSelected(selected: SubtitleAction): void {
  action.value = selected
  if (preselectedFile.value) {
    flow.goTo(needsOptionsStep.value ? 'options' : 'processing')
    return
  }
  flow.next()
}

function fileName(path: string): string {
  return path.split(/[/\\]/).pop() || path
}

function onFilesSelected(paths: string[], kind: FileKind): void {
  filePaths.value = paths
  fileKind.value = kind
  flow.goTo(needsOptionsStep.value ? 'options' : 'processing')
}

const jobRequest = computed<JobRequest>(() => ({
  operation: operationFor(action.value, fileKind.value)!,
  filePaths: filePaths.value,
  subtitleOptions: needsOptionsStep.value ? { ...subtitleOptions.value } : undefined
}))

function resetFlow(): void {
  preselectedFile.value = null
  filePaths.value = []
  fileKind.value = 'video'
  subtitleOptions.value = { mode: 'hardsub' }
  flow.reset()
}
</script>

<template>
  <div class="subtitle-flow">
    <template v-if="flow.currentStep.value === 'action'">
      <p v-if="preselectedFile" class="preselected-file" :title="preselectedFile">
        🎬 Arquivo selecionado: <strong>{{ fileName(preselectedFile) }}</strong>
      </p>
      <SubtitleActionStep @continue="onActionSelected" />
    </template>

    <template v-else-if="flow.currentStep.value === 'files'">
      <p class="step-intro">{{ FILE_INTRO[action] }}</p>
      <FileDropzone
        :key="action"
        :max-files="action === 'apply' ? 1 : undefined"
        :only-kind="action === 'apply' ? 'video' : undefined"
        @continue="onFilesSelected"
      />
    </template>

    <SubtitleOptionsStep
      v-else-if="flow.currentStep.value === 'options'"
      v-model="subtitleOptions"
      @continue="flow.next()"
    />
    <ProcessingPanel v-else-if="flow.currentStep.value === 'processing'" :request="jobRequest" />

    <button v-if="flow.currentStep.value === 'processing'" class="btn new-run-btn" @click="resetFlow">
      + Nova legenda
    </button>
  </div>
</template>

<style scoped>
.subtitle-flow {
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.step-intro {
  color: var(--text-muted);
  font-size: 13px;
  margin: 0 0 16px;
  text-align: center;
}

.preselected-file {
  color: var(--text-muted);
  font-size: 13px;
  margin: 0;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.new-run-btn {
  align-self: center;
}
</style>
