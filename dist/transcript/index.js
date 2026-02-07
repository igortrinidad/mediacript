import path from 'path';
import fs from 'fs';
import { groqTranscriptAudio } from './groq.js';
import { openaiTranscriptAudio } from './openai.js';
import { getFileSize, bytesToMB } from '../utils/fileHelpers.js';
import { splitAudioIntoChunks, deleteDirectory } from '../utils/ffmpegOperations.js';
const MAX_FILE_SIZE_MB = 10;
/**
 * Transcribes a single audio file using Groq or OpenAI
 */
async function transcribeSingleAudio(audioFilePath, config) {
    // Try Groq first (faster and cheaper)
    if (config.groqApiKey) {
        const result = await groqTranscriptAudio(audioFilePath, config.groqApiKey);
        if (result) {
            return result;
        }
    }
    // If Groq failed or is not configured, try OpenAI
    if (config.openaiApiKey) {
        const result = await openaiTranscriptAudio(audioFilePath, config.openaiApiKey);
        if (result) {
            return result;
        }
    }
    return null;
}
/**
 * Transcribes an audio file, automatically splitting if larger than 10MB
 * @param audioFilePath - Audio file path
 * @param config - Configuration with API keys
 * @returns Transcribed text or null
 */
export async function transcribeAudio(audioFilePath, config) {
    console.log(`\n🎙️  Transcribing: ${path.basename(audioFilePath)}`);
    const fileSize = getFileSize(audioFilePath);
    const fileSizeMB = bytesToMB(fileSize);
    console.log(`📦 File size: ${fileSizeMB.toFixed(2)}MB`);
    // If file is small enough, transcribe directly
    if (fileSizeMB <= MAX_FILE_SIZE_MB) {
        console.log('📡 File size is within limits, transcribing directly...');
        if (config.groqApiKey) {
            console.log('📡 Trying Groq Whisper (fast)...');
            const result = await transcribeSingleAudio(audioFilePath, config);
            if (result) {
                console.log('✓ Transcription completed with Groq');
                return result;
            }
            console.log('⚠️  Failed with Groq, trying OpenAI...');
        }
        if (config.openaiApiKey) {
            console.log('📡 Trying OpenAI Whisper...');
            const result = await transcribeSingleAudio(audioFilePath, config);
            if (result) {
                console.log('✓ Transcription completed with OpenAI');
                return result;
            }
        }
        console.error('❌ Failed to transcribe with all available services');
        return null;
    }
    // File is too large, split into chunks
    console.log(`⚠️  File exceeds ${MAX_FILE_SIZE_MB}MB limit, splitting into chunks...`);
    let chunkFiles = [];
    let tempDir = '';
    try {
        chunkFiles = await splitAudioIntoChunks(audioFilePath, MAX_FILE_SIZE_MB);
        tempDir = path.dirname(chunkFiles[0]);
        const transcriptions = [];
        // Transcribe each chunk
        for (let i = 0; i < chunkFiles.length; i++) {
            const chunkFile = chunkFiles[i];
            const chunkSize = bytesToMB(getFileSize(chunkFile));
            console.log(`\n[${i + 1}/${chunkFiles.length}] Transcribing chunk: ${path.basename(chunkFile)} (${chunkSize.toFixed(2)}MB)`);
            if (config.groqApiKey) {
                console.log('📡 Trying Groq Whisper (fast)...');
                const result = await transcribeSingleAudio(chunkFile, config);
                if (result) {
                    console.log(`✓ Chunk ${i + 1} transcribed with Groq`);
                    transcriptions.push(result);
                    continue;
                }
                console.log('⚠️  Failed with Groq, trying OpenAI...');
            }
            if (config.openaiApiKey) {
                console.log('📡 Trying OpenAI Whisper...');
                const result = await transcribeSingleAudio(chunkFile, config);
                if (result) {
                    console.log(`✓ Chunk ${i + 1} transcribed with OpenAI`);
                    transcriptions.push(result);
                    continue;
                }
            }
            // If we couldn't transcribe this chunk, fail
            console.error(`❌ Failed to transcribe chunk ${i + 1}`);
            return null;
        }
        // Combine all transcriptions
        console.log('\n🔗 Combining all transcriptions...');
        const finalTranscription = transcriptions.join('\n\n');
        console.log(`✓ Successfully transcribed all ${chunkFiles.length} chunks`);
        return finalTranscription;
    }
    finally {
        // Clean up temp directory
        if (tempDir) {
            console.log('\n🧹 Cleaning up temporary files...');
            deleteDirectory(tempDir);
            console.log('✓ Cleanup complete');
        }
    }
}
/**
 * Saves transcription to file
 */
export function saveTranscription(audioPath, transcription) {
    const outputFileName = path.basename(audioPath, path.extname(audioPath)) + '.txt';
    const outputPath = path.join(path.dirname(audioPath), outputFileName);
    fs.writeFileSync(outputPath, transcription, 'utf-8');
    return outputPath;
}
//# sourceMappingURL=index.js.map