import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

/**
 * Makes ffmpeg/ffprobe resolvable when the app is launched from the Dock,
 * Finder or Spotlight on macOS (and from a desktop launcher on Linux).
 *
 * GUI apps started that way inherit launchd's minimal PATH
 * (`/usr/bin:/bin:/usr/sbin:/sbin`), not the user's shell PATH, so a Homebrew
 * ffmpeg under `/opt/homebrew/bin` is invisible. Launching via `open -a` from
 * a terminal happens to work only because it inherits the terminal's PATH —
 * which is why the bug looks intermittent.
 *
 * Every ffmpeg call in the app (`getFfmpegStatus`, mediacript's `spawn('ffmpeg')`
 * and `spawn('ffprobe')`, `meetingAudio.ts`) resolves the binary by bare name
 * through `process.env.PATH`, so patching that once at startup fixes all of
 * them without threading an explicit binary path through the library.
 *
 * Must run before any IPC handler is registered.
 */
export function fixShellPath(): void {
  if (process.platform === 'win32') return

  const current = process.env.PATH ?? ''
  const entries = new Set(current.split(path.delimiter).filter(Boolean))

  // Deterministic first: the well-known install locations. Cheap and covers
  // the vast majority of users without spawning anything.
  const home = os.homedir()
  const wellKnown = [
    '/opt/homebrew/bin', // Homebrew on Apple Silicon
    '/opt/homebrew/sbin',
    '/usr/local/bin', // Homebrew on Intel, manual installs
    '/usr/local/sbin',
    '/opt/local/bin', // MacPorts
    path.join(home, '.local', 'bin'),
    path.join(home, 'bin'),
    '/home/linuxbrew/.linuxbrew/bin',
    '/snap/bin'
  ]

  // Then whatever the user's login shell actually exports (nvm, asdf, custom
  // ffmpeg builds in odd places...). Best-effort with a short timeout: a slow
  // or broken shell rc must never block app startup.
  for (const dir of loginShellPath()) entries.add(dir)

  for (const dir of wellKnown) {
    if (fs.existsSync(dir)) entries.add(dir)
  }

  process.env.PATH = [...entries].join(path.delimiter)
}

function loginShellPath(): string[] {
  const shell = process.env.SHELL || '/bin/zsh'
  try {
    // `-il` so both profile (.zprofile, where `brew shellenv` usually lives)
    // and rc files run. The sentinel isolates PATH from any rc noise
    // (motd, prompts, warnings).
    const output = execFileSync(shell, ['-ilc', 'printf "__MC_PATH__%s__MC_PATH__" "$PATH"'], {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, DISABLE_AUTO_UPDATE: 'true' }
    })
    const match = output.match(/__MC_PATH__(.*?)__MC_PATH__/s)
    return match ? match[1].split(path.delimiter).filter(Boolean) : []
  } catch {
    return []
  }
}
