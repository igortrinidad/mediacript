# 🚀 Guia Rápido de Uso

## Primeira Vez

1. **Instale as dependências**:
   ```bash
   npm install
   ```

2. **Execute o CLI**:
   ```bash
   npm start
   ```

3. **Configure suas API Keys** (quando solicitado):
   - Groq (recomendado): https://console.groq.com
   - OpenAI: https://platform.openai.com

## Workflows Disponíveis

### 🎬 Para Vídeos

#### Pipeline Completo
```
Converter vídeo → Extrair áudio → Transcrever
```
Ideal para: Processar completamente um vídeo, otimizando e transcrevendo

#### Extrair e Transcrever
```
Extrair áudio → Transcrever
```
Ideal para: Transcrever vídeos sem convertê-los

#### Apenas Converter
```
Converter vídeo (H.264/AAC)
```
Ideal para: Otimizar vídeos para web/streaming

#### Apenas Extrair Áudio
```
Extrair áudio (MP3)
```
Ideal para: Extrair trilha sonora de vídeos

### 🎵 Para Áudios

#### Converter e Transcrever
```
Converter áudio → Transcrever
```
Ideal para: Processar áudio em formato não otimizado

#### Apenas Transcrever
```
Transcrever áudio
```
Ideal para: Transcrever podcasts, entrevistas, etc.

#### Apenas Converter
```
Converter áudio (MP3)
```
Ideal para: Padronizar formato de áudio

## Exemplos Práticos

### Transcrever uma aula em vídeo
```bash
# Coloque video_aula.mp4 na pasta
npm start
# Selecione: "Extrair áudio do vídeo + Transcrever"
# Resultado: video_aula_audio.mp3 e video_aula_audio.txt
```

### Converter podcast e transcrever
```bash
# Coloque podcast.wav na pasta
npm start
# Selecione: "Converter áudio + Transcrever"
# Resultado: podcast_converted.mp3 e podcast_converted.txt
```

### Pipeline completo de vídeo
```bash
# Coloque apresentacao.mkv na pasta
npm start
# Selecione: "Converter vídeo + Extrair áudio + Transcrever"
# Resultado:
#   - apresentacao_converted.mp4 (vídeo otimizado)
#   - apresentacao_converted_audio.mp3
#   - apresentacao_converted_audio.txt
```

## Dicas

### 💡 Transcrição
- **Groq é mais rápido** e mais barato que OpenAI
- Configure ambas as keys para ter fallback automático
- A transcrição funciona melhor com áudio claro

### 📊 Acompanhamento
- O progresso é exibido em tempo real
- Cada step mostra o tempo decorrido
- Estado é salvo em `.workflow-state.json`

### 🗂️ Organização
- Arquivos gerados ficam no mesmo diretório do original
- Sufixos são adicionados automaticamente:
  - `_converted` para conversões
  - `_audio` para áudios extraídos
  - `.txt` para transcrições

### ⚡ Performance
- Conversões de vídeo podem demorar (depende do tamanho)
- Extração de áudio é rápida
- Transcrição depende do tamanho do áudio e do serviço

## Comandos Úteis

```bash
# Modo desenvolvimento (auto-reload)
npm run dev

# Compilar para produção
npm run build

# Conversor simples (antigo)
npm run convert
```

## Solução de Problemas

### "FFmpeg não encontrado"
- Instale o FFmpeg seguindo as instruções do README
- Reinicie o terminal após instalar

### "Nenhuma API key configurada"
- Execute novamente e configure quando solicitado
- Ou edite manualmente: `~/.config/ffmpeg-simple-converter/config.json`

### Transcrição falhou
- Verifique se tem créditos/quota na API
- Tente o outro serviço (Groq ou OpenAI)
- Verifique a conexão com internet

### Arquivo não aparece na lista
- Verifique se a extensão é suportada
- Certifique-se de estar no diretório correto

## 📚 Mais Informações

Veja o [README.md](README_NEW.md) completo para detalhes técnicos e avançados.
