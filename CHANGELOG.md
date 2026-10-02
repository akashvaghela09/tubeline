# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · Versioning: [SemVer](https://semver.org/).
Pre-1.0, breaking changes to the JSON output contract bump the minor version.

## [Unreleased]

### Fixed
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

[Unreleased]: https://github.com/akashvaghela09/yt-data/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/akashvaghela09/yt-data/releases/tag/v0.1.0
