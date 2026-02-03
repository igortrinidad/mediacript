# FFmpeg Simple Converter

Powerful and flexible CLI for converting videos/audio and AI transcription, working on Linux, Mac, and Windows.

## 🌟 Features

- ✅ **Cross-platform**: Works on Linux, macOS, and Windows
- 🔄 **Multi-Step Workflow**: Combine multiple operations in a single flow
- 🎙️ **AI Transcription**: Support for Groq (fast) and OpenAI Whisper
- 💾 **State Management**: Saves progress of each workflow step
- 🔑 **Persistent Configuration**: API keys saved locally and securely
- 📊 **Visual Progress**: Track each step of the process

## 📋 Requirements

- **Node.js** `>= 16`
- **FFmpeg** installed and available in PATH

### Installing FFmpeg

#### Windows
```bash
# With Chocolatey
choco install ffmpeg

# With Scoop
scoop install ffmpeg
```

#### macOS
```bash
brew install ffmpeg
```

#### Linux
```bash
# Ubuntu/Debian
sudo apt update && sudo apt install ffmpeg

# Fedora
sudo dnf install ffmpeg

# Arch Linux
sudo pacman -S ffmpeg
```

Verify installation:
```bash
ffmpeg -version
```

## 🚀 Installation

```bash
npm install
```

## 💡 Usage

### Interactive Mode (Recommended)

```bash
npm start
```

The CLI will:
1. ✅ Check if FFmpeg is installed
2. 🔑 Request API keys on first run (optional)
3. 📁 List media files in the current directory
4. 🎯 Allow you to choose the desired workflow

### Available Workflows

#### For Videos 🎬
- **Convert video + Extract audio + Transcribe**: Complete pipeline
- **Extract audio from video + Transcribe**: To transcribe videos
- **Only convert video**: Optimize video (H.264/AAC)
- **Only extract audio from video**: Extract audio as MP3

#### For Audio 🎵
- **Convert audio + Transcribe**: Convert and transcribe
- **Only transcribe audio**: Direct transcription
- **Only convert audio**: Convert to MP3

## 🔑 API Keys Configuration

### First Run

The first time you run it, you'll be asked if you want to configure your API keys:

```
⚠️  No API key found.
? Do you want to configure your API keys now? (Y/n)

🔑 Configure your API keys (optional - press Enter to skip)

? Groq API Key (recommended - faster): sk-proj-...
? OpenAI API Key: sk-...
```

### Where Keys Are Saved

- **Linux/Mac**: `~/.config/ffmpeg-simple-converter/config.json`
- **Windows**: `%APPDATA%/ffmpeg-simple-converter/config.json`

### Getting API Keys

#### Groq (Recommended - Faster and Cheaper)
1. Visit: https://console.groq.com
2. Create a free account
3. Generate an API key in "API Keys"

#### OpenAI
1. Visit: https://platform.openai.com
2. Create an account
3. Add credits
4. Generate an API key in "API Keys"

### Transcription Priority

The system automatically tries in the following order:
1. **Groq** (if configured) - faster and cheaper
2. **OpenAI** (fallback) - if Groq fails or is not configured

## 📊 Usage Example

```bash
$ npm start

🎬 FFmpeg Simple Converter - Multi-Step Workflow

✓ FFmpeg is installed (version: 6.0)

📁 Found 3 media file(s)

? Select file:
  🎬 lecture_video.mp4
❯ 🎵 podcast.mp3
  🎬 presentation.mkv

? Select what you want to do:
❯ 🎬 Convert video + Extract audio + Transcribe
  🎬 Extract audio from video + Transcribe
  🎵 Convert audio + Transcribe
  🎙️  Only transcribe audio

🚀 Starting workflow: Convert video + Extract audio + Transcribe
📁 Input file: lecture_video.mp4

[1/3] Convert video...
🎬 Converting video to optimized format...
✓ Video converted: lecture_video_converted.mp4

[2/3] Extract audio...
🎵 Extracting audio from video...
✓ Audio extracted: lecture_video_converted_audio.mp3

[3/3] Transcribe audio...
🎙️  Transcribing: lecture_video_converted_audio.mp3
📡 Trying Groq Whisper (fast)...
✓ Transcription completed with Groq
✓ Transcription saved: lecture_video_converted_audio.txt

📊 Workflow Progress:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ 1. Convert video (12.3s)
✓ 2. Extract audio (3.1s)
✓ 3. Transcribe audio (8.7s)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 Generated files:
  • Video: lecture_video_converted.mp4
  • Audio: lecture_video_converted_audio.mp3
  • Transcription: lecture_video_converted_audio.txt
```

## 🗂️ Project Structure

```
src/
├── config/          # Configuration and API keys management
├── transcript/      # Transcription modules (Groq and OpenAI)
├── types/           # TypeScript definitions
├── utils/           # Utilities (ffmpeg, files, etc)
├── workflow/        # Workflow management system
└── index.ts         # Main CLI
```

## 🔧 Available Scripts

```bash
npm start           # Run the interactive CLI
npm run build       # Compile TypeScript to JavaScript
npm run dev         # Development mode with watch
npm run convert     # Run the old converter (convert.js)
```

## 📦 Supported Formats

### Audio
`.ogg`, `.wav`, `.mp3`, `.m4a`, `.aac`, `.flac`

### Video
`.mp4`, `.mov`, `.mkv`, `.webm`, `.avi`

## 🛠️ State Management

Each workflow saves its state to `.workflow-state.json` in the output directory:

```json
{
  "steps": [
    {
      "id": "step-0",
      "name": "Convert video",
      "status": "completed",
      "startTime": 1675436400000,
      "endTime": 1675436412300
    }
  ],
  "intermediateFiles": {
    "convertedVideo": "video_converted.mp4",
    "extractedAudio": "video_audio.mp3",
    "transcriptionText": "video_audio.txt"
  }
}
```

## 🤝 Contributing

Contributions are welcome! Feel free to open issues and pull requests.

## 📄 License

MIT

## 🙏 Acknowledgments

- FFmpeg for the amazing tool
- OpenAI and Groq for transcription services
