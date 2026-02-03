import { execSync } from 'child_process';
/**
 * Verifica se o ffmpeg está instalado e disponível no PATH
 */
export function checkFfmpegInstalled() {
    try {
        const output = execSync('ffmpeg -version', {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe']
        });
        // Extrai a versão da primeira linha
        const versionMatch = output.match(/ffmpeg version ([^\s]+)/);
        const version = versionMatch ? versionMatch[1] : 'unknown';
        return {
            installed: true,
            version
        };
    }
    catch (error) {
        return {
            installed: false,
            error: error.message
        };
    }
}
/**
 * Exibe instruções de instalação do ffmpeg baseado no sistema operacional
 */
export function showFfmpegInstallInstructions() {
    const platform = process.platform;
    console.log('\n⚠️  FFmpeg não está instalado ou não está disponível no PATH\n');
    console.log('📦 Instruções de instalação:\n');
    if (platform === 'win32') {
        console.log('Windows:');
        console.log('  1. Usando Chocolatey:');
        console.log('     choco install ffmpeg');
        console.log('\n  2. Usando Scoop:');
        console.log('     scoop install ffmpeg');
        console.log('\n  3. Download manual:');
        console.log('     - Baixe de: https://ffmpeg.org/download.html');
        console.log('     - Extraia e adicione ao PATH do sistema');
    }
    else if (platform === 'darwin') {
        console.log('macOS:');
        console.log('  Usando Homebrew:');
        console.log('     brew install ffmpeg');
    }
    else {
        console.log('Linux:');
        console.log('  Ubuntu/Debian:');
        console.log('     sudo apt update && sudo apt install ffmpeg');
        console.log('\n  Fedora:');
        console.log('     sudo dnf install ffmpeg');
        console.log('\n  Arch Linux:');
        console.log('     sudo pacman -S ffmpeg');
    }
    console.log('\n💡 Após a instalação, reinicie o terminal e tente novamente.\n');
}
/**
 * Verifica e informa sobre a instalação do ffmpeg
 * Retorna true se instalado, false caso contrário
 */
export function verifyFfmpeg() {
    const result = checkFfmpegInstalled();
    if (result.installed) {
        console.log(`✓ FFmpeg está instalado (versão: ${result.version})`);
        return true;
    }
    else {
        showFfmpegInstallInstructions();
        return false;
    }
}
//# sourceMappingURL=ffmpegCheck.js.map