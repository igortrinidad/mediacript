import fs from 'fs'
import { captureConsole, type ConsoleLogLine } from './consoleCapture'
import { transcribeVideo } from './videoTranscriber'
import { downloadAsset } from './adProjectStore'
import { loadProject, updatePost, updateProject, videoPath } from './igProjectStore'
import { buildProfileContext, runWithFallback } from './igContext'
import type { IgAnalyzeRequest, IgPost, IgProfileAnalysis, IgProgressEvent, TranscriptionEngine } from '../../shared/types'

export interface IgTranscribeCallbacks {
  onLog?: (line: ConsoleLogLine) => void
  onProgress?: (event: Omit<IgProgressEvent, 'projectId'>) => void
}

const isVideo = (post: IgPost): boolean => post.type === 'reel' || post.type === 'video'

/**
 * Downloads each video/reel and transcribes its audio (ffmpeg → Groq/OpenAI
 * Whisper, same path as the ads analyzer). One post failing is recorded on that
 * post and does not stop the batch — an expired CDN link is the usual cause, and
 * "Atualizar perfil" fixes it. Sequential on purpose: each run hits paid APIs
 * and captures console output.
 */
export async function transcribePosts(
  projectId: string,
  postIds: string[] | undefined,
  callbacks: IgTranscribeCallbacks = {},
  engine: TranscriptionEngine = 'auto'
): Promise<{ transcribed: number; failed: number }> {
  const initial = loadProject(projectId)
  const targets = initial.posts.filter(
    (post) => isVideo(post) && (postIds?.length ? postIds.includes(post.id) : !post.transcript)
  )
  if (!targets.length) return { transcribed: 0, failed: 0 }

  const stopCapture = callbacks.onLog ? captureConsole(callbacks.onLog) : undefined
  let transcribed = 0
  let failed = 0

  try {
    for (const target of targets) {
      const project = loadProject(projectId)
      const post = project.posts.find((entry) => entry.id === target.id)
      if (!post) continue

      const report = (step: string, status: IgProgressEvent['status'], detail?: string) =>
        callbacks.onProgress?.({ postId: post.id, step, status, detail })

      try {
        if (!post.videoUrl) throw new Error('Sem link do vídeo — use "Atualizar perfil" para buscar de novo.')

        report('Baixando vídeo', 'running')
        const file = await downloadAsset(post.videoUrl, videoPath(project, post))
        report('Baixando vídeo', 'completed')

        report('Transcrevendo o áudio', 'running')
        const result = await transcribeVideo(file, {
          engine,
          workDir: project.folderPath,
          onLog: (text) => callbacks.onLog?.({ level: 'progress', text })
        })

        updatePost(projectId, post.id, {
          transcript: result.text,
          transcriptError: undefined,
          transcriptEngine: result.engine,
          transcriptSeconds: result.seconds
        })
        report('Transcrevendo o áudio', 'completed')
        transcribed++
      } catch (error) {
        const message = (error as Error)?.message || 'Falha ao transcrever'
        updatePost(projectId, post.id, { transcriptError: message })
        report('Transcrição', 'failed', message)
        failed++
      }
    }
  } finally {
    stopCapture?.()
  }

  return { transcribed, failed }
}

const ANALYSIS_SYSTEM_PROMPT = [
  'Você é um estrategista sênior de conteúdo e social media, em português do Brasil.',
  'Você recebe os dados de um perfil do Instagram (bio, números) e seus últimos posts, com legenda, métricas e, nos vídeos, a transcrição da fala.',
  'Faça um diagnóstico do perfil baseado exclusivamente nesses dados — nunca invente métricas, posts ou informações que não estejam abaixo.',
  'Curtidas, comentários e views de 16 posts são amostra pequena: aponte tendências como indícios, não como prova.',
  'Cite posts pelo rótulo (ex.: "Post 3") sempre que usar um exemplo.'
].join('\n')

const ANALYSIS_INSTRUCTIONS = `Escreva o relatório em Markdown com exatamente estas seções:

## Resumo do perfil
Quem é, para quem fala e qual a proposta de valor percebida (2–4 linhas).

## Pilares de conteúdo
Os 3–5 temas recorrentes, com quantos posts de cada e um exemplo.

## Tom de voz e estilo
Como se comunica: vocabulário, pessoa (1ª/2ª), humor, autoridade, uso de emojis, tamanho médio das legendas.

## Ganchos e estrutura
Padrões de abertura (primeira linha da legenda, primeiros segundos da fala) e de fechamento/CTA que se repetem.

## Formatos e desempenho
Compare reels, carrosséis e imagens: quais têm mais engajamento e views neste conjunto. Tabela Markdown com tipo · quantidade · média de curtidas · média de comentários · média de views.

## Frequência e consistência
Cadência de postagem e regularidade.

## O que funciona (top 3 posts)
Os 3 posts de melhor desempenho e o porquê provável.

## Oportunidades
5 oportunidades concretas de conteúdo que o perfil ainda não explora ou explora pouco.

## Sugestões de próximos posts
5 ideias de posts alinhadas ao estilo do perfil, cada uma com formato, gancho de abertura e CTA.`

export async function analyzeProfile(request: IgAnalyzeRequest): Promise<IgProfileAnalysis> {
  const project = loadProject(request.projectId)
  if (!project.posts.length) throw new Error('Este perfil não tem posts coletados para analisar.')

  const { text, provider, model } = await runWithFallback(
    [
      { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
      { role: 'user', content: `${buildProfileContext(project)}\n\n---\n\n${ANALYSIS_INSTRUCTIONS}` }
    ],
    request,
    { temperature: 0.4, maxTokens: 8000 }
  )

  const analysis: IgProfileAnalysis = { report: text, provider, model, createdAt: new Date().toISOString() }
  updateProject(request.projectId, (current) => {
    current.analysis = analysis
  })
  return analysis
}
