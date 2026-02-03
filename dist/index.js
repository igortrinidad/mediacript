#!/usr/bin/env node
import inquirer from 'inquirer';
import { verifyFfmpeg } from './utils/ffmpegCheck.js';
import { ensureConfig, hasApiKey } from './config/index.js';
import { listMediaFiles, detectFileType } from './utils/fileHelpers.js';
import { convertVideo, extractAudio, convertAudio } from './utils/ffmpegOperations.js';
import { transcribeAudio, saveTranscription } from './transcript/index.js';
import { createWorkflowState, updateStepStatus, nextStep, printWorkflowProgress, saveWorkflowState, getCurrentStep } from './workflow/state.js';
import path from 'path';
const WORKFLOW_OPTIONS = [
    {
        name: '🎬 Convert video + Extract audio + Transcribe',
        value: 'video-full',
        steps: ['Convert video', 'Extract audio', 'Transcribe audio'],
        requiresType: 'video'
    },
    {
        name: '🎬 Extract audio from video + Transcribe',
        value: 'video-extract-transcribe',
        steps: ['Extract audio', 'Transcribe audio'],
        requiresType: 'video'
    },
    {
        name: '🎵 Convert audio + Transcribe',
        value: 'audio-convert-transcribe',
        steps: ['Convert audio', 'Transcribe audio'],
        requiresType: 'audio'
    },
    {
        name: '🎙️  Transcribe audio only',
        value: 'audio-transcribe',
        steps: ['Transcribe audio'],
        requiresType: 'audio'
    },
    {
        name: '🎬 Convert video only',
        value: 'video-convert',
        steps: ['Convert video'],
        requiresType: 'video'
    },
    {
        name: '🎵 Convert audio only',
        value: 'audio-convert',
        steps: ['Convert audio'],
        requiresType: 'audio'
    },
    {
        name: '🎵 Extract audio from video only',
        value: 'video-extract',
        steps: ['Extract audio'],
        requiresType: 'video'
    }
];
async function executeWorkflow(workflow, inputFile, config) {
    const state = createWorkflowState(inputFile, workflow.steps);
    const outputDir = path.dirname(inputFile);
    console.log(`\n🚀 Starting workflow: ${workflow.name}`);
    console.log(`📁 Input file: ${path.basename(inputFile)}\n`);
    let currentFile = inputFile;
    let audioFile;
    let transcriptionFile;
    for (let i = 0; i < state.steps.length; i++) {
        const step = getCurrentStep(state);
        if (!step)
            break;
        updateStepStatus(state, i, 'running');
        console.log(`\n[${i + 1}/${state.steps.length}] ${step.name}...`);
        try {
            switch (step.name) {
                case 'Convert video':
                    currentFile = await convertVideo(currentFile, outputDir);
                    state.intermediateFiles.convertedVideo = currentFile;
                    updateStepStatus(state, i, 'completed', { outputFile: currentFile });
                    break;
                case 'Extract audio':
                    audioFile = await extractAudio(currentFile, outputDir);
                    state.intermediateFiles.extractedAudio = audioFile;
                    currentFile = audioFile;
                    updateStepStatus(state, i, 'completed', { outputFile: audioFile });
                    break;
                case 'Convert audio':
                    audioFile = await convertAudio(currentFile, outputDir);
                    currentFile = audioFile;
                    updateStepStatus(state, i, 'completed', { outputFile: audioFile });
                    break;
                case 'Transcribe audio':
                    // Usa o arquivo de áudio atual ou o arquivo de entrada se for áudio
                    const fileToTranscribe = audioFile || currentFile;
                    // Check if API key is configured
                    if (!hasApiKey(config)) {
                        console.log('\n⚠️  Skipping transcription - no API key configured');
                        updateStepStatus(state, i, 'skipped');
                        break;
                    }
                    const transcription = await transcribeAudio(fileToTranscribe, config);
                    if (transcription) {
                        transcriptionFile = saveTranscription(fileToTranscribe, transcription);
                        state.intermediateFiles.transcriptionText = transcriptionFile;
                        console.log(`✓ Transcrição salva: ${path.basename(transcriptionFile)}`);
                        updateStepStatus(state, i, 'completed', { outputFile: transcriptionFile });
                    }
                    else {
                        throw new Error('Failed to transcribe audio');
                    }
                    break;
                default:
                    throw new Error(`Unknown step: ${step.name}`);
            }
            nextStep(state);
        }
        catch (error) {
            console.error(`\n❌ Error in step "${step.name}":`, error.message);
            updateStepStatus(state, i, 'failed', undefined, error.message);
            break;
        }
    }
    // Save final state
    saveWorkflowState(state, outputDir);
    // Display summary
    printWorkflowProgress(state);
    // Display generated files
    console.log('\n📦 Generated files:');
    if (state.intermediateFiles.convertedVideo) {
        console.log(`  • Video: ${path.basename(state.intermediateFiles.convertedVideo)}`);
    }
    if (state.intermediateFiles.extractedAudio) {
        console.log(`  • Audio: ${path.basename(state.intermediateFiles.extractedAudio)}`);
    }
    if (state.intermediateFiles.transcriptionText) {
        console.log(`  • Transcription: ${path.basename(state.intermediateFiles.transcriptionText)}`);
    }
    console.log('');
}
async function main() {
    console.log('🎬 FFmpeg Simple Converter - Workflow Multi-Step\n');
    // Check ffmpeg
    const ffmpegInstalled = verifyFfmpeg();
    if (!ffmpegInstalled) {
        process.exit(1);
    }
    console.log('');
    // Ensure configuration exists (even without API keys)
    const config = await ensureConfig();
    // List files
    const currentDir = process.cwd();
    const mediaFiles = listMediaFiles(currentDir);
    if (mediaFiles.length === 0) {
        console.log('\n⚠️  No media files found in current directory.');
        console.log('Supported formats:');
        console.log('  • Audio: .ogg, .wav, .mp3, .m4a, .aac, .flac');
        console.log('  • Video: .mp4, .mov, .mkv, .webm, .avi\n');
        process.exit(0);
    }
    console.log(`\n📁 Found ${mediaFiles.length} media file(s)\n`);
    // File selection
    const { selectedFile } = await inquirer.prompt([
        {
            type: 'list',
            name: 'selectedFile',
            message: 'Select the file:',
            choices: mediaFiles.map((f) => ({
                name: `${f.type === 'video' ? '🎬' : '🎵'} ${f.name}`,
                value: f.fullPath
            }))
        }
    ]);
    const fileType = detectFileType(selectedFile);
    // Filter workflows compatible with file type
    const availableWorkflows = WORKFLOW_OPTIONS.filter((w) => {
        if (w.requiresType === 'any')
            return true;
        return w.requiresType === fileType;
    });
    // Mark workflows that require API key
    const workflowChoices = availableWorkflows.map((w) => {
        const requiresTranscription = w.steps.some(s => s.includes('Transcribe'));
        const hasKey = hasApiKey(config);
        let name = w.name;
        if (requiresTranscription && !hasKey) {
            name += ' ⚠️  (requires API key)';
        }
        return {
            name,
            value: w.value
        };
    });
    // Workflow selection
    const { selectedWorkflow } = await inquirer.prompt([
        {
            type: 'list',
            name: 'selectedWorkflow',
            message: 'Select what you want to do:',
            choices: workflowChoices
        }
    ]);
    const workflow = availableWorkflows.find((w) => w.value === selectedWorkflow);
    if (!workflow) {
        console.error('❌ Invalid workflow');
        process.exit(1);
    }
    // Warning if workflow requires transcription but no API key
    const requiresTranscription = workflow.steps.some(s => s.includes('Transcribe'));
    if (requiresTranscription && !hasApiKey(config)) {
        console.log('\n⚠️  This workflow includes transcription, but no API key is configured.');
        console.log('Transcription will be skipped. Configure an API key to enable transcription.\n');
        const { confirm } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirm',
                message: 'Continue anyway?',
                default: true
            }
        ]);
        if (!confirm) {
            process.exit(0);
        }
    }
    // Execute workflow
    await executeWorkflow(workflow, selectedFile, config);
}
// Execute
main().catch((error) => {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
});
//# sourceMappingURL=index.js.map