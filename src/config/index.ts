import fs from 'fs'
import path from 'path'
import os from 'os'
import inquirer from 'inquirer'
import { Config } from '../types/index.js'

/**
 * Retorna o diretório de configuração baseado no sistema operacional
 * Linux/Mac: ~/.config/ffmpeg-simple-converter
 * Windows: %APPDATA%/ffmpeg-simple-converter
 */
function getConfigDir(): string {
  const homeDir = os.homedir()
  
  if (process.platform === 'win32') {
    // Windows
    const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming')
    return path.join(appData, 'ffmpeg-simple-converter')
  } else {
    // Linux/Mac
    return path.join(homeDir, '.config', 'ffmpeg-simple-converter')
  }
}

function getConfigFilePath(): string {
  return path.join(getConfigDir(), 'config.json')
}

/**
 * Carrega a configuração salva
 */
export function loadConfig(): Config {
  try {
    const configPath = getConfigFilePath()
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8')
      return JSON.parse(data)
    }
  } catch (error) {
    console.warn('Erro ao carregar configuração:', error)
  }
  return {}
}

/**
 * Salva a configuração
 */
export function saveConfig(config: Config): void {
  try {
    const configDir = getConfigDir()
    const configPath = getConfigFilePath()
    
    // Cria o diretório se não existir
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
    console.log(`✓ Configuração salva em: ${configPath}`)
  } catch (error) {
    console.error('Erro ao salvar configuração:', error)
  }
}

/**
 * Solicita as API keys ao usuário (interativo)
 */
export async function promptApiKeys(): Promise<Config> {
  console.log('\n🔑 Configure suas API keys (opcional - pressione Enter para pular)\n')
  
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
  ])
  
  const config: Config = {}
  
  if (answers.groqApiKey.trim()) {
    config.groqApiKey = answers.groqApiKey.trim()
  }
  
  if (answers.openaiApiKey.trim()) {
    config.openaiApiKey = answers.openaiApiKey.trim()
  }
  
  return config
}

/**
 * Verifica se há pelo menos uma API key configurada
 */
export function hasApiKey(config: Config): boolean {
  return !!(config.openaiApiKey || config.groqApiKey)
}

/**
 * Obtém a configuração, solicitando ao usuário se necessário
 */
export async function ensureConfig(): Promise<Config> {
  let config = loadConfig()
  
  // Se não tem nenhuma API key, pergunta ao usuário
  if (!hasApiKey(config)) {
    console.log('\n⚠️  Nenhuma API key encontrada.')
    
    const { shouldConfigure } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldConfigure',
        message: 'Deseja configurar suas API keys agora?',
        default: true
      }
    ])
    
    if (shouldConfigure) {
      const newConfig = await promptApiKeys()
      
      if (hasApiKey(newConfig)) {
        config = { ...config, ...newConfig }
        saveConfig(config)
      }
    }
  }
  
  return config
}
