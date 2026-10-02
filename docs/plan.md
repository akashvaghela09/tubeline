# yt-data — Project Plan

Status: **Phase 2 done** (`channel`, `video`, `videos`) · Last updated: 2026-10-03

## 1. Goal

A terminal CLI that fetches YouTube data and media — channel details, video lists,
video metadata, transcripts, thumbnails and video/audio downloads — designed so that
**AI agents can discover and use it on their own** via `--help`, the man
page and machine-readable output.

### Non-goals (v1)

- Speech-to-text for videos without captions (Whisper) — later phase.
- Official YouTube Data API v3 backend — later phase.
- Comments, search, live chat — later phase.
- A GUI or a long-running server (an MCP server mode is planned later).

## 2. Decisions

| Topic | Decision | Why |
|---|---|---|
| Language | TypeScript | Best InnerTube client (`youtubei.js`) lives here; network-bound workload makes Rust's speed irrelevant. |
| Runtime / distribution | Bun, compiled single binary (`bun build --compile`) per OS/arch | No runtime needed on user machines; self-update is a binary swap. |
| Metadata source | InnerTube (YouTube's internal JSON API) via `youtubei.js` | Plain HTTP, no browser, fast, includes transcripts. |
| Metadata fallback | `yt-dlp --dump-json` / `--flat-playlist` | Independent second source when InnerTube parsing breaks. |
| Downloads | `yt-dlp` subprocess (+ `ffmpeg` for merging) | Most actively maintained against YouTube changes. |
| yt-dlp provisioning | System `yt-dlp` if present, else a managed binary in the data dir | Works out of the box; respects users who manage their own. |
| Browser automation | Not in v1; optional Playwright fallback later | ~300 MB Chromium is overkill for JSON endpoints. |
| CLI name | `yt-data` | |
| License | MIT | |
| Transcripts w/o captions | Not in v1 | Keep v1 small. |

## 3. Architecture

```
            ┌──────────────────────────── yt-data (Bun binary) ───────────────────────────┐
 argv ───▶  │ cli.ts ─▶ commands/*  ─▶ core (resolve, output, errors, cache, config)      │ ─▶ stdout (data)
            │                 │                                                          │ ─▶ stderr (logs/errors)
            │                 ├─▶ sources/innertube.ts  ── youtubei.js ── HTTPS ──▶ youtube.com/youtubei/v1/*
            │                 ├─▶ sources/ytdlp.ts      ── spawn ──▶ yt-dlp (system | managed) ── ffmpeg
            │                 └─▶ sources/thumbs.ts     ── HTTPS ──▶ i.ytimg.com
            │ update/*  ─▶ GitHub Releases (self + yt-dlp)                                 │
            └──────────────────────────────────────────────────────────────────────────────┘
```

### Source layout

```
src/
  cli.ts                 # entry; registers commands, global flags, exit handling
  commands/
    channel.ts videos.ts video.ts transcript.ts thumbnail.ts download.ts
    update.ts doctor.ts schema.ts docs.ts
  sources/
    innertube.ts         # wrapper around youtubei.js → our models
    ytdlp.ts             # locate/spawn yt-dlp, parse --dump-json, progress
    thumbs.ts            # direct thumbnail URL resolution + download
  core/
    resolve.ts           # parse URL / @handle / channel id / video id / playlist id
    output.ts            # json | ndjson | table | csv, --fields projection
    errors.ts            # typed errors → error codes → exit codes
    cache.ts             # on-disk TTL cache for API responses
    config.ts paths.ts   # XDG paths, config file, env vars
    http.ts              # fetch with retry/backoff, proxy, cookies
  models/                # zod schemas = single source of truth for types AND `schema` command
  update/
    self.ts ytdlp.ts check.ts
scripts/
  build-all.ts           # cross-compile release binaries + checksums
  gen-man.ts             # generate man/yt-data.1 from command definitions
tests/
  unit/                  # resolve, output, parsers (fixtures)
  fixtures/              # recorded InnerTube JSON (sanitised)
  live/                  # opt-in tests against real YouTube (YT_DATA_LIVE=1)
docs/
  plan.md  cli.md  releasing.md
```

### Dependencies (to add at implementation time)

- `youtubei.js` — InnerTube client
- `commander` — argument parsing, help generation
- `zod` (v4) — models + `z.toJSONSchema()` for the `schema` command
- dev: `@biomejs/biome`, `typescript`, `bun-types`

Keep the dependency list short; every dependency must survive `bun build --compile`.

### InnerTube notes (learned in Phase 1)

- The session is created **without** the player script (`retrieve_player: false`), saving
  ~1 s per run; the visitor session is cached in `$CACHE/innertube/` and refreshed after 3 days.
- Interface language is pinned to `hl=en` so display strings parse reliably; `--region`
  sets `gl`.
- `video` = WEB `/player` + `/next` (metadata, likes, comment count, chapters) in parallel
  with ANDROID `/player` (caption tracks and the real playability status — WEB without a
  player script always reports `UNPLAYABLE` and omits captions).
- Channel = `/browse` (header, metadata) + about panel continuation (exact counts, join
  date, country, links).
- Listings: channel tabs return `LockupView` items (Shorts: `ShortsLockupView`), 30 per
  page, with compact text ("4.7M", "2d ago"). Sort chips are labelled Latest / Popular /
  Oldest. `--type all` uses the uploads playlist `UU<channel id minus UC>` (100 per page),
  which has no sort chips. Shorts items carry no date or duration.
- youtubei.js logs parser drift to the console; it is silenced and failures are mapped to
  typed errors instead.

## 4. Command surface (v1)

Full reference with flags: [`docs/cli.md`](cli.md).

| Command | Purpose | Source |
|---|---|---|
| `channel <ref>` | Channel details | InnerTube browse (+ about panel) |
| `videos <ref>` | List a channel's videos / shorts / streams, or a playlist | InnerTube browse + continuations |
| `video <ref>` | Full metadata for one or more videos | InnerTube player + next |
| `transcript <ref>` | Captions as txt / vtt / srt / json | InnerTube transcript → yt-dlp subs |
| `thumbnail <ref>` | Download best available thumbnail | i.ytimg.com |
| `download <ref>` | Download video or audio | yt-dlp |
| `update` | Update yt-data and/or yt-dlp | GitHub Releases |
| `doctor` | Check yt-dlp, ffmpeg, network, each data source | all |
| `schema [cmd]` | Print JSON Schema of a command's output | zod models |
| `docs` | Print full markdown reference (for agents) | built-in |

`<ref>` accepts any of: full URL, `youtu.be` link, `@handle`, `UC…` channel id,
11-char video id, `PL…` playlist id. Multiple refs and `-` (read refs from stdin, one per
line) are accepted where it makes sense.

## 5. Output contract (agent-facing — treat as a public API)

1. **stdout carries data only.** Logs, progress and warnings go to stderr.
2. Default format is **JSON**. `--format ndjson|json|table|csv`. Lists stream as NDJSON
   when `--format ndjson`, so agents can process large channels incrementally.
3. `--fields a,b,c.d` projects output to just those fields (keeps agent context small).
4. Field names are camelCase, timestamps are ISO-8601 UTC, counts are integers (parsed
   from "1.2M" etc.); when a value is approximate the model says so
   (e.g. `subscriberCountText` alongside `subscriberCount`).
5. **Never prompt.** No interactive input in any code path. Missing info → error.
6. Errors: non-zero exit + one JSON line on stderr:
   `{"error":{"code":"NOT_FOUND","message":"…","hint":"…"}}`
7. Exit codes:

   | Code | Meaning |
   |---|---|
   | 0 | success |
   | 1 | unexpected / internal error |
   | 2 | invalid usage / bad input |
   | 3 | not found (video/channel/transcript) |
   | 4 | rate limited / bot check — retry later or use cookies/proxy |
   | 5 | unavailable (private, age-restricted, members-only, region) |
   | 6 | missing dependency (yt-dlp / ffmpeg) |
   | 7 | network error |
8. Output schemas are versioned with the app; breaking changes bump the minor version
   pre-1.0 and are listed in the changelog.

## 6. Data models (draft)

**Channel**: `id`, `handle`, `name`, `description`, `url`, `subscriberCount`,
`subscriberCountText`, `videoCount`, `viewCount`, `joinedAt`, `country`, `links[]`,
`avatar`, `banner`, `isVerified`, `keywords[]`.

**VideoSummary** (from listings): `id`, `url`, `title`, `durationSeconds`, `viewCount`,
`publishedText` (relative, e.g. "2 weeks ago"), `thumbnail`, `type` (video|short|live).

**Video** (full): everything in VideoSummary plus `description`, `publishedAt` (exact),
`uploadedAt`, `likeCount`, `commentCount`, `channel{id,name,handle}`, `keywords[]`,
`category`, `isLive`, `isFamilySafe`, `thumbnails[]`, `captions[]{lang,name,isAuto}`,
`chapters[]`.

**Transcript**: `videoId`, `lang`, `isAuto`, `segments[]{start,duration,text}`.

> Note: channel listings only expose relative dates. `videos --full` fetches each video's
> player response to get exact `publishedAt` — slower (one request per video), cached.

## 7. Updater

### `yt-data update`

```
yt-data update            # update both yt-data and managed yt-dlp
yt-data update --self     # only yt-data
yt-data update --yt-dlp   # only yt-dlp
yt-data update --check    # report available updates, change nothing (JSON)
yt-data update --yt-dlp-channel stable|nightly
```

**Self-update**
1. GET latest release from GitHub Releases API (`akashvaghela09/yt-data`).
2. Compare semver with the running version; stop if current.
3. Download the asset for this platform (`yt-data-<os>-<arch>[.exe]`) and `SHA256SUMS`.
4. Verify checksum; write to a temp file next to the current binary; `chmod +x`;
   atomic `rename()` over `process.execPath`. (Windows: rename running exe to `.old`,
   move new one in, delete `.old` on next start.)
5. If running from source (`bun run`) or the binary isn't writable, refuse with a hint
   instead of half-updating.

**yt-dlp update**
- **Managed copy** (`$DATA/bin/yt-dlp`): download latest standalone binary from
  `yt-dlp/yt-dlp` (or `yt-dlp/yt-dlp-nightly-builds` for nightly) releases, verify
  checksum, atomic replace. Nightly is offered because YouTube fixes land there first.
- **System copy**: don't touch it. Detect how it was installed (pip / pipx / brew / apt /
  standalone) and print the right upgrade command. If it's a standalone binary in a
  user-writable path, `yt-dlp -U` may be run with `--yes`.
- First use of `download` with no yt-dlp anywhere → error code 6 with hint
  `yt-data update --yt-dlp` (no silent downloads, no prompts).

**Update notices**
- At most once per 24 h, a background check writes a one-line notice to **stderr**, only
  when stderr is a TTY (never pollutes agent pipelines).
- Disable with `YT_DATA_NO_UPDATE_CHECK=1` or config `updateCheck: false`.

## 8. Paths, config, env

| What | Linux | macOS | Windows |
|---|---|---|---|
| Config | `~/.config/yt-data/config.json` | `~/Library/Application Support/yt-data/` | `%APPDATA%\yt-data\` |
| Cache | `~/.cache/yt-data/` | `~/Library/Caches/yt-data/` | `%LOCALAPPDATA%\yt-data\cache\` |
| Data (managed yt-dlp) | `~/.local/share/yt-data/bin/` | `~/Library/Application Support/yt-data/bin/` | `%LOCALAPPDATA%\yt-data\bin\` |

XDG variables are respected on Linux. Env vars:
`YT_DATA_CONFIG`, `YT_DATA_CACHE_DIR`, `YT_DATA_NO_CACHE`, `YT_DATA_NO_UPDATE_CHECK`,
`YT_DATA_YTDLP` (explicit yt-dlp path), `YT_DATA_COOKIES`, `YT_DATA_PROXY`,
`YT_DATA_LOG` (`error|warn|info|debug`).

Precedence: flag > env > config file > default.

## 9. Robustness

- HTTP retry with exponential backoff + jitter on 429/5xx; map persistent 429 / bot
  checks to exit code 4.
- `--cookies <file>` / `--cookies-from-browser <name>` (passed to yt-dlp; cookie file
  also used for InnerTube) for age-restricted/members-only content.
- `--proxy <url>`.
- `--concurrency` (default 4) for multi-video fetches; polite default delay.
- Cache mapped results (TTL: handle lookup 7 d, channel 6 h, video 1 h, transcript 7 d),
  tagged with the app version; `--no-cache` / `--refresh`. Listings aren't cached.
- Fallback chain per command; when a fallback is used, note it on stderr and in a
  `source` field.
- `doctor` command exercises each source so breakage is obvious.

## 10. Agent discoverability

- Exhaustive `--help` on every command, with examples.
- `man yt-data`: release ships `yt-data.1`; `yt-data docs --man` prints roff, and
  `yt-data docs --install-man` copies it to `~/.local/share/man/man1/`.
- `yt-data docs` prints the full markdown reference (same content as `docs/cli.md`).
- `yt-data schema <command>` prints JSON Schema for that command's output.
- Later: `yt-data mcp` — MCP server over stdio exposing the same commands as tools.
- Later: ship an agent skill file (`SKILL.md`) that points agents at `yt-data docs`.

## 11. Testing

- Unit tests on parsers, resolvers, output, config, HTTP retry and CLI error paths.
- Contract tests replay recorded InnerTube traffic (`tests/fixtures/innertube/*.json.gz`)
  through the real mapping code and validate results against the zod models (strict).
  Requests are matched on resource identity (endpoint, client, videoId/browseId/…), not
  volatile session fields. Re-record with `bun run scripts/record-fixtures.ts [scenario]`;
  scenarios live in `tests/helpers/scenarios.ts` and are shared with the live tests.
- Output-contract tests: every command's JSON validates against its zod schema.
- Live tests behind `YT_DATA_LIVE=1`, run nightly in CI to catch YouTube changes early.
- Smoke test the compiled binary in CI on each OS.

## 12. Release

- GitHub Actions: lint → typecheck → test → `bun build --compile` matrix:
  `linux-x64`, `linux-arm64`, `darwin-x64`, `darwin-arm64`, `windows-x64`.
- Upload binaries + `SHA256SUMS` + `yt-data.1` to the GitHub Release on tag `v*`.
- `install.sh` one-liner that downloads the right binary to `~/.local/bin`.
- Changelog in `CHANGELOG.md` (Keep a Changelog format).

## 13. Phases

| Phase | Scope | Done when |
|---|---|---|
| 0 | Scaffold: repo files, tooling, plan | ✅ |
| 1 | Core: `resolve`, `output`, `errors`, `config`, `http`; `channel`, `video` | ✅ |
| 2 | `videos` (pagination, `--limit`, `--type`, `--full`), cache | ✅ |
| 3 | `transcript` (InnerTube → yt-dlp fallback), `thumbnail` | txt/vtt/srt/json output |
| 4 | yt-dlp manager + `download`; `doctor` | Downloads 1080p + audio-only; doctor reports all deps |
| 5 | `update` (self + yt-dlp), update notices | Updates from a real GitHub Release |
| 6 | Docs: man page, `docs`, `schema`, README polish | `man yt-data` works after install |
| 7 | CI + release pipeline, `install.sh` | Tagged release installs on Linux/macOS/Windows |
| Later | search, comments, playlists CRUD, Data API v3 backend, Whisper, MCP server, Playwright fallback | — |

## 14. Risks

| Risk | Mitigation |
|---|---|
| YouTube changes InnerTube responses | Pin + quickly bump `youtubei.js`; yt-dlp fallback; nightly live tests |
| PO tokens / bot detection | Rely on yt-dlp for media; cookies + proxy support; clear exit code 4 |
| Terms of Service | Document the grey area; plan official Data API backend; polite rate limits |
| `bun --compile` incompatibilities | Keep deps minimal; CI smoke test the binary |
| Self-update corrupting the binary | Checksum + temp file + atomic rename; refuse when not writable |

## 15. Resolved questions

- Releases: GitHub `akashvaghela09/yt-data`, default branch `main`.
- License: MIT.
- `download` defaults to best available quality; cap with `--quality`.
