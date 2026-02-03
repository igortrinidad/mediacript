import fs from 'fs';
import path from 'path';
import os from 'os';
import inquirer from 'inquirer';
/**
 * Returns the configuration directory based on the operating system
 * Linux/Mac: ~/.config/ffmpeg-simple-converter
 * Windows: %APPDATA%/ffmpeg-simple-converter
 */
function getConfigDir() {
    const homeDir = os.homedir();
    if (process.platform === 'win32') {
        // Windows
        const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
        return path.join(appData, 'ffmpeg-simple-converter');
    }
    else {
        // Linux/Mac
        return path.join(homeDir, '.config', 'ffmpeg-simple-converter');
    }
}
function getConfigFilePath() {
    return path.join(getConfigDir(), 'config.json');
}
/**
 * Loads saved configuration
 */
export function loadConfig() {
    try {
        const configPath = getConfigFilePath();
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf-8');
            return JSON.parse(data);
        }
    }
    catch (error) {
        console.warn('Error loading configuration:', error);
    }
    return {};
}
/**
 * Saves configuration
 */
export function saveConfig(config) {
    try {
        const configDir = getConfigDir();
        const configPath = getConfigFilePath();
        // Create directory if it doesn't exist
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
        console.log(`✓ Configuration saved in: ${configPath}`);
    }
    catch (error) {
        console.error('Error saving configuration:', error);
    }
}
/**
 * Prompts user for API keys (interactive)
 */
export async function promptApiKeys() {
    console.log('\n🔑 Configure your API keys (optional - press Enter to skip)\n');
    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'groqApiKey',
            message: 'Groq API Key (recomendado - mais rápido):',
            default: ''
        },
        {
            type: 'input',
            name: 'openaiApiKey',
            message: 'OpenAI API Key:',
            default: ''
        }
    ]);
    const config = {};
    if (answers.groqApiKey.trim()) {
        config.groqApiKey = answers.groqApiKey.trim();
    }
    if (answers.openaiApiKey.trim()) {
        config.openaiApiKey = answers.openaiApiKey.trim();
    }
    return config;
}
/**
 * Checks if at least one API key is configured
 */
export function hasApiKey(config) {
    return !!(config.openaiApiKey || config.groqApiKey);
}
/**
 * Gets configuration, prompting the user if necessary
 */
export async function ensureConfig() {
    let config = loadConfig();
    // Display where API keys are being loaded from
    const configPath = getConfigFilePath();
    console.log(`\n🔑 API Keys Configuration`);
    console.log(`ℹ️  Loading from: ${configPath}`);
    // If no API keys are found
    if (!hasApiKey(config)) {
        console.log('⚠️  No API keys found.');
        const { shouldConfigure } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'shouldConfigure',
                message: 'Would you like to configure your API keys now?',
                default: true
            }
        ]);
        if (shouldConfigure) {
            const newConfig = await promptApiKeys();
            if (hasApiKey(newConfig)) {
                config = { ...config, ...newConfig };
                saveConfig(config);
            }
        }
    }
    else {
        // Display current API keys status
        console.log('✓ API Keys found:');
        if (config.groqApiKey) {
            console.log('  • Groq API Key: Configured');
        }
        if (config.openaiApiKey) {
            console.log('  • OpenAI API Key: Configured');
        }
        const { updateKeys } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'updateKeys',
                message: 'Would you like to update or add new API keys?',
                default: false
            }
        ]);
        if (updateKeys) {
            const newConfig = await promptApiKeys();
            if (hasApiKey(newConfig)) {
                config = { ...config, ...newConfig };
                saveConfig(config);
            }
        }
    }
    return config;
}
//# sourceMappingURL=index.js.map