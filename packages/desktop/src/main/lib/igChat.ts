import { loadProject, saveProject, type PersistedIgProject } from './igProjectStore'
import { buildProfileContext, runWithFallback } from './igContext'
import type { AdChatMessage, IgChatRequest } from '../../shared/types'

/** Room for a long brainstorm — several full scripts easily pass the default. */
const MAX_REPLY_TOKENS = 6000
/** Only the tail of the conversation is replayed; the profile context is re-sent every turn anyway. */
const MAX_HISTORY_MESSAGES = 24
const MAX_REPORT_CHARS = 6000

function buildSystemPrompt(project: PersistedIgProject): string {
  const report = project.analysis?.report.trim()

  return [
    'Você é um estrategista de conteúdo e copywriter para Instagram, em português do Brasil.',
    `O usuário analisou o perfil @${project.username} e conversa com você para entender o que funciona nele e criar novos posts no mesmo estilo (ou adaptados a outro produto/objetivo que ele informar).`,
    project.description?.trim() ? `Contexto do projeto (definido pelo usuário): ${project.description.trim()}` : '',
    '',
    'Como responder:',
    '- Use os dados reais do perfil abaixo (legendas, transcrições, métricas). Nunca invente métricas ou posts. Cite os posts pelo rótulo (ex.: "Post 3").',
    '- Métricas de poucos posts são só indícios: diga isso ao concluir algo a partir delas.',
    '- Ao criar posts, replique o TOM DE VOZ e a ESTRUTURA do perfil, mas NÃO copie legendas ou falas dos posts originais.',
    '- Cada post novo deve vir neste formato: **Formato** (reel, carrossel ou imagem) · **Tema/pilar** · **Gancho** (a frase exata de abertura) · **Roteiro ou slides** (reel: cena a cena com tempo e fala; carrossel: slide a slide com o texto de cada um; imagem: texto na arte) · **Legenda completa** · **Hashtags** · **CTA** · **Por que deve funcionar**.',
    '- Se o usuário ainda não disse o tema, produto ou objetivo, proponha mesmo assim com base nos pilares do perfil e pergunte no fim o que precisa para refinar.',
    '- Seja direto, use Markdown simples e sem preâmbulo.',
    '',
    report ? `Diagnóstico já gerado para este perfil:\n${report.slice(0, MAX_REPORT_CHARS)}` : '',
    '',
    buildProfileContext(project)
  ]
    .filter((line, index, all) => line !== '' || all[index - 1] !== '')
    .join('\n')
}

export async function sendIgChatMessage(request: IgChatRequest): Promise<AdChatMessage[]> {
  const message = request.message.trim()
  if (!message) throw new Error('Escreva uma mensagem.')

  const project = loadProject(request.projectId)
  if (!project.posts.length) throw new Error('Este perfil não tem posts coletados para conversar sobre.')

  const history = project.chat ?? []
  const { text } = await runWithFallback(
    [
      { role: 'system', content: buildSystemPrompt(project) },
      ...history.slice(-MAX_HISTORY_MESSAGES).map((entry) => ({ role: entry.role, content: entry.content })),
      { role: 'user', content: message }
    ],
    request,
    { temperature: 0.7, maxTokens: MAX_REPLY_TOKENS }
  )

  // Re-load: transcripts may have landed while the model was thinking.
  const latest = loadProject(request.projectId)
  latest.chat = [
    ...(latest.chat ?? []),
    { role: 'user', content: message, createdAt: new Date().toISOString() },
    { role: 'assistant', content: text, createdAt: new Date().toISOString() }
  ]
  saveProject(latest)
  return latest.chat
}

export function clearIgChat(projectId: string): void {
  const project = loadProject(projectId)
  project.chat = []
  saveProject(project)
}
