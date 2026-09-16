import { reactive, readonly } from 'vue'

export type ModuleId =
  | 'home'
  | 'chat'
  | 'agents'
  | 'meetings'
  | 'convert'
  | 'compress'
  | 'screencast'
  | 'subtitle'
  | 'history'
  | 'settings'
  | 'help'

const state = reactive({
  active: 'home' as ModuleId,
  /** Set by History's "Continuar conversa"/"Ver conversa" — consumed once by ChatFlow to reopen that session instead of starting a new one. */
  pendingChatResumeId: null as string | null,
  /** Set by History's "Abrir reunião" — consumed once by MeetingsFlow to open that meeting instead of the list. */
  pendingMeetingId: null as string | null,
  /** Set by Screencast's "Usar em legendas" — consumed once by SubtitleFlow to start with that video already selected. */
  pendingSubtitleFile: null as string | null
})

function go(module: ModuleId): void {
  state.active = module
}

function resumeChatSession(sessionId: string): void {
  state.pendingChatResumeId = sessionId
  state.active = 'chat'
}

function consumeChatResume(): string | null {
  const id = state.pendingChatResumeId
  state.pendingChatResumeId = null
  return id
}

function openMeeting(meetingId: string): void {
  state.pendingMeetingId = meetingId
  state.active = 'meetings'
}

function consumeMeetingOpen(): string | null {
  const id = state.pendingMeetingId
  state.pendingMeetingId = null
  return id
}

function openSubtitlesFor(filePath: string): void {
  state.pendingSubtitleFile = filePath
  state.active = 'subtitle'
}

function consumeSubtitleFile(): string | null {
  const filePath = state.pendingSubtitleFile
  state.pendingSubtitleFile = null
  return filePath
}

export function useNavigation() {
  return {
    state: readonly(state),
    go,
    resumeChatSession,
    consumeChatResume,
    openMeeting,
    consumeMeetingOpen,
    openSubtitlesFor,
    consumeSubtitleFile
  }
}
