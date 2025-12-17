#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const inquirer = require('inquirer');

const AUDIO_EXTS = new Set(['.ogg', '.wav', '.mp3', '.m4a', '.aac', '.flac']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi']);

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function detectKindByExt(ext) {
  const lower = ext.toLowerCase();
  if (AUDIO_EXTS.has(lower)) return 'audio';
  if (VIDEO_EXTS.has(lower)) return 'video';
  return 'unknown';
}

function listCandidateFiles(dir) {
  return fs
    .readdirSync(dir)
    .map((name) => ({ name, fullPath: path.join(dir, name) }))
    .filter((f) => isFile(f.fullPath))
    .filter((f) => {
      const ext = path.extname(f.name).toLowerCase();
      return AUDIO_EXTS.has(ext) || VIDEO_EXTS.has(ext);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function uniqueOutputPath(dir, baseName, extWithDot) {
  let candidate = path.join(dir, `${baseName}${extWithDot}`);
  if (!fs.existsSync(candidate)) return candidate;

  for (let i = 1; i < 10_000; i++) {
    candidate = path.join(dir, `${baseName}_${i}${extWithDot}`);
    if (!fs.existsSync(candidate)) return candidate;
  }

  throw new Error('Nao foi possivel gerar um nome de saida unico.');
}

function buildPresets() {
  /**
   * Preset shape:
   * - id: string
   * - label: string
   * - kinds: Array<'audio'|'video'>
   * - build({ inputPath, outputPath }): { cmd: 'ffmpeg', args: string[] }
   */
  return [
    {
      id: 'audio_mp3_q2',
      label: 'Audio → MP3 (boa qualidade, q:a 2)',
      kinds: ['audio'],
      outputExt: '.mp3',
      build: ({ inputPath, outputPath }) => ({
        cmd: 'ffmpeg',
        args: ['-hide_banner', '-n', '-i', inputPath, '-c:a', 'libmp3lame', '-q:a', '2', outputPath]
      })
    },
    {
      id: 'audio_mp3_small',
      label: 'Audio → MP3 (menor, q:a 5)',
      kinds: ['audio'],
      outputExt: '.mp3',
      build: ({ inputPath, outputPath }) => ({
        cmd: 'ffmpeg',
        args: ['-hide_banner', '-n', '-i', inputPath, '-c:a', 'libmp3lame', '-q:a', '5', outputPath]
      })
    },
    {
      id: 'video_1080p_medium',
      label: 'Video → MP4 1080p (razoavel/menor: preset medium, CRF 28)',
      kinds: ['video'],
      outputExt: '.mp4',
      build: ({ inputPath, outputPath }) => ({
        cmd: 'ffmpeg',
        args: [
          '-hide_banner',
          '-n',
          '-i',
          inputPath,
          '-vf',
          "scale='min(1080,iw)':-2",
          '-c:v',
          'libx264',
          '-profile:v',
          'baseline',
          '-level',
          '3.1',
          '-preset',
          'medium',
          '-crf',
          '28',
          '-r',
          '30',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-movflags',
          '+faststart',
          outputPath
        ]
      })
    },
    {
      id: 'video_1080p_better',
      label: 'Video → MP4 1080p (melhor/maior: preset slow, CRF 23)',
      kinds: ['video'],
      outputExt: '.mp4',
      build: ({ inputPath, outputPath }) => ({
        cmd: 'ffmpeg',
        args: [
          '-hide_banner',
          '-n',
          '-i',
          inputPath,
          '-vf',
          "scale='min(1080,iw)':-2",
          '-c:v',
          'libx264',
          '-profile:v',
          'baseline',
          '-level',
          '3.1',
          '-preset',
          'slow',
          '-crf',
          '23',
          '-r',
          '30',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-movflags',
          '+faststart',
          outputPath
        ]
      })
    }
  ];
}

function spawnAndStream(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} saiu com codigo ${code}`));
    });
  });
}

async function main() {
  const cwd = process.cwd();
  const files = listCandidateFiles(cwd);

  if (files.length === 0) {
    console.log('Nenhum arquivo de audio/video suportado encontrado na pasta atual.');
    console.log('Extensoes de audio:', Array.from(AUDIO_EXTS).join(', '));
    console.log('Extensoes de video:', Array.from(VIDEO_EXTS).join(', '));
    process.exit(1);
  }

  const { selectedFiles } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedFiles',
      message: 'Selecione os arquivos para converter:',
      pageSize: 15,
      choices: files.map((f) => ({
        name: f.name,
        value: f.fullPath
      })),
      validate: (arr) => (arr && arr.length > 0 ? true : 'Selecione pelo menos 1 arquivo.')
    }
  ]);

  const presets = buildPresets();

  const kindByInput = new Map();
  const selectedKinds = new Set();
  for (const inputPath of selectedFiles) {
    const kind = detectKindByExt(path.extname(inputPath));
    kindByInput.set(inputPath, kind);
    selectedKinds.add(kind);
  }

  if (selectedKinds.has('unknown')) {
    console.log('Selecao contem arquivos com extensao nao suportada.');
    process.exit(1);
  }

  // Escolhe 1 preset por tipo detectado (audio/video)
  const presetByKind = new Map();
  for (const kind of selectedKinds) {
    const applicable = presets.filter((p) => p.kinds.includes(kind));
    if (applicable.length === 0) {
      console.log(`Nao ha presets disponiveis para tipo: ${kind}`);
      process.exit(1);
    }

    const { presetId } = await inquirer.prompt([
      {
        type: 'list',
        name: 'presetId',
        message: `Selecione o preset para ${kind}:`,
        choices: applicable.map((p) => ({ name: p.label, value: p.id }))
      }
    ]);

    const preset = presets.find((p) => p.id === presetId);
    if (!preset) throw new Error('Preset selecionado nao encontrado.');
    presetByKind.set(kind, preset);
  }

  for (const inputPath of selectedFiles) {
    const parsed = path.parse(inputPath);
    const inputExt = parsed.ext.toLowerCase();
    const baseName = parsed.name;

    const kind = kindByInput.get(inputPath);
    const preset = presetByKind.get(kind);
    if (!preset) throw new Error(`Preset nao encontrado para tipo: ${kind}`);

    // Evita sobrescrever quando a extensao final for igual
    const outputBase = inputExt === preset.outputExt ? `${baseName}_converted` : baseName;
    const outputPath = uniqueOutputPath(parsed.dir, outputBase, preset.outputExt);

    const { cmd, args } = preset.build({ inputPath, outputPath });

    console.log('\n----------------------------------------');
    console.log('Entrada:', path.basename(inputPath));
    console.log('Saida  :', path.basename(outputPath));
    console.log('Comando:', [cmd, ...args].join(' '));

    await spawnAndStream(cmd, args);
  }

  console.log('\nConcluido.');
}

main().catch((err) => {
  console.error('\nErro:', err && err.message ? err.message : err);
  process.exit(1);
});
