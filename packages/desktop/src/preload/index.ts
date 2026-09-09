import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  Config,
  AIProviderOption,
  OutputRootInfo,
  JobRequest,
  JobEvent,
  JobLogLine,
  HistoryEntry,
  FfmpegStatus,
  CompressRequest,
  CompressResult,
  HighlightChatStartRequest,
  HighlightChatStartResult,
  HighlightChatSendRequest,
  HighlightChatSendResult,
  HighlightChatCutRequest,
  HighlightChatCutResult,
  HighlightChatRemoveRequest,
  HighlightChatRemoveResult,
  HighlightChatUpdateRequest,
  HighlightChatUpdateResult,
  HighlightChatLogLine,
  ChatSessionSummary,
  HighlightChatResumeResult,
  Agent,
  ScreenSource,
  ScreencastControlAction,
  ScreencastControlWindowOptions,
  ScreencastLogLine,
  ScreencastProcessRequest,
  ScreencastProcessResult,
  ScreencastProgressEvent,
  MeetingAskRequest,
  MeetingAskResult,
  MeetingControlAction,
  MeetingControlWindowOptions,
  MeetingCreateRequest,
  MeetingDetail,
  MeetingLogLine,
  MeetingPlatformSupport,
  MeetingProgressEvent,
  MeetingRegenerateRequest,
  MeetingSummary,
  MeetingTrack
} from '../shared/types'

const api = {
  /**
   * Which OS the app is running on. Read here rather than through IPC because
   * the help screen needs it on its very first render to preselect the right
   * FFmpeg install instructions.
   */
  system: {
    platform: process.platform
  },

  ffmpeg: {
    check: (): Promise<FfmpegStatus> => ipcRenderer.invoke('ffmpeg:check')
  },

  compress: {
    run: (request: CompressRequest): Promise<CompressResult> => ipcRenderer.invoke('compress:run', request)
  },

  config: {
    get: (): Promise<Config> => ipcRenderer.invoke('config:get'),
    save: (values: Partial<Config>): Promise<Config> => ipcRenderer.invoke('config:save', values),
    getConfigDir: (): Promise<string> => ipcRenderer.invoke('config:getConfigDir'),
    /** Where generated files are written today, plus the built-in default (Documentos/Mediacript) */
    getOutputRoot: (): Promise<OutputRootInfo> => ipcRenderer.invoke('config:getOutputRoot'),
    listAIProviders: (): Promise<AIProviderOption[]> => ipcRenderer.invoke('config:listAIProviders')
  },

  files: {
    pickFiles: (): Promise<string[]> => ipcRenderer.invoke('files:pick'),
    pickDirectory: (): Promise<string | null> => ipcRenderer.invoke('files:pickDirectory'),
    /** Resolves the real filesystem path for a File dragged into the window */
    getPathForFile: (file: File): string => webUtils.getPathForFile(file),
    openFile: (path: string): Promise<void> => ipcRenderer.invoke('files:openFile', path),
    revealInFolder: (path: string): Promise<void> => ipcRenderer.invoke('files:revealInFolder', path)
  },

  jobs: {
    run: (request: JobRequest): Promise<void> => ipcRenderer.invoke('jobs:run', request),
    onEvent: (callback: (event: JobEvent) => void): (() => void) => {
      const listener = (_: unknown, event: JobEvent) => callback(event)
      ipcRenderer.on('jobs:event', listener)
      return () => ipcRenderer.removeListener('jobs:event', listener)
    },
    onLog: (callback: (line: JobLogLine) => void): (() => void) => {
      const listener = (_: unknown, line: JobLogLine) => callback(line)
      ipcRenderer.on('jobs:log', listener)
      return () => ipcRenderer.removeListener('jobs:log', listener)
    }
  },

  history: {
    list: (): Promise<HistoryEntry[]> => ipcRenderer.invoke('history:list'),
    clear: (): Promise<void> => ipcRenderer.invoke('history:clear'),
    remove: (id: string): Promise<void> => ipcRenderer.invoke('history:remove', id)
  },

  highlightChat: {
    start: (request: HighlightChatStartRequest): Promise<HighlightChatStartResult> =>
      ipcRenderer.invoke('highlightChat:start', request),
    sendMessage: (request: HighlightChatSendRequest): Promise<HighlightChatSendResult> =>
      ipcRenderer.invoke('highlightChat:sendMessage', request),
    processCuts: (request: HighlightChatCutRequest): Promise<HighlightChatCutResult> =>
      ipcRenderer.invoke('highlightChat:processCuts', request),
    removeHighlight: (request: HighlightChatRemoveRequest): Promise<HighlightChatRemoveResult> =>
      ipcRenderer.invoke('highlightChat:removeHighlight', request),
    updateHighlight: (request: HighlightChatUpdateRequest): Promise<HighlightChatUpdateResult> =>
      ipcRenderer.invoke('highlightChat:updateHighlight', request),
    list: (): Promise<ChatSessionSummary[]> => ipcRenderer.invoke('highlightChat:list'),
    resume: (sessionId: string): Promise<HighlightChatResumeResult> => ipcRenderer.invoke('highlightChat:resume', sessionId),
    delete: (sessionId: string): Promise<void> => ipcRenderer.invoke('highlightChat:delete', sessionId),
    onLog: (callback: (line: HighlightChatLogLine) => void): (() => void) => {
      const listener = (_: unknown, line: HighlightChatLogLine) => callback(line)
      ipcRenderer.on('highlightChat:log', listener)
      return () => ipcRenderer.removeListener('highlightChat:log', listener)
    }
  },

  agents: {
    list: (): Promise<Agent[]> => ipcRenderer.invoke('agents:list'),
    get: (id: string): Promise<Agent | null> => ipcRenderer.invoke('agents:get', id),
    save: (input: Omit<Agent, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Agent> =>
      ipcRenderer.invoke('agents:save', input),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('agents:delete', id)
  },

  screencast: {
    listSources: (): Promise<ScreenSource[]> => ipcRenderer.invoke('screencast:listSources'),
    saveRawRecording: (buffer: ArrayBuffer): Promise<string> => ipcRenderer.invoke('screencast:saveRawRecording', buffer),
    process: (request: ScreencastProcessRequest): Promise<ScreencastProcessResult> =>
      ipcRenderer.invoke('screencast:process', request),
    onProgress: (callback: (event: ScreencastProgressEvent) => void): (() => void) => {
      const listener = (_: unknown, event: ScreencastProgressEvent) => callback(event)
      ipcRenderer.on('screencast:progress', listener)
      return () => ipcRenderer.removeListener('screencast:progress', listener)
    },
    onLog: (callback: (line: ScreencastLogLine) => void): (() => void) => {
      const listener = (_: unknown, line: ScreencastLogLine) => callback(line)
      ipcRenderer.on('screencast:log', listener)
      return () => ipcRenderer.removeListener('screencast:log', listener)
    },
    openControlWindow: (options: ScreencastControlWindowOptions): Promise<void> =>
      ipcRenderer.invoke('screencast:openControlWindow', options),
    closeControlWindow: (): Promise<void> => ipcRenderer.invoke('screencast:closeControlWindow'),
    sendControlAction: (action: ScreencastControlAction): void => {
      ipcRenderer.send('screencast:controlAction', action)
    },
    onControlAction: (callback: (action: ScreencastControlAction) => void): (() => void) => {
      const listener = (_: unknown, action: ScreencastControlAction) => callback(action)
      ipcRenderer.on('screencast:controlAction', listener)
      return () => ipcRenderer.removeListener('screencast:controlAction', listener)
    }
  },

  meetings: {
    platformSupport: (): Promise<MeetingPlatformSupport> => ipcRenderer.invoke('meetings:platformSupport'),
    create: (request: MeetingCreateRequest): Promise<string> => ipcRenderer.invoke('meetings:create', request),
    /** Fire-and-forget: audio chunks stream in for the whole meeting and there's nothing to await. */
    appendChunk: (meetingId: string, track: MeetingTrack, chunk: ArrayBuffer): void => {
      ipcRenderer.send('meetings:appendChunk', meetingId, track, chunk)
    },
    finishRecording: (meetingId: string, durationSeconds: number): Promise<void> =>
      ipcRenderer.invoke('meetings:finishRecording', meetingId, durationSeconds),
    cancel: (meetingId: string): Promise<void> => ipcRenderer.invoke('meetings:cancel', meetingId),
    process: (meetingId: string): Promise<MeetingDetail> => ipcRenderer.invoke('meetings:process', meetingId),
    list: (): Promise<MeetingSummary[]> => ipcRenderer.invoke('meetings:list'),
    get: (meetingId: string): Promise<MeetingDetail> => ipcRenderer.invoke('meetings:get', meetingId),
    delete: (meetingId: string, removeFiles: boolean): Promise<void> =>
      ipcRenderer.invoke('meetings:delete', meetingId, removeFiles),
    regenerateMinutes: (request: MeetingRegenerateRequest): Promise<MeetingDetail> =>
      ipcRenderer.invoke('meetings:regenerateMinutes', request),
    ask: (request: MeetingAskRequest): Promise<MeetingAskResult> => ipcRenderer.invoke('meetings:ask', request),
    openControlWindow: (options: MeetingControlWindowOptions): Promise<void> =>
      ipcRenderer.invoke('meetings:openControlWindow', options),
    closeControlWindow: (): Promise<void> => ipcRenderer.invoke('meetings:closeControlWindow'),
    sendControlAction: (action: MeetingControlAction): void => {
      ipcRenderer.send('meetings:controlAction', action)
    },
    onControlAction: (callback: (action: MeetingControlAction) => void): (() => void) => {
      const listener = (_: unknown, action: MeetingControlAction) => callback(action)
      ipcRenderer.on('meetings:controlAction', listener)
      return () => ipcRenderer.removeListener('meetings:controlAction', listener)
    },
    onProgress: (callback: (event: MeetingProgressEvent) => void): (() => void) => {
      const listener = (_: unknown, event: MeetingProgressEvent) => callback(event)
      ipcRenderer.on('meetings:progress', listener)
      return () => ipcRenderer.removeListener('meetings:progress', listener)
    },
    onLog: (callback: (line: MeetingLogLine) => void): (() => void) => {
      const listener = (_: unknown, line: MeetingLogLine) => callback(line)
      ipcRenderer.on('meetings:log', listener)
      return () => ipcRenderer.removeListener('meetings:log', listener)
    }
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
