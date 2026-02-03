# 🚀 Quick Start Guide

## First Time

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run the CLI**:
   ```bash
   npm start
   ```

3. **Configure your API Keys** (when prompted):
   - Groq (recommended): https://console.groq.com
   - OpenAI: https://platform.openai.com

## Available Workflows

### 🎬 For Videos

#### Complete Pipeline
```
Convert video → Extract audio → Transcribe
```
Best for: Fully processing a video, optimizing and transcribing

#### Extract and Transcribe
```
Extract audio → Transcribe
```
Best for: Transcribing videos without converting them

#### Only Convert
```
Convert video (H.264/AAC)
```
Best for: Optimizing videos for web/streaming

#### Only Extract Audio
```
Extract audio (MP3)
```
Best for: Extracting soundtrack from videos

### 🎵 For Audio

#### Convert and Transcribe
```
Convert audio → Transcribe
```
Best for: Processing audio in non-optimized format

#### Only Transcribe
```
Transcribe audio
```
Best for: Transcribing podcasts, interviews, etc.

#### Only Convert
```
Convert audio (MP3)
```
Best for: Standardizing audio format

## Practical Examples

### Transcribe a lecture video
```bash
# Place lecture_video.mp4 in the folder
npm start
# Select: "Extract audio from video + Transcribe"
# Result: lecture_video_audio.mp3 and lecture_video_audio.txt
```

### Convert podcast and transcribe
```bash
# Place podcast.wav in the folder
npm start
# Select: "Convert audio + Transcribe"
# Result: podcast_converted.mp3 and podcast_converted.txt
```

### Complete video pipeline
```bash
# Place presentation.mkv in the folder
npm start
# Select: "Convert video + Extract audio + Transcribe"
# Result:
#   - presentation_converted.mp4 (optimized video)
#   - presentation_converted_audio.mp3
#   - presentation_converted_audio.txt
```

## Tips

### 💡 Transcription
- **Groq is faster** and cheaper than OpenAI
- Configure both keys to have automatic fallback
- Transcription works best with clear audio

### 📊 Tracking
- Progress is displayed in real-time
- Each step shows elapsed time
- State is saved in `.workflow-state.json`

### 🗂️ Organization
- Generated files stay in the same directory as the original
- Suffixes are automatically added:
  - `_converted` for conversions
  - `_audio` for extracted audio
  - `.txt` for transcriptions

### ⚡ Performance
- Video conversions can take time (depends on size)
- Audio extraction is fast
- Transcription depends on audio size and service

## Useful Commands

```bash
# Development mode (auto-reload)
npm run dev

# Compile for production
npm run build

# Simple converter (old)
npm run convert
```

## Troubleshooting

### "FFmpeg not found"
- Install FFmpeg following the README instructions
- Restart the terminal after installing

### "No API key configured"
- Run again and configure when prompted
- Or manually edit: `~/.config/ffmpeg-simple-converter/config.json`

### Transcription failed
- Check if you have credits/quota in the API
- Try the other service (Groq or OpenAI)
- Check internet connection

### File doesn't appear in the list
- Check if the extension is supported
- Make sure you're in the correct directory

## 📚 More Information

See the complete [README.md](README.md) for technical details and advanced topics.
