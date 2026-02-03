#!/usr/bin/env node

// Importa e executa o CLI compilado
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { pathToFileURL } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Converte o caminho para URL file:// (necessário no Windows)
const indexPath = join(__dirname, 'dist', 'index.js')
const indexURL = pathToFileURL(indexPath).href

import(indexURL).catch((error) => {
  console.error('Error loading CLI:', error)
  process.exit(1)
})
