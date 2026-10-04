# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · Versioning: [SemVer](https://semver.org/).
Pre-1.0, breaking changes to the JSON output contract bump the minor version.

## [Unreleased]

## [0.4.0] - 2026-10-04

### Changed
- **Renamed to `tubeline`** (repository `akashvaghela09/tubeline`). The command is now
  `tubeline`; environment variables are `TUBELINE_*` (e.g. `TUBELINE_CONFIG`,
  `TUBELINE_YTDLP`, `TUBELINE_THEME`); config, cache and data live in `~/.config/tubeline`,
  `~/.cache/tubeline` and `~/.local/share/tubeline`; release assets are `tubeline-<os>-<arch>`
  and the man page is `tubeline(1)`. Earlier binaries can't self-update across the rename —
  reinstall with `install.sh`.
- Downloads in the interactive app: one status line above the footer (a single download
  shows its name and progress; several show overall progress), a solid smooth progress
  bar, fixed columns and fixed-width stage words; `Ctrl+O` shows a table of all downloads
  with a detail card for the selected one (stage strip, large bar, size/speed/time, what
  and where, full error with hint).

### Fixed
- Download progress stuck at 80% for fragmented (HLS/DASH) streams: yt-dlp's first size
  estimate can equal the bytes already received ("712 of ~712 bytes"), which read as the
  video stream being complete and locked the forward-only bar. Progress now follows the
  fragment counter (fragment N of M) when available, estimates alone never reach 100%
  before the stream finishes, and estimated sizes are shown as `~138 MB`.
- Thumbnails: YouTube answers some missing sizes with a 120px grey placeholder instead of
  a 404; those are now skipped so the best real size is saved (maxres → sd → hq → mq →
  default). Thumbnails saved from the app are named `Title [id].jpg`.

## [0.3.0] - 2026-10-03

### Changed
- **New interactive app** (`tubeline` / `tubeline ui`), rebuilt as a full-screen UI on
  OpenTUI, following a UX review of 0.2.0:
  - Home is one input for links, @handles, ids and searches, with recent items.
  - Video screen shows captions, best quality with estimated size and whether it's already
    downloaded; single-key actions with remembered defaults (`d`, `a`, `t`, `i`, `c`).
  - Channel/playlist/search lists show length, views and age in columns, with `/` filter,
    `space` multi-select, bulk actions, tabs, automatic paging, and kept position on return.
  - Downloads run in a background queue with a live panel: one monotonic bar across video,
    audio and merge/convert, with size, speed, ETA and stage; cancel removes partial files.
  - Readable transcript view with save and language switch; settings screen; downloads list
    with cancel/retry; setup check and update from anywhere; session summary on exit.
  - Folder prompts accept new folders (created on confirm); outdated yt-dlp is detected on
    download failure with an update offer.
- `download` shows one progress line (size, speed, ETA, stage) on stderr at a terminal.
- `doctor` reports whether the interactive UI's native renderer loads.

### Added
- `video` output: `qualities[]` — available qualities with estimated download size.

- After a second (visual) review: one download key — `d`/`a` open a download panel
  prefilled with your defaults (`Enter` downloads; quality/format/folder change in place;
  "make these my defaults" is explicit), replacing `D`/`A`.
- Themes: Auto (matches the terminal's light/dark background), Night, Day, Gruvbox,
  Solarized Light, High contrast, plus Catppuccin Mocha, Nord, Dracula, GitHub Light;
  live preview in Settings; `--theme` / `TUBELINE_THEME`.
- Footer hints never cut mid-word and end with `? keys` (full key reference). Header shows
  where you are and `↓ N running`. Lists keep fixed columns, 3-significant-digit counts,
  a full-width cursor and a separate channel column in search.
- Folder picker: resolved path, "will be created", recent folders, Tab completion.
- `Ctrl+C` returns to Home and quits only from Home; `Backspace` goes back outside text
  fields; `←`/`→` switch tabs (and the search type on an empty Home input).
- Remembered folders that no longer exist fall back to the Downloads folder.

### Removed
- The 0.2.0 prompt-based menus (@clack/prompts).

## [0.2.0] - 2026-10-03

### Added
- Interactive menus: `tubeline ui`, or plain `tubeline` at a terminal. Open a link or search,
  then download video/audio with a progress bar, view or save transcripts, download
  thumbnails, browse channels and playlists (type to filter, load more), bulk actions on
  several videos, update and doctor. Remembers download folder, quality and formats;
  downloads default to the Downloads folder.
- `tubeline search <query>`: videos, shorts, channels or playlists with sort, duration,
  upload-date and feature filters, following result pages.
- `--json` global flag.
- Readable `human` output format with colors (respects `NO_COLOR`).

### Changed
- **Breaking:** at a terminal, commands now print readable output by default and errors
  as `✗ message` / `→ hint`. JSON is unchanged and remains the default whenever stdout is
  not a terminal; use `--json` (or `--format json`) to force it.
- At a terminal without `-o`, `transcript` shows a readable transcript instead of JSON.
- Download logic moved into a shared service used by both `download` and the menus.

## [0.1.1] - 2026-10-03

### Fixed
- `transcript` reported "has no captions" (exit 3) when YouTube had actually bot-checked
  or age-gated the request; it now exits 4 / 5 with the reason.
- The daily update notice now also appears after commands that don't contact YouTube
  (`schema`, `docs`).

## [0.1.0] - 2026-10-03

### Added
- `tubeline schema [name]`: JSON Schemas (draft 2020-12) for every output shape.
- `tubeline docs`: embedded markdown reference; `--man` / `--install-man` man page generated
  from the command definitions; releases ship `tubeline.1` and `install.sh` installs it.
- `tubeline download <refs...>`: video/audio downloads via yt-dlp with quality caps,
  mp3/opus/m4a audio, subtitles, thumbnails, custom templates and pass-through args;
  JSON record per file, progress on stderr only at a terminal.
- `tubeline update`: verified, atomic self-update from GitHub Releases and managed yt-dlp
  install/update (stable or nightly), `--check`; daily update notice on interactive stderr.
- `tubeline doctor`: dependency, cache and per-source health checks, stale yt-dlp warning.
- `--cookies-from-browser` (yt-dlp only).
- `tubeline transcript <refs...>`: captions as json / txt / vtt / srt, language and
  manual/auto selection, `--list`, `--timestamps`, `-o` file or directory, yt-dlp fallback.
- `tubeline thumbnail <refs...>`: best-available thumbnail download or `--url-only`.
- `tubeline videos <ref>`: list a channel's videos / shorts / streams / all uploads, or a
  playlist, with pagination, `--limit`, `--sort newest|popular|oldest`, `--since`, `--full`
  (full metadata per video) and NDJSON streaming.
- Result cache with per-kind TTLs; `--refresh` to bypass reads.
- `tubeline channel <refs...>`: channel details (handle, counts, join date, country, links,
  avatar, banner, keywords).
- `tubeline video <refs...>`: full video metadata (counts, exact publish date, channel,
  captions list, chapters, thumbnails, playability).
- Ref parsing for watch / youtu.be / shorts / live / embed URLs, `@handle`, `/c/`, `/user/`,
  `UC…` and video ids; `-` reads refs from stdin.
- Output formats `json` (default), `ndjson`, `table`, `csv`; `--fields` dot-path projection.
- Typed JSON errors on stderr with stable exit codes; config file + env vars
  (`TUBELINE_CONFIG`, `TUBELINE_CACHE_DIR`, `TUBELINE_NO_CACHE`, `TUBELINE_COOKIES`,
  `TUBELINE_PROXY`, `TUBELINE_LOG`); `--region`, `--cookies`, `--proxy`, `--no-cache`.
- HTTP retries with backoff for 429/5xx and network errors.
- Offline contract tests from recorded InnerTube fixtures; opt-in live tests.
- Project scaffold: README, plan, CLI spec, release guide, MIT license.
- Tooling: Bun, TypeScript, Biome; CI, nightly live-test and release workflows; `install.sh`.

[Unreleased]: https://github.com/akashvaghela09/tubeline/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/akashvaghela09/tubeline/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/akashvaghela09/tubeline/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/akashvaghela09/tubeline/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/akashvaghela09/tubeline/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/akashvaghela09/tubeline/releases/tag/v0.1.0
