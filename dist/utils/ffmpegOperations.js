import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
/**
 * Generates unique output file path
 */
export function uniqueOutputPath(dir, baseName, extWithDot) {
    let candidate = path.join(dir, `${baseName}${extWithDot}`);
    if (!fs.existsSync(candidate))
        return candidate;
    for (let i = 1; i < 10000; i++) {
        candidate = path.join(dir, `${baseName}_${i}${extWithDot}`);
        if (!fs.existsSync(candidate))
            return candidate;
    }
    throw new Error('Could not generate a unique output name.');
}
/**
 * Executes an ffmpeg command
 */
export function runFfmpegCommand(args) {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', args, {
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let stdout = '';
        let stderr = '';
        ffmpeg.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        ffmpeg.stderr.on('data', (data) => {
            stderr += data.toString();
            // FFmpeg sends progress to stderr
            const lines = stderr.split('\n');
            const lastLine = lines[lines.length - 2] || '';
            // Display progress if there is time information
            if (lastLine.includes('time=')) {
                process.stdout.write(`\r${lastLine.trim()}`);
            }
        });
        ffmpeg.on('close', (code) => {
            process.stdout.write('\r');
            if (code === 0) {
                resolve(stdout);
            }
            else {
                reject(new Error(`FFmpeg failed with code ${code}\n${stderr}`));
            }
        });
        ffmpeg.on('error', (err) => {
            reject(err);
        });
    });
}
/**
 * Converts video to performant format (H.264/AAC)
 */
export async function convertVideo(inputPath, outputDir) {
    const dir = outputDir || path.dirname(inputPath);
    const baseName = path.basename(inputPath, path.extname(inputPath));
    const outputPath = uniqueOutputPath(dir, `${baseName}_converted`, '.mp4');
    console.log(`\n🎬 Converting video to performant format...`);
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
    ];
    await runFfmpegCommand(args);
    console.log(`\n✓ Video converted: ${path.basename(outputPath)}`);
    return outputPath;
}
/**
 * Extracts audio from a video
 */
export async function extractAudio(inputPath, outputDir) {
    const dir = outputDir || path.dirname(inputPath);
    const baseName = path.basename(inputPath, path.extname(inputPath));
    const outputPath = uniqueOutputPath(dir, `${baseName}_audio`, '.mp3');
    console.log(`\n🎵 Extracting audio from video...`);
    const args = [
        '-i', inputPath,
        '-vn',
        '-acodec', 'libmp3lame',
        '-b:a', '192k',
        '-y',
        outputPath
    ];
    await runFfmpegCommand(args);
    console.log(`\n✓ Audio extracted: ${path.basename(outputPath)}`);
    return outputPath;
}
/**
 * Converts audio to performant format
 */
export async function convertAudio(inputPath, outputDir) {
    const dir = outputDir || path.dirname(inputPath);
    const baseName = path.basename(inputPath, path.extname(inputPath));
    const outputPath = uniqueOutputPath(dir, `${baseName}_converted`, '.mp3');
    console.log(`\n🎵 Converting audio to MP3...`);
    const args = [
        '-i', inputPath,
        '-acodec', 'libmp3lame',
        '-b:a', '192k',
        '-y',
        outputPath
    ];
    await runFfmpegCommand(args);
    console.log(`\n✓ Audio converted: ${path.basename(outputPath)}`);
    return outputPath;
}
//# sourceMappingURL=ffmpegOperations.js.map