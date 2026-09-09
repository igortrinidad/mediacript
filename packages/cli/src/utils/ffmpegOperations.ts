import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import type { ExportFormatDefinition, FramingMode, QualityPresetDefinition } from './exportFormats.js'

export type ConversionPreset = 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow' | 'slower' | 'veryslow'
export type HardwareAcceleration = 'none' | 'auto' | 'nvenc' | 'qsv' | 'vaapi'

export interface ConversionOptions {
  /** 
   * Encoding speed preset (faster = lower quality/size, slower = better quality/size)
   * Default: 'medium'
   * For large files, use 'faster', 'veryfast', or 'superfast' for speed
   */
  preset?: ConversionPreset
  
  /** 
   * Quality (CRF - Constant Rate Factor)
   * Lower = better quality/larger file (18-28 recommended, 23 is default)
   * Higher values = faster encoding
   */
  crf?: number
  
  /** 
   * Hardware acceleration (much faster if available)
   * 'auto' - tries to detect and use available hardware
   * 'nvenc' - NVIDIA GPU (very fast)
   * 'qsv' - Intel Quick Sync
   * 'vaapi' - Intel/AMD GPU on Linux
   */
  hwaccel?: HardwareAcceleration
  
  /** Maximum number of threads to use (default: auto) */
  threads?: number
  
  /**
   * Custom ffmpeg parameters to pass to the conversion command
   * When provided, ONLY these parameters will be used — all other options
   * (codec, preset, crf, hwaccel, audio encoding, etc.) are completely ignored.
   * The final command will be: ffmpeg -i <input> ...customParams... -y <output>
   * 
   * Example: ['-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac']
   * 
   * Use this for complete control over the ffmpeg command.
   */
  customParams?: string[]

  /**
   * 
   */
  outputDir?: string | undefined

  /**
   * Custom output file name (without extension).
   * Example: 'my-video-optimized'
   * If not provided, defaults to '<inputName>_converted'
   */
  outputName?: string
}

/**
 * Generates unique output file path
 */
export function uniqueOutputPath(dir: string, baseName: string, extWithDot: string): string {
  let candidate = path.join(dir, `${baseName}${extWithDot}`)
  if (!fs.existsSync(candidate)) return candidate

  for (let i = 1; i < 10_000; i++) {
    candidate = path.join(dir, `${baseName}_${i}${extWithDot}`)
    if (!fs.existsSync(candidate)) return candidate
  }

  throw new Error('Could not generate a unique output name.')
}

/**
 * Executes an ffmpeg command
 */
export function runFfmpegCommand(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe']
    })

    // FFmpeg writes a progress update to stderr multiple times per second for the
    // whole run. Only the tail is kept (for the error message on failure) — a long
    // conversion (e.g. a large/long input file) can otherwise accumulate megabytes
    // of text here, and previously the code re-split that ENTIRE growing string on
    // every single chunk just to find the latest line, which is O(n^2) in the
    // conversion's duration and could exhaust memory/CPU on long-running jobs.
    const STDERR_TAIL_LIMIT = 8000
    let stderrTail = ''
    let carryOverLine = ''

    // Nothing we need from stdout, but the pipe still needs to be drained —
    // leaving it unconsumed can apply backpressure and stall ffmpeg once the
    // OS pipe buffer fills up.
    ffmpeg.stdout.on('data', () => {})

    ffmpeg.stderr.on('data', (data) => {
      const chunk = data.toString()
      stderrTail = (stderrTail + chunk).slice(-STDERR_TAIL_LIMIT)

      // Only the new chunk (plus whatever partial line carried over from the
      // previous one) needs scanning for the latest progress line.
      const lines = (carryOverLine + chunk).split(/\r|\n/)
      carryOverLine = lines[lines.length - 1]

      const lastProgressLine = [...lines].reverse().find((line) => line.includes('time='))
      if (lastProgressLine) {
        process.stdout.write(`\r${lastProgressLine.trim()}`)
      }
    })

    ffmpeg.on('close', (code) => {
      process.stdout.write('\r')
      if (code === 0) {
        resolve('')
      } else {
        reject(new Error(`FFmpeg failed with code ${code}\n${stderrTail}`))
      }
    })

    ffmpeg.on('error', (err) => {
      reject(err)
    })
  })
}

/**
 * Detects available hardware acceleration
 */
async function detectHardwareAcceleration(): Promise<HardwareAcceleration> {
  try {
    // Try to get ffmpeg encoders
    const { execSync } = await import('child_process')
    const encoders = execSync('ffmpeg -encoders 2>/dev/null || true', { encoding: 'utf-8' })
    
    // Check for NVIDIA NVENC (also verify CUDA is available)
    if (encoders.includes('h264_nvenc')) {
      try {
        // Test if CUDA actually works with a quick probe
        execSync('ffmpeg -hide_banner -hwaccels 2>/dev/null | grep -q cuda', { encoding: 'utf-8' })
        return 'nvenc'
      } catch {
        // NVENC encoder exists but CUDA not available
      }
    }
    
    // Check for Intel Quick Sync
    if (encoders.includes('h264_qsv')) {
      return 'qsv'
    }
    
    // Check for VAAPI (Linux Intel/AMD)
    if (encoders.includes('h264_vaapi')) {
      return 'vaapi'
    }
  } catch (error) {
    // Ignore errors
  }
  
  return 'none'
}

/**
 * Checks if an error is related to hardware acceleration failure
 */
function isHardwareAccelerationError(error: Error): boolean {
  const errorMsg = error.message.toLowerCase()
  return (
    errorMsg.includes('cuda') ||
    errorMsg.includes('nvenc') ||
    errorMsg.includes('qsv') ||
    errorMsg.includes('vaapi') ||
    errorMsg.includes('device') ||
    errorMsg.includes('hwaccel') ||
    errorMsg.includes('hardware')
  )
}

/**
 * Converts video to performant format (H.264/AAC)
 */
export async function convertVideo(
  inputPath: string,
  options?: ConversionOptions
): Promise<string> {
  const dir = options?.outputDir || path.dirname(inputPath)
  const baseName = options?.outputName || `${path.basename(inputPath, path.extname(inputPath))}_converted`
  const outputPath = uniqueOutputPath(dir, baseName, '.mp4')

  // Default options
  const preset = options?.preset || 'medium'
  const crf = options?.crf || 23
  const hwaccel = options?.hwaccel || 'none'
  const threads = options?.threads

  console.log(`\n🎬 Converting video to performant format...`)
  if (!options?.customParams?.length) {
    console.log(`   Preset: ${preset} | CRF: ${crf} | HW Accel: ${hwaccel}`)
  }

  let detectedHwaccel = hwaccel
  
  if (hwaccel === 'auto') {
    detectedHwaccel = await detectHardwareAcceleration()
    console.log(`   Detected hardware: ${detectedHwaccel}`)
  }

  // Try with hardware acceleration first, fallback to CPU if it fails
  try {
    return await convertVideoInternal(inputPath, outputPath, preset, crf, detectedHwaccel, threads, options?.customParams)
  } catch (error) {
    // If hardware acceleration failed, retry with CPU
    if (detectedHwaccel !== 'none' && isHardwareAccelerationError(error as Error)) {
      console.log(`\n⚠️  Hardware acceleration failed, falling back to CPU...`)
      return await convertVideoInternal(inputPath, outputPath, preset, crf, 'none', threads, options?.customParams)
    }
    throw error
  }
}

/**
 * Internal function that performs the actual conversion
 */
async function convertVideoInternal(
  inputPath: string,
  outputPath: string,
  preset: ConversionPreset,
  crf: number,
  hwaccel: HardwareAcceleration,
  threads?: number,
  customParams?: string[]
): Promise<string> {
  const args: string[] = []

  // If custom params are provided, use ONLY them — no other parameters
  if (customParams && customParams.length > 0) {
    args.push('-i', inputPath)
    args.push(...customParams)
    args.push('-y', outputPath)

    console.log(args)

    await runFfmpegCommand(args)
    console.log(`\n✓ Video converted: ${path.basename(outputPath)}`)
    return outputPath
  }

  // Default parameters workflow (when no custom params provided)
  
  // Hardware acceleration setup
  let videoCodec = 'libx264'

  // Configure hardware acceleration
  if (hwaccel === 'nvenc') {
    args.push('-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda')
    videoCodec = 'h264_nvenc'
  } else if (hwaccel === 'qsv') {
    args.push('-hwaccel', 'qsv')
    videoCodec = 'h264_qsv'
  } else if (hwaccel === 'vaapi') {
    args.push('-hwaccel', 'vaapi', '-hwaccel_device', '/dev/dri/renderD128', '-hwaccel_output_format', 'vaapi')
    videoCodec = 'h264_vaapi'
  }

  // Input file
  args.push('-i', inputPath)

  // Video encoding
  args.push('-c:v', videoCodec)

  // Preset (not available for some hardware encoders)
  if (videoCodec === 'libx264') {
    args.push('-preset', preset)
    args.push('-crf', String(crf))
  } else if (videoCodec === 'h264_nvenc') {
    // NVENC presets
    const nvencPresetMap: Record<string, string> = {
      'ultrafast': 'p1',
      'superfast': 'p2',
      'veryfast': 'p3',
      'faster': 'p4',
      'fast': 'p5',
      'medium': 'p6',
      'slow': 'p7'
    }
    args.push('-preset', nvencPresetMap[preset] || 'p6')
    args.push('-cq', String(crf))
  } else if (videoCodec === 'h264_qsv') {
    args.push('-preset', preset)
    args.push('-global_quality', String(crf))
  } else if (videoCodec === 'h264_vaapi') {
    args.push('-qp', String(crf))
  }

  // Force standard 8-bit 4:2:0 chroma regardless of the source's color depth.
  // Drone/HDR sources (e.g. DJI footage) are often 10-bit (yuv420p10le, HEVC
  // "Main 10"); without this, ffmpeg carries that depth into the H.264 output
  // as a "High 10" profile, which most software (Windows Media Player/Movies &
  // TV, many TVs and phones) can't decode — even though the file itself is a
  // perfectly valid H.264 stream (e.g. VLC or ffplay can still play it fine).
  args.push('-pix_fmt', 'yuv420p')

  // Threads
  if (threads) {
    args.push('-threads', String(threads))
  }

  // Audio encoding
  args.push('-c:a', 'aac', '-b:a', '128k')

  // MP4 optimizations
  args.push('-movflags', '+faststart')

  // Overwrite output
  args.push('-y', outputPath)

  await runFfmpegCommand(args)
  console.log(`\n✓ Video converted: ${path.basename(outputPath)}`)
  return outputPath
}

/**
 * Where `extractAudio` would write the FIRST audio extraction for a media
 * file (before any `_1`, `_2`, ... de-duplication kicks in) — lets callers
 * that want a stable, reusable audio file (rather than a fresh numbered one
 * every run) check whether it already exists.
 */
export function getExtractedAudioPath(mediaFilePath: string, outputDir?: string): string {
  const dir = outputDir || path.dirname(mediaFilePath)
  const baseName = path.basename(mediaFilePath, path.extname(mediaFilePath))
  return path.join(dir, `${baseName}_audio.mp3`)
}

/**
 * Extracts audio from a video
 */
export async function extractAudio(
  inputPath: string,
  outputDir?: string
): Promise<string> {
  const dir = outputDir || path.dirname(inputPath)
  const baseName = path.basename(inputPath, path.extname(inputPath))
  const outputPath = uniqueOutputPath(dir, `${baseName}_audio`, '.mp3')

  console.log(`\n🎵 Extracting audio from video...`)

  const args = [
    '-i', inputPath,
    '-vn',
    '-acodec', 'libmp3lame',
    '-b:a', '192k',
    '-y',
    outputPath
  ]

  await runFfmpegCommand(args)
  console.log(`\n✓ Audio extracted: ${path.basename(outputPath)}`)
  return outputPath
}

/**
 * Converts audio to performant format
 */
export async function convertAudio(
  inputPath: string,
  outputDir?: string
): Promise<string> {
  const dir = outputDir || path.dirname(inputPath)
  const baseName = path.basename(inputPath, path.extname(inputPath))
  const outputPath = uniqueOutputPath(dir, `${baseName}_converted`, '.mp3')

  console.log(`\n🎵 Converting audio to MP3...`)

  const args = [
    '-i', inputPath,
    '-acodec', 'libmp3lame',
    '-b:a', '192k',
    '-y',
    outputPath
  ]

  await runFfmpegCommand(args)
  console.log(`\n✓ Audio converted: ${path.basename(outputPath)}`)
  return outputPath
}

function probeDuration(inputPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      inputPath
    ])

    let output = ''
    ffprobe.stdout.on('data', (data) => {
      output += data.toString()
    })

    ffprobe.on('close', (code) => {
      if (code === 0) {
        const duration = parseFloat(output.trim())
        resolve(duration)
      } else {
        reject(new Error(`Failed to get audio duration, code ${code}`))
      }
    })

    ffprobe.on('error', (err) => {
      reject(err)
    })
  })
}

/**
 * Determines duration by decoding the whole file and reading the last
 * `time=` progress update ffmpeg prints to stderr. Slower than probing the
 * container header, but works when that header has no duration to read —
 * notably WebM files written by the browser `MediaRecorder` API, which never
 * seeks back to finalize a duration and leave ffprobe reporting `N/A`.
 */
function decodeDuration(inputPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', ['-i', inputPath, '-f', 'null', '-'])

    let stderr = ''
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    ffmpeg.on('close', () => {
      const matches = [...stderr.matchAll(/time=(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/g)]
      const last = matches[matches.length - 1]
      if (!last) {
        reject(new Error(`Could not determine duration for ${inputPath}`))
        return
      }
      const [, hours, minutes, seconds] = last
      resolve(Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds))
    })

    ffmpeg.on('error', (err) => {
      reject(err)
    })
  })
}

/**
 * Gets the duration of an audio file in seconds. Falls back to decoding the
 * file when the container has no duration metadata to probe.
 */
export async function getAudioDuration(inputPath: string): Promise<number> {
  const probed = await probeDuration(inputPath)
  if (probed > 0) {
    return probed
  }
  return decodeDuration(inputPath)
}

/**
 * Splits an audio file into chunks of specified size (in MB)
 * Returns an array of chunk file paths
 */
export async function splitAudioIntoChunks(
  inputPath: string,
  maxSizeMB: number = 10
): Promise<string[]> {
  const dir = path.dirname(inputPath)
  const baseName = path.basename(inputPath, path.extname(inputPath))
  const ext = path.extname(inputPath).toLowerCase()
  
  // Create temp directory for chunks
  const tempDir = path.join(dir, `${baseName}_chunks_temp`)
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }

  console.log(`\n✂️  Splitting audio into chunks of max ${maxSizeMB}MB...`)

  // Get total duration
  const totalDuration = await getAudioDuration(inputPath)
  
  // Get file size
  const stats = fs.statSync(inputPath)
  const fileSizeMB = stats.size / (1024 * 1024)
  
  // Calculate approximate chunk duration to stay under maxSizeMB
  // We use 90% of target size to have a safety margin
  const targetSizeMB = maxSizeMB * 0.9
  const chunkDuration = Math.floor((totalDuration * targetSizeMB) / fileSizeMB)
  
  console.log(`📊 Total duration: ${Math.round(totalDuration)}s, splitting into ~${Math.ceil(totalDuration / chunkDuration)} chunks`)

  // Output pattern for chunks
  const outputPattern = path.join(tempDir, `chunk_%03d${ext}`)

  const args = [
    '-i', inputPath,
    '-f', 'segment',
    '-segment_time', chunkDuration.toString(),
    '-c', 'copy',
    '-reset_timestamps', '1',
    outputPattern
  ]

  await runFfmpegCommand(args)

  // Get all chunk files
  const chunkFiles = fs.readdirSync(tempDir)
    .filter(f => f.startsWith('chunk_') && f.endsWith(ext))
    .sort()
    .map(f => path.join(tempDir, f))

  console.log(`✓ Created ${chunkFiles.length} chunks`)
  
  return chunkFiles
}

/**
 * Cuts a single clip out of a video between `start` and `end` (in seconds).
 * Re-encodes (rather than stream-copying) so the cut lands exactly on the
 * requested boundaries instead of snapping to the nearest keyframe.
 */
export async function cutVideoSegment(
  inputPath: string,
  start: number,
  end: number,
  options?: { outputDir?: string; outputName?: string }
): Promise<string> {
  if (!(end > start)) {
    throw new Error(`Invalid cut range: start=${start} end=${end}`)
  }

  const dir = options?.outputDir || path.dirname(inputPath)
  const baseName = options?.outputName || `${path.basename(inputPath, path.extname(inputPath))}_cut`
  const outputPath = uniqueOutputPath(dir, baseName, '.mp4')
  const duration = end - start

  console.log(`\n✂️  Cutting clip ${start.toFixed(1)}s -> ${end.toFixed(1)}s...`)

  const args = [
    '-ss', start.toString(),
    '-i', inputPath,
    '-t', duration.toString(),
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '20',
    // Force standard 8-bit 4:2:0 chroma — a 10-bit source (common in drone/HDR
    // footage) would otherwise produce a "High 10" H.264 profile that most
    // players (Windows Media Player/Movies & TV, many TVs/phones) can't open.
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    '-y',
    outputPath
  ]

  await runFfmpegCommand(args)
  console.log(`✓ Clip generated: ${path.basename(outputPath)}`)
  return outputPath
}

/**
 * Cuts multiple clips out of a video, one ffmpeg pass per segment.
 */
export async function cutVideoSegments(
  inputPath: string,
  segments: Array<{ start: number; end: number; outputName?: string }>,
  outputDir?: string
): Promise<string[]> {
  const outputPaths: string[] = []

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    console.log(`\n[${i + 1}/${segments.length}] Cutting segment...`)
    const outputPath = await cutVideoSegment(inputPath, segment.start, segment.end, {
      outputDir,
      outputName: segment.outputName
    })
    outputPaths.push(outputPath)
  }

  return outputPaths
}

/**
 * Extracts a single frame from a video at the given timestamp and saves it as a JPEG.
 */
export async function extractVideoFrame(
  inputPath: string,
  timestampSeconds: number,
  outputPath: string
): Promise<string> {
  const args = [
    '-ss', timestampSeconds.toString(),
    '-i', inputPath,
    '-frames:v', '1',
    '-q:v', '2',
    '-y',
    outputPath
  ]

  await runFfmpegCommand(args)
  return outputPath
}

/**
 * Probes a video's frame dimensions via ffprobe. Used to decide whether
 * exporting to a target aspect ratio needs an actual crop/pad re-encode, or
 * whether the source already matches (cheap remux instead).
 */
export function getVideoDimensions(inputPath: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'csv=s=x:p=0',
      inputPath
    ])

    let output = ''
    ffprobe.stdout.on('data', (data) => {
      output += data.toString()
    })

    ffprobe.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Failed to probe video dimensions, code ${code}`))
        return
      }
      const [widthStr, heightStr] = output.trim().split('x')
      const width = parseInt(widthStr, 10)
      const height = parseInt(heightStr, 10)
      if (!width || !height) {
        reject(new Error(`Could not parse video dimensions from ffprobe output: "${output.trim()}"`))
        return
      }
      resolve({ width, height })
    })

    ffprobe.on('error', (err) => {
      reject(err)
    })
  })
}

/**
 * Re-frames a clip into a target export format's aspect ratio (e.g. 9:16 for
 * Reels/TikTok/Shorts), applying a quality preset.
 *
 * If the source already matches the target aspect ratio (within 1%), this
 * just remuxes with `-c copy` — zero quality loss, and the `quality` preset is
 * ignored entirely, since there's nothing to re-encode. Otherwise, the frame
 * has to be physically cropped or padded, so it re-encodes using the quality
 * preset's preset/crf ("original quality" then means a near-lossless re-encode,
 * not a literal copy — the pixels themselves are changing).
 */
export async function exportClipToFormat(
  inputPath: string,
  format: ExportFormatDefinition,
  quality: QualityPresetDefinition,
  framing: FramingMode,
  options?: { outputDir?: string; outputName?: string }
): Promise<string> {
  const dir = options?.outputDir || path.dirname(inputPath)
  const baseName = options?.outputName || path.basename(inputPath, path.extname(inputPath))
  const outputPath = uniqueOutputPath(dir, `${baseName}_${format.id}`, '.mp4')

  const { width: srcWidth, height: srcHeight } = await getVideoDimensions(inputPath)
  const sourceAspect = srcWidth / srcHeight
  const targetAspect = format.width / format.height
  const aspectMatches = Math.abs(sourceAspect - targetAspect) / targetAspect < 0.01

  console.log(`\n🖼️  Exportando para ${format.label} (${format.width}x${format.height})...`)

  if (aspectMatches) {
    console.log('   Proporção já compatível — remux sem perdas (-c copy)')
    await runFfmpegCommand(['-i', inputPath, '-c', 'copy', '-movflags', '+faststart', '-y', outputPath])
    console.log(`✓ Exportado: ${path.basename(outputPath)}`)
    return outputPath
  }

  const { width: w, height: h } = format
  const args = ['-i', inputPath]

  if (framing === 'crop') {
    args.push('-vf', `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`)
  } else {
    args.push(
      '-filter_complex',
      `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},gblur=sigma=20[bg];` +
        `[0:v]scale=${w}:${h}:force_original_aspect_ratio=decrease[fg];` +
        `[bg][fg]overlay=(W-w)/2:(H-h)/2[v]`,
      '-map', '[v]',
      '-map', '0:a?'
    )
  }

  args.push(
    '-c:v', 'libx264',
    '-preset', quality.preset,
    '-crf', String(quality.crf),
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    '-y',
    outputPath
  )

  await runFfmpegCommand(args)
  console.log(`✓ Exportado: ${path.basename(outputPath)}`)
  return outputPath
}

export interface CompressToTargetSizeOptions {
  /** libx264 preset. Default: 'slow' (best quality for a given bitrate budget) */
  preset?: ConversionPreset
  /** CRF cap used alongside -maxrate/-bufsize. Default: 26 */
  crf?: number
  /** Audio bitrate in kbps, subtracted from the total budget before sizing video bitrate. Default: 128 */
  audioBitrateKbps?: number
  /** Downmix audio to mono to save bitrate budget. Default: false */
  monoAudio?: boolean
  /** Drop the audio track entirely (`-an`), freeing its share of the budget. Default: false */
  dropAudio?: boolean
  /** Optional max output height (keeps aspect ratio, even width). e.g. 720 */
  maxHeight?: number
  outputDir?: string
  outputName?: string
}

/**
 * Gets the duration of a video file in seconds (ffprobe `format=duration`,
 * codec-agnostic — same probe as `getAudioDuration`, kept as a separate
 * export so call sites read correctly regardless of media type).
 */
export function getVideoDuration(inputPath: string): Promise<number> {
  return getAudioDuration(inputPath)
}

/**
 * Compresses a video to fit under a target file size, by computing the
 * bitrate budget the file's duration allows (`targetSizeMB * 8192 / duration`,
 * same formula as `size(KiB) * 8 = duration(s) * bitrate(kbps)`) and capping
 * the video bitrate with `-maxrate`/`-bufsize` while `-crf` keeps quality from
 * exceeding what's actually needed. This is single-pass rate-capping (not true
 * 2-pass), so the result lands close to — usually at or under — the target,
 * not exact.
 */
export async function compressVideoToTargetSize(
  inputPath: string,
  targetSizeMB: number,
  options?: CompressToTargetSizeOptions
): Promise<string> {
  if (!(targetSizeMB > 0)) {
    throw new Error(`Invalid target size: ${targetSizeMB}MB`)
  }

  const dir = options?.outputDir || path.dirname(inputPath)
  const baseName = options?.outputName || `${path.basename(inputPath, path.extname(inputPath))}_compressed`
  const outputPath = uniqueOutputPath(dir, baseName, '.mp4')

  const preset = options?.preset || 'slow'
  const crf = options?.crf ?? 26
  const dropAudio = options?.dropAudio ?? false
  const audioBitrateKbps = dropAudio ? 0 : options?.audioBitrateKbps ?? 128
  const monoAudio = options?.monoAudio ?? false

  const duration = await getVideoDuration(inputPath)
  if (!(duration > 0)) {
    throw new Error(`Could not determine video duration for ${inputPath}`)
  }

  const totalBitrateKbps = Math.floor((targetSizeMB * 8192) / duration)
  const videoBitrateKbps = totalBitrateKbps - audioBitrateKbps

  if (videoBitrateKbps <= 0) {
    throw new Error(
      `Target size ${targetSizeMB}MB is too small for a ${duration.toFixed(1)}s video once audio (${audioBitrateKbps}kbps) is reserved.`
    )
  }

  console.log(`\n📦 Comprimindo vídeo para até ${targetSizeMB}MB (${duration.toFixed(1)}s, ~${videoBitrateKbps}kbps de vídeo)...`)

  const args = ['-i', inputPath]

  if (options?.maxHeight) {
    // `min(h,ih)` makes this a cap rather than a resize — a source already
    // below the limit is left alone instead of being upscaled into wasted
    // bitrate. `trunc(../2)*2` and the `-2` width keep both dimensions even
    // (yuv420p requires it), and lanczos preserves far more edge detail than
    // the default bicubic on text-heavy footage like a screen recording.
    // The `\,` escape is needed because the filtergraph parser splits on commas.
    args.push('-vf', `scale=-2:trunc(min(${options.maxHeight}\\,ih)/2)*2:flags=lanczos`)
  }

  args.push(
    '-c:v', 'libx264',
    '-preset', preset,
    '-crf', String(crf),
    '-maxrate', `${videoBitrateKbps}k`,
    '-bufsize', `${videoBitrateKbps * 2}k`,
    '-pix_fmt', 'yuv420p',
    // High/4.1 is the widest profile mobile players (and WhatsApp's own
    // re-encode) accept without falling back to software decoding, and a 2s
    // GOP keeps scrubbing responsive without costing much bitrate.
    '-profile:v', 'high',
    '-level', '4.1',
    '-g', '60'
  )

  if (dropAudio) {
    args.push('-an')
  } else {
    args.push('-c:a', 'aac', '-b:a', `${audioBitrateKbps}k`)
    if (monoAudio) {
      args.push('-ac', '1')
    }
  }

  args.push('-movflags', '+faststart', '-y', outputPath)

  await runFfmpegCommand(args)
  console.log(`✓ Compressão concluída: ${path.basename(outputPath)}`)
  return outputPath
}

/**
 * Deletes a directory and all its contents
 */
export function deleteDirectory(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true })
  }
}

export type SubtitleMode = 'hardsub' | 'softsub'

/**
 * Escapes a filesystem path for use as the `filename` value of ffmpeg's
 * `subtitles` video filter (e.g. `-vf "subtitles=<escaped path>"`).
 *
 * The filter parses its argument through the filtergraph syntax (where `:`
 * separates option key=value pairs and `,`/`;` separate filters), so a
 * Windows path's drive-letter colon and backslashes need escaping. Converting
 * backslashes to forward slashes first sidesteps backslash-escaping
 * ambiguity entirely (ffmpeg/Windows both accept `/` in paths).
 *
 * Deliberately does NOT attempt to escape a literal `'` in the path — the
 * `subtitles` filter re-parses its filename through a second, internal
 * option parser that mishandles an escaped quote no matter the escaping
 * convention used, silently corrupting the filename. Callers must ensure the
 * path they pass here never contains a `'` (e.g. by staging the file at a
 * controlled temp path first — see `applyHardSubtitles`).
 */
export function escapeSubtitlesFilterPath(filePath: string): string {
  const forwardSlashed = filePath.replace(/\\/g, '/')
  const colonEscaped = forwardSlashed.replace(/:/g, '\\:')
  return `'${colonEscaped}'`
}

/**
 * Burns subtitles into the video frames (hardsub) using ffmpeg's libass-based
 * `subtitles` filter. Always re-encodes video (and audio, to sidestep any
 * source audio codec incompatibility) since the filter requires decoding and
 * re-rendering every frame.
 */
export async function applyHardSubtitles(
  inputPath: string,
  srtPath: string,
  options?: { outputDir?: string; outputName?: string }
): Promise<string> {
  const dir = options?.outputDir || path.dirname(inputPath)
  const baseName = options?.outputName || `${path.basename(inputPath, path.extname(inputPath))}_hardsub`
  const outputPath = uniqueOutputPath(dir, baseName, '.mp4')

  console.log(`\n📝 Gravando legendas no vídeo (hardsub)...`)

  // Stage the .srt at a path under our control, at a fixed safe filename —
  // see escapeSubtitlesFilterPath's doc comment for why the original path
  // (which may contain a ') can't be passed to the filter directly.
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediacript-subs-'))
  const stagedSrtPath = path.join(stagingDir, 'subs.srt')

  try {
    fs.copyFileSync(srtPath, stagedSrtPath)
    const escapedSrt = escapeSubtitlesFilterPath(stagedSrtPath)

    const args = [
      '-i', inputPath,
      '-vf', `subtitles=${escapedSrt}`,
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-y', outputPath
    ]

    await runFfmpegCommand(args)
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true })
  }

  console.log(`✓ Legendas gravadas no vídeo: ${path.basename(outputPath)}`)
  return outputPath
}

/**
 * Adds subtitles as a separate, toggleable stream (softsub) via `mov_text`,
 * stream-copying video/audio instead of re-encoding — fast, but requires the
 * source's existing codecs to already be MP4-compatible.
 */
export async function applySoftSubtitles(
  inputPath: string,
  srtPath: string,
  options?: { outputDir?: string; outputName?: string }
): Promise<string> {
  const dir = options?.outputDir || path.dirname(inputPath)
  const baseName = options?.outputName || `${path.basename(inputPath, path.extname(inputPath))}_softsub`
  const outputPath = uniqueOutputPath(dir, baseName, '.mp4')

  console.log(`\n📝 Adicionando legenda como faixa separada (softsub)...`)

  const args = [
    '-i', inputPath,
    '-i', srtPath,
    '-map', '0', '-map', '1',
    '-c', 'copy',
    '-c:s', 'mov_text',
    '-movflags', '+faststart',
    '-y', outputPath
  ]

  try {
    await runFfmpegCommand(args)
  } catch (error) {
    const message = (error as Error).message || ''
    if (/codec not currently supported in container|Could not find tag for codec/i.test(message)) {
      throw new Error(
        'O vídeo original usa um codec incompatível com legenda "softsub" em MP4. ' +
          'Tente o modo "legenda embutida" (hardsub), ou converta o vídeo primeiro antes de aplicar a legenda.'
      )
    }
    throw error
  }

  console.log(`✓ Legenda adicionada como faixa separada: ${path.basename(outputPath)}`)
  return outputPath
}

