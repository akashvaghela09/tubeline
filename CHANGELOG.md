# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · Versioning: [SemVer](https://semver.org/).
Pre-1.0, breaking changes to the JSON output contract bump the minor version.

## [Unreleased]

## [0.3.0] - 2026-10-03

### Changed
- **New interactive app** (`yt-data` / `yt-data ui`), rebuilt as a full-screen UI on
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

### Removed
- The 0.2.0 prompt-based menus (@clack/prompts).

## [0.2.0] - 2026-10-03

### Added
- Interactive menus: `yt-data ui`, or plain `yt-data` at a terminal. Open a link or search,
  then download video/audio with a progress bar, view or save transcripts, download
  thumbnails, browse channels and playlists (type to filter, load more), bulk actions on
  several videos, update and doctor. Remembers download folder, quality and formats;
  downloads default to the Downloads folder.
- `yt-data search <query>`: videos, shorts, channels or playlists with sort, duration,
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
- `yt-data schema [name]`: JSON Schemas (draft 2020-12) for every output shape.
- `yt-data docs`: embedded markdown reference; `--man` / `--install-man` man page generated
  from the command definitions; releases ship `yt-data.1` and `install.sh` installs it.
- `yt-data download <refs...>`: video/audio downloads via yt-dlp with quality caps,
  mp3/opus/m4a audio, subtitles, thumbnails, custom templates and pass-through args;
  JSON record per file, progress on stderr only at a terminal.
- `yt-data update`: verified, atomic self-update from GitHub Releases and managed yt-dlp
  install/update (stable or nightly), `--check`; daily update notice on interactive stderr.
- `yt-data doctor`: dependency, cache and per-source health checks, stale yt-dlp warning.
- `--cookies-from-browser` (yt-dlp only).
- `yt-data transcript <refs...>`: captions as json / txt / vtt / srt, language and
  manual/auto selection, `--list`, `--timestamps`, `-o` file or directory, yt-dlp fallback.
- `yt-data thumbnail <refs...>`: best-available thumbnail download or `--url-only`.
- `yt-data videos <ref>`: list a channel's videos / shorts / streams / all uploads, or a
  playlist, with pagination, `--limit`, `--sort newest|popular|oldest`, `--since`, `--full`
  (full metadata per video) and NDJSON streaming.
- Result cache with per-kind TTLs; `--refresh` to bypass reads.
- `yt-data channel <refs...>`: channel details (handle, counts, join date, country, links,
  avatar, banner, keywords).
- `yt-data video <refs...>`: full video metadata (counts, exact publish date, channel,
  captions list, chapters, thumbnails, playability).
- Ref parsing for watch / youtu.be / shorts / live / embed URLs, `@handle`, `/c/`, `/user/`,
  `UC…` and video ids; `-` reads refs from stdin.
- Output formats `json` (default), `ndjson`, `table`, `csv`; `--fields` dot-path projection.
- Typed JSON errors on stderr with stable exit codes; config file + env vars
  (`YT_DATA_CONFIG`, `YT_DATA_CACHE_DIR`, `YT_DATA_NO_CACHE`, `YT_DATA_COOKIES`,
  `YT_DATA_PROXY`, `YT_DATA_LOG`); `--region`, `--cookies`, `--proxy`, `--no-cache`.
- HTTP retries with backoff for 429/5xx and network errors.
- Offline contract tests from recorded InnerTube fixtures; opt-in live tests.
- Project scaffold: README, plan, CLI spec, release guide, MIT license.
- Tooling: Bun, TypeScript, Biome; CI, nightly live-test and release workflows; `install.sh`.

[Unreleased]: https://github.com/akashvaghela09/yt-data/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/akashvaghela09/yt-data/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/akashvaghela09/yt-data/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/akashvaghela09/yt-data/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/akashvaghela09/yt-data/releases/tag/v0.1.0
