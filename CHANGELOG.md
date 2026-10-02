# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · Versioning: [SemVer](https://semver.org/).
Pre-1.0, breaking changes to the JSON output contract bump the minor version.

## [Unreleased]

### Added
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
