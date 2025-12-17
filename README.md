# ffmpeg-simple-converter

A simple CLI to convert audio and video files using `ffmpeg`, featuring:

- file selector (checkbox)
- ready-to-use presets (dynamic based on file type)
- runs the command and streams output to the terminal

## Requirements

- Node.js `>= 16`
- `ffmpeg` installed and available in your `PATH`

Quick check:

```sh
ffmpeg -version
```

## Usage

### Via npx (from any folder)

```sh
npx ffmpeg-simple-converter
```

This opens a selector to pick files from the current folder and then choose the appropriate preset.

### Run locally (in this repo)

```sh
npm install
npm run convert
```

## Supported types

The script only lists and allows selecting files with supported extensions.

- Audio: `.ogg`, `.wav`, `.mp3`, `.m4a`, `.aac`, `.flac`
- Video: `.mp4`, `.mov`, `.mkv`, `.webm`, `.avi`

## Available presets

Presets are built dynamically based on the detected type (audio or video). If you select mixed files (audio + video), the script will ask for one preset per type.

### Audio → MP3 (good quality)

```sh
ffmpeg -hide_banner -n -i input.ogg -c:a libmp3lame -q:a 2 output.mp3
```

### Audio → MP3 (smaller)

```sh
ffmpeg -hide_banner -n -i input.ogg -c:a libmp3lame -q:a 5 output.mp3
```

### Video → MP4 1080p (reasonable/smaller)

```sh
ffmpeg -hide_banner -n -i input.mp4 \
	-vf "scale='min(1080,iw)':-2" \
	-c:v libx264 -profile:v baseline -level 3.1 \
	-preset medium -crf 28 -r 30 \
	-c:a aac -b:a 128k \
	-movflags +faststart \
	output.mp4
```

### Video → MP4 1080p (better/larger)

```sh
ffmpeg -hide_banner -n -i input.mp4 \
	-vf "scale='min(1080,iw)':-2" \
	-c:v libx264 -profile:v baseline -level 3.1 \
	-preset slow -crf 23 -r 30 \
	-c:a aac -b:a 128k \
	-movflags +faststart \
	output.mp4
```

## Notes

- The script uses `-n` (do not overwrite). If the output name already exists, it generates an alternative name with a suffix.
- If the output extension matches the input extension (e.g. `.mp3` → `.mp3`), the script uses a `_converted` suffix to avoid collisions.