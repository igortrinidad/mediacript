/**
 * Non-interactive transcription command, for scripts and pipelines:
 *
 *   mediacript transcribe <file> [--words] [--language pt] [--prompt "..."]
 *     [--output out.json] [--concurrency 4] [--max-chunk-mb 10]
 *
 * Writes JSON to --output (or stdout). All progress/log output goes to
 * stderr so stdout stays parseable.
 *
 * Exit codes: 0 ok, 1 transcription failed, 2 bad arguments, 3 no API key configured.
 * Keys come from GROQ_API_KEY / OPENAI_API_KEY or the saved config (`mediacript config set`).
 */

import fs from 'fs'
import path from 'path'
import { loadConfigWithEnv } from '../config/index.js'
import { transcribeMediaWithWords } from '../transcript/words.js'
import { transcribeAudioWithSegments } from '../transcript/index.js'
import { extractTranscriptionAudio } from '../utils/ffmpegOperations.js'

/** Distinct so callers can ask the user for a key instead of treating it as a transient failure */
export const EXIT_NO_KEY = 3

interface TranscribeArgs {
  file: string
  words: boolean
  language?: string
  prompt?: string
  output?: string
  concurrency?: number
  maxChunkMB?: number
}

const USAGE = `Usage: mediacript transcribe <file> [options]

Options:
  --words               Word-level timestamps (default: segments only)
  --language <code>     Language code, e.g. pt (default: auto-detect)
  --prompt <text>       Whisper prompt (e.g. filler words to keep verbatim)
  --output, -o <path>   Write JSON here instead of stdout
  --concurrency <n>     Chunks transcribed in parallel (default: 4, --words only)
  --max-chunk-mb <n>    Max audio size per request (default: 10, --words only)

API keys: GROQ_API_KEY / OPENAI_API_KEY, or saved with \`mediacript config set groq <key>\`.
Exit codes: 0 ok, 1 transcription failed, 2 bad arguments, 3 no API key configured.
`

function parseArgs(argv: string[]): TranscribeArgs {
  const args: Partial<TranscribeArgs> = { words: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const value = () => {
      const v = argv[++i]
      if (v === undefined) throw new Error(`Missing value for ${arg}`)
      return v
    }
    switch (arg) {
      case '--words': args.words = true; break
      case '--language': case '-l': args.language = value(); break
      case '--prompt': args.prompt = value(); break
      case '--output': case '-o': args.output = value(); break
      case '--concurrency': args.concurrency = Number(value()); break
      case '--max-chunk-mb': args.maxChunkMB = Number(value()); break
      case '--help': case '-h': process.stderr.write(USAGE); process.exit(0)
      default:
        if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`)
        if (args.file) throw new Error(`Unexpected argument: ${arg}`)
        args.file = arg
    }
  }
  if (!args.file) throw new Error('Missing input file')
  return args as TranscribeArgs
}

export async function runTranscribeCommand(argv: string[]): Promise<void> {
  // Library helpers log progress with console.log / process.stdout.write; route
  // all of it to stderr so the JSON on stdout is the only thing there.
  const writeStdout = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: any, ...rest: any[]) => (process.stderr.write as any)(chunk, ...rest)) as any
  console.log = console.error
  console.info = console.error

  let args: TranscribeArgs
  try {
    args = parseArgs(argv)
  } catch (error: any) {
    process.stderr.write(`${error.message}\n\n${USAGE}`)
    process.exit(2)
  }

  const file = path.resolve(args.file)
  if (!fs.existsSync(file)) {
    process.stderr.write(`File not found: ${file}\n`)
    process.exit(2)
  }

  const config = loadConfigWithEnv()
  if (!config.groqApiKey && !config.openaiApiKey) {
    process.stderr.write(
      'No Groq/OpenAI API key configured.\n' +
      'Save one with `mediacript config set groq <key>` (get it at https://console.groq.com/keys),\n' +
      'set GROQ_API_KEY, or run `mediacript` for the interactive setup.\n'
    )
    process.exit(EXIT_NO_KEY)
  }

  const startedAt = Date.now()
  let payload: unknown

  if (args.words) {
    const result = await transcribeMediaWithWords(file, config, {
      language: args.language,
      prompt: args.prompt,
      concurrency: args.concurrency,
      maxChunkSizeMB: args.maxChunkMB,
      onProgress: (event) => {
        if (event.type === 'extracting') process.stderr.write(`extracting audio: ${path.basename(file)}\n`)
        if (event.type === 'chunked') process.stderr.write(`audio ${event.duration.toFixed(1)}s, ${event.sizeMB.toFixed(2)}MB -> ${event.chunks} chunk(s)\n`)
        if (event.type === 'chunk-done') process.stderr.write(`chunk ${event.index + 1}/${event.total} done\n`)
        if (event.type === 'recovering') process.stderr.write(`re-checking ${event.holes} stretch(es) with sound but no words\n`)
      }
    })
    payload = { file, engine: 'mediacript', elapsedSec: (Date.now() - startedAt) / 1000, ...result }
  } else {
    // Same lean audio the --words path uses, then the regular segment-level flow
    const tmpAudio = path.join(path.dirname(file), `.${path.basename(file, path.extname(file))}_transcribe_tmp.mp3`)
    try {
      await extractTranscriptionAudio(file, tmpAudio)
      const result = await transcribeAudioWithSegments(tmpAudio, config)
      if (!result) throw new Error('Failed to transcribe with all available services')
      payload = { file, engine: 'mediacript', elapsedSec: (Date.now() - startedAt) / 1000, ...result }
    } finally {
      fs.rmSync(tmpAudio, { force: true })
    }
  }

  const json = JSON.stringify(payload, null, 2)
  if (args.output) {
    const out = path.resolve(args.output)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, json, 'utf-8')
    process.stderr.write(`saved: ${out}\n`)
  } else {
    writeStdout(json + '\n')
  }
}
