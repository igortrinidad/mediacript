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
        name: '🎬 Converter vídeo + Extrair áudio + Transcrever',
        value: 'video-full',
        steps: ['Converter vídeo', 'Extrair áudio', 'Transcrever áudio'],
        requiresType: 'video'
    },
    {
        name: '🎬 Extrair áudio do vídeo + Transcrever',
        value: 'video-extract-transcribe',
        steps: ['Extrair áudio', 'Transcrever áudio'],
        requiresType: 'video'
    },
    {
        name: '🎵 Converter áudio + Transcrever',
        value: 'audio-convert-transcribe',
        steps: ['Converter áudio', 'Transcrever áudio'],
        requiresType: 'audio'
    },
    {
        name: '🎙️  Apenas transcrever áudio',
        value: 'audio-transcribe',
        steps: ['Transcrever áudio'],
        requiresType: 'audio'
    },
    {
        name: '🎬 Apenas converter vídeo',
        value: 'video-convert',
        steps: ['Converter vídeo'],
        requiresType: 'video'
    },
    {
        name: '🎵 Apenas converter áudio',
        value: 'audio-convert',
        steps: ['Converter áudio'],
        requiresType: 'audio'
    },
    {
        name: '🎵 Apenas extrair áudio do vídeo',
        value: 'video-extract',
        steps: ['Extrair áudio'],
        requiresType: 'video'
    }
];
async function executeWorkflow(workflow, inputFile, config) {
    const state = createWorkflowState(inputFile, workflow.steps);
    const outputDir = path.dirname(inputFile);
    console.log(`\n🚀 Iniciando workflow: ${workflow.name}`);
    console.log(`📁 Arquivo de entrada: ${path.basename(inputFile)}\n`);
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
                case 'Converter vídeo':
                    currentFile = await convertVideo(currentFile, outputDir);
                    state.intermediateFiles.convertedVideo = currentFile;
                    updateStepStatus(state, i, 'completed', { outputFile: currentFile });
                    break;
                case 'Extrair áudio':
                    audioFile = await extractAudio(currentFile, outputDir);
                    state.intermediateFiles.extractedAudio = audioFile;
                    currentFile = audioFile;
                    updateStepStatus(state, i, 'completed', { outputFile: audioFile });
                    break;
                case 'Converter áudio':
                    audioFile = await convertAudio(currentFile, outputDir);
                    currentFile = audioFile;
                    updateStepStatus(state, i, 'completed', { outputFile: audioFile });
                    break;
                case 'Transcrever áudio':
                    // Usa o arquivo de áudio atual ou o arquivo de entrada se for áudio
                    const fileToTranscribe = audioFile || currentFile;
                    // Verifica se há API key
                    if (!hasApiKey(config)) {
                        console.log('\n⚠️  Pulando transcrição - nenhuma API key configurada');
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
                        throw new Error('Falha ao transcrever áudio');
                    }
                    break;
                default:
                    throw new Error(`Step desconhecido: ${step.name}`);
            }
            nextStep(state);
        }
        catch (error) {
            console.error(`\n❌ Erro no step "${step.name}":`, error.message);
            updateStepStatus(state, i, 'failed', undefined, error.message);
            break;
        }
    }
    // Salva o estado final
    saveWorkflowState(state, outputDir);
    // Exibe resumo
    printWorkflowProgress(state);
    // Exibe arquivos gerados
    console.log('\n📦 Arquivos gerados:');
    if (state.intermediateFiles.convertedVideo) {
        console.log(`  • Vídeo: ${path.basename(state.intermediateFiles.convertedVideo)}`);
    }
    if (state.intermediateFiles.extractedAudio) {
        console.log(`  • Áudio: ${path.basename(state.intermediateFiles.extractedAudio)}`);
    }
    if (state.intermediateFiles.transcriptionText) {
        console.log(`  • Transcrição: ${path.basename(state.intermediateFiles.transcriptionText)}`);
    }
    console.log('');
}
async function main() {
    console.log('🎬 FFmpeg Simple Converter - Workflow Multi-Step\n');
    // Verifica o ffmpeg
    const ffmpegInstalled = verifyFfmpeg();
    if (!ffmpegInstalled) {
        process.exit(1);
    }
    console.log('');
    // Garante que há configuração (mesmo que sem API keys)
    const config = await ensureConfig();
    // Lista arquivos
    const currentDir = process.cwd();
    const mediaFiles = listMediaFiles(currentDir);
    if (mediaFiles.length === 0) {
        console.log('\n⚠️  Nenhum arquivo de mídia encontrado no diretório atual.');
        console.log('Formatos suportados:');
        console.log('  • Áudio: .ogg, .wav, .mp3, .m4a, .aac, .flac');
        console.log('  • Vídeo: .mp4, .mov, .mkv, .webm, .avi\n');
        process.exit(0);
    }
    console.log(`\n📁 Encontrados ${mediaFiles.length} arquivo(s) de mídia\n`);
    // Seleção do arquivo
    const { selectedFile } = await inquirer.prompt([
        {
            type: 'list',
            name: 'selectedFile',
            message: 'Selecione o arquivo:',
            choices: mediaFiles.map((f) => ({
                name: `${f.type === 'video' ? '🎬' : '🎵'} ${f.name}`,
                value: f.fullPath
            }))
        }
    ]);
    const fileType = detectFileType(selectedFile);
    // Filtra workflows compatíveis com o tipo de arquivo
    const availableWorkflows = WORKFLOW_OPTIONS.filter((w) => {
        if (w.requiresType === 'any')
            return true;
        return w.requiresType === fileType;
    });
    // Marca workflows que requerem API key
    const workflowChoices = availableWorkflows.map((w) => {
        const requiresTranscription = w.steps.some(s => s.includes('Transcrever'));
        const hasKey = hasApiKey(config);
        let name = w.name;
        if (requiresTranscription && !hasKey) {
            name += ' ⚠️  (requer API key)';
        }
        return {
            name,
            value: w.value
        };
    });
    // Seleção do workflow
    const { selectedWorkflow } = await inquirer.prompt([
        {
            type: 'list',
            name: 'selectedWorkflow',
            message: 'Selecione o que deseja fazer:',
            choices: workflowChoices
        }
    ]);
    const workflow = availableWorkflows.find((w) => w.value === selectedWorkflow);
    if (!workflow) {
        console.error('❌ Workflow inválido');
        process.exit(1);
    }
    // Aviso se workflow requer transcrição mas não há API key
    const requiresTranscription = workflow.steps.some(s => s.includes('Transcrever'));
    if (requiresTranscription && !hasApiKey(config)) {
        console.log('\n⚠️  Este workflow inclui transcrição, mas nenhuma API key está configurada.');
        console.log('A transcrição será pulada. Configure uma API key para habilitar transcrição.\n');
        const { confirm } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirm',
                message: 'Continuar mesmo assim?',
                default: true
            }
        ]);
        if (!confirm) {
            process.exit(0);
        }
    }
    // Executa o workflow
    await executeWorkflow(workflow, selectedFile, config);
}
// Executa
main().catch((error) => {
    console.error('\n❌ Erro:', error.message);
    process.exit(1);
});
//# sourceMappingURL=index.js.map