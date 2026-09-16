# Mediacript (CLI & library)

Powerful and flexible CLI **and Node.js library** for converting videos/audio and AI transcription, working on Linux, Mac, and Windows.

> This is the `mediacript` npm package — one of the two products in the
> [Mediacript monorepo](https://github.com/igortrinidad/mediacript), living in `packages/cli`.
> Prefer a graphical interface? See [Mediacript Desktop](../desktop/README.md), which is built
> on top of this package.

## 🌟 Features

- ✅ **Cross-platform**: Works on Linux, macOS, and Windows
- 📦 **CLI & Library**: Use as command-line tool or Node.js library
- 🔄 **Multi-Step Workflow**: Combine multiple operations in a single flow
- 🎙️ **AI Transcription**: Support for Groq (fast) and OpenAI Whisper
- 📝 **Subtitles with timeline**: Generate `.srt` files from the transcription timeline
- ✨ **AI-powered highlight clips**: Describe what you're looking for and let an LLM (Anthropic, Gemini or OpenRouter) pick the best moments — then cut one clip per highlight automatically
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

### As CLI (global)

```bash
npx mediacript
```

### From this repository (development)

```bash
git clone https://github.com/igortrinidad/mediacript.git
cd mediacript/packages/cli
npm install
npm start
```

### As Library (in your Node.js project)

```bash
npm install mediacript
```

## 💡 Usage

### As a Node.js Library

MediaScript can be used programmatically in your Node.js applications:

```javascript
import { processVideo, transcribeAudioFile } from 'mediacript'

// Process a complete video
const result = await processVideo('video.mp4')
console.log('Transcription:', result.transcription.text)

// Or just transcribe an audio file
const transcription = await transcribeAudioFile('audio.mp3')
console.log(transcription.text)
```

**📚 [Complete Library Documentation](./LIBRARY_USAGE.md)** - Learn about all available functions, workflows, and examples.

**📖 [Examples Directory](./examples/)** - Practical examples including:
- Basic transcription
- Complete workflows
- Batch processing
- Express.js API
- TypeScript usage

### Interactive CLI Mode (Recommended)

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
- **Extract subtitles with timeline (.srt)**: Transcribe and save a subtitle file with the full timeline
- **Generate AI highlight clips**: Transcribe, describe what you're looking for in plain text, and let an LLM (Anthropic, Gemini or OpenRouter) select the best moments — one `.mp4` clip is cut per highlight

#### For Audio 🎵
- **Convert audio + Transcribe**: Convert and transcribe
- **Only transcribe audio**: Direct transcription
- **Only convert audio**: Convert to MP3
- **Extract subtitles with timeline (.srt)**: Transcribe and save a subtitle file with the full timeline

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

### AI Highlight Clips — Provider & Model

The "Generate AI highlight clips" workflow needs an LLM to read the transcript timeline and pick the
best moments. When you pick this workflow the CLI asks you to choose:

1. A **provider**: Anthropic (Claude), Google (Gemini), OpenRouter, OpenAI or Groq
2. A **model** from a curated list for that provider (or type a custom model id)
3. Its **API key** — if it isn't configured yet, you're prompted for it right there and it gets saved
   for next time in the same config file

Choosing **OpenAI** or **Groq** here reuses the exact same API key already configured for Whisper
transcription — no extra setup needed if you've already configured one of those for transcription.
Anthropic, Gemini and OpenRouter each use their own key.

You can reconfigure any of these keys at any point — just pick the highlights workflow again and enter
a new key when prompted.

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
packages/cli/
├── src/
│   ├── ai/          # LLM provider abstraction (Anthropic, Gemini, OpenRouter, OpenAI, Groq)
│   ├── cli/         # Interactive prompts and the configuration wizard
│   ├── config/      # Configuration and API keys management
│   ├── highlights/  # AI highlight-selection from a transcript timeline
│   ├── subtitles/   # SRT subtitle generation
│   ├── transcript/  # Transcription modules (Groq and OpenAI)
│   ├── types/       # TypeScript definitions
│   ├── utils/       # Utilities (ffmpeg, files, export formats, etc)
│   ├── workflow/    # Workflow management system
│   ├── index.ts     # CLI entrypoint
│   └── lib.ts       # Public library surface (what `import ... from "mediacript"` gives you)
├── tests/           # Jest suite (unit + performance)
├── examples/        # Runnable examples of the library API
├── scripts/
│   ├── install-mac.mjs # `npx mediacript install-mac` — ships with the published package
│   └── smoke/          # Post-build checks that the ESM/CJS/type surfaces load
├── cli.mjs          # bin: mediacript
└── convert.js       # bin: mediacript-convert (legacy standalone converter)
```

## 🔧 Available Scripts

Run these from `packages/cli` (or from the repo root via `npm run cli`, `npm run cli:build`,
`npm run cli:test`):

```bash
npm start                # Run the interactive CLI from source
npm run build            # Compile TypeScript to dist/ (ESM + CJS)
npm run dev              # Development mode with watch
npm run convert          # Run the legacy converter (convert.js)
npm test                 # Full Jest suite
npm run test:coverage    # Jest with a coverage report
npm run smoke:esm        # Check the built ESM entrypoint imports (needs npm run build first)
npm run smoke:cjs        # Check the built CJS entrypoint requires
npm run smoke:types      # Check every documented export exists in src/lib.ts
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
    "transcriptionText": "video_audio.txt",
    "subtitlesFile": "video.srt",
    "highlightClips": ["video_cut.mp4", "video_cut_1.mp4"]
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
