import { execSync } from 'child_process';
/**
 * Checks if ffmpeg is installed and available in PATH
 */
export function checkFfmpegInstalled() {
    try {
        const output = execSync('ffmpeg -version', {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe']
        });
        // Extract version from first line
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
 * Displays ffmpeg installation instructions based on operating system
 */
export function showFfmpegInstallInstructions() {
    const platform = process.platform;
    console.log('\n⚠️  FFmpeg is not installed or not available in PATH\n');
    console.log('📦 Installation instructions:\n');
    if (platform === 'win32') {
        console.log('Windows:');
        console.log('  1. Using Chocolatey:');
        console.log('     choco install ffmpeg');
        console.log('\n  2. Using Scoop:');
        console.log('     scoop install ffmpeg');
        console.log('\n  3. Manual download:');
        console.log('     - Download from: https://ffmpeg.org/download.html');
        console.log('     - Extract and add to system PATH');
    }
    else if (platform === 'darwin') {
        console.log('macOS:');
        console.log('  Using Homebrew:');
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
    console.log('\n💡 After installation, restart the terminal and try again.\n');
}
/**
 * Checks and reports on ffmpeg installation
 * Returns true if installed, false otherwise
 */
export function verifyFfmpeg() {
    const result = checkFfmpegInstalled();
    if (result.installed) {
        console.log(`✓ FFmpeg is installed (version: ${result.version})`);
        return true;
    }
    else {
        showFfmpegInstallInstructions();
        return false;
    }
}
//# sourceMappingURL=ffmpegCheck.js.map