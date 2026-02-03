#!/usr/bin/env node

// Importa e executa o CLI compilado
import('../dist/index.js').catch((error) => {
  console.error('Erro ao carregar o CLI:', error)
  process.exit(1)
})
