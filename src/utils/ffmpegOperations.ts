import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'

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

    let stdout = ''
    let stderr = ''

    ffmpeg.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString()
      // FFmpeg sends progress to stderr
      const lines = stderr.split('\n')
      const lastLine = lines[lines.length - 2] || ''
      
      // Display progress if there is time information
      if (lastLine.includes('time=')) {
        process.stdout.write(`\r${lastLine.trim()}`)
      }
    })

    ffmpeg.on('close', (code) => {
      process.stdout.write('\r')
      if (code === 0) {
        resolve(stdout)
      } else {
        reject(new Error(`FFmpeg failed with code ${code}\n${stderr}`))
      }
    })

    ffmpeg.on('error', (err) => {
      reject(err)
    })
  })
}

/**
 * Converts video to performant format (H.264/AAC)
 */
export async function convertVideo(
  inputPath: string,
  outputDir?: string
): Promise<string> {
  const dir = outputDir || path.dirname(inputPath)
  const baseName = path.basename(inputPath, path.extname(inputPath))
  const outputPath = uniqueOutputPath(dir, `${baseName}_converted`, '.mp4')

  console.log(`\n🎬 Converting video to performant format...`)

  const args = [
    '-i', inputPath,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    '-y',
    outputPath
  ]

  await runFfmpegCommand(args)
  console.log(`\n✓ Video converted: ${path.basename(outputPath)}`)
  return outputPath
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

/**
 * Gets the duration of an audio file in seconds
 */
export async function getAudioDuration(inputPath: string): Promise<number> {
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
 * Deletes a directory and all its contents
 */
export function deleteDirectory(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true })
  }
}

