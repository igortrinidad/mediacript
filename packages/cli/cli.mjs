#!/usr/bin/env node

// Importa e executa o CLI compilado
import { fileURLToPath, pathToFileURL } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function main() {
  const [subcommand] = process.argv.slice(2)

  if (subcommand === 'install-mac' || subcommand === 'unlock-mac') {
    if (subcommand === 'unlock-mac') {
      console.warn('⚠️  "unlock-mac" foi renomeado para "install-mac". Use: npx mediacript install-mac\n')
    }
    const installMacURL = pathToFileURL(join(__dirname, 'scripts', 'install-mac.mjs')).href
    const { runInstallMac } = await import(installMacURL)
    await runInstallMac()
    return
  }

  // Converte o caminho para URL file:// (necessário no Windows)
  const indexPath = join(__dirname, 'dist', 'esm', 'index.js')
  const indexURL = pathToFileURL(indexPath).href
  await import(indexURL)
}

main().catch((error) => {
  console.error('Error loading CLI:', error)
  process.exit(1)
})
