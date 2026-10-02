# yt-data — CLI Reference

> Draft spec for v1. Commands are implemented per the phases in [`plan.md`](plan.md).
> This file is also what `yt-data docs` prints, so keep it accurate and example-heavy.

## Synopsis

```
yt-data <command> [options] [refs...]
```

`ref` = video/channel/playlist URL, `youtu.be/<id>`, `@handle`, `UC…` channel id,
11-char video id, or `PL…` playlist id. Use `-` to read refs from stdin (one per line).

## Global options

| Option | Default | Description |
|---|---|---|
| `-f, --format <fmt>` | `json` | `json`, `ndjson`, `table`, `csv` |
| `--fields <list>` | all | Comma-separated fields to keep, dot paths allowed (`channel.name`) |
| `--no-cache` | | Don't read or write the cache |
| `--refresh` | | Skip cached values but write fresh ones |
| `--cookies <file>` | | Netscape cookies.txt for age-restricted / members-only content |
| `--cookies-from-browser <name>` | | `chrome`, `firefox`, `brave`, … (passed to yt-dlp) |
| `--proxy <url>` | | HTTP/SOCKS proxy |
| `--lang <code>` | `en` | Interface language for InnerTube (affects text like "views") |
| `--region <code>` | `US` | Content region |
| `-q, --quiet` | | Suppress stderr logs (errors still printed) |
| `-v, --verbose` | | Debug logs to stderr |
| `-V, --version` | | Print version |
| `-h, --help` | | Help for any command |

## Commands

### `channel <ref...>`

Channel details.

```
yt-data channel @mkbhd
yt-data channel https://www.youtube.com/@mkbhd --fields name,subscriberCount,videoCount
```

### `videos <ref>`

List videos for a channel or playlist.

| Option | Default | Description |
|---|---|---|
| `--type <t>` | `videos` | `videos`, `shorts`, `streams`, `all` |
| `--sort <s>` | `newest` | `newest`, `popular`, `oldest` |
| `-n, --limit <n>` | `50` | Max items; `0` = all |
| `--since <date>` | | Stop at videos older than this (ISO date or `30d`); implies exact dates |
| `--full` | | Fetch full metadata per video (exact `publishedAt`, likes, description). Slower. |

```
yt-data videos @mkbhd --limit 10 --fields id,title,viewCount
yt-data videos @mkbhd --limit 0 --format ndjson > all.ndjson
yt-data videos PLxxxxxxxx --full
```

### `video <ref...>`

Full metadata for one or more videos.

```
yt-data video dQw4w9WgXcQ
cat ids.txt | yt-data video - --format ndjson
```

### `transcript <ref>`

| Option | Default | Description |
|---|---|---|
| `-l, --lang <code>` | `en` | Preferred caption language; falls back to auto-generated, then first available |
| `--prefer <p>` | `manual` | `manual` or `auto` |
| `--as <fmt>` | `json` | `json`, `txt`, `vtt`, `srt` |
| `--list` | | List available caption tracks instead |
| `-o, --output <path>` | stdout | Write to a file |

```
yt-data transcript dQw4w9WgXcQ --as txt
yt-data transcript dQw4w9WgXcQ --list
```

### `thumbnail <ref...>`

| Option | Default | Description |
|---|---|---|
| `--quality <q>` | `best` | `best`, `maxres`, `sd`, `hq`, `mq`, `default` (falls back if missing) |
| `-o, --output <dir>` | `.` | Output directory; files named `<id>.jpg` |
| `--url-only` | | Print the URL, don't download |

### `download <ref...>`

Wraps yt-dlp.

| Option | Default | Description |
|---|---|---|
| `--quality <q>` | `best` | `best`, `2160p`, `1440p`, `1080p`, `720p`, `480p`, `audio` |
| `--audio-format <f>` | `m4a` | When `--quality audio`: `m4a`, `mp3`, `opus` |
| `-o, --output <dir>` | `.` | Output directory |
| `--template <tpl>` | `%(title)s [%(id)s].%(ext)s` | yt-dlp output template |
| `--with-subs` | | Also write subtitles |
| `--with-thumbnail` | | Also write thumbnail |
| `--yt-dlp-args <args>` | | Extra raw args passed through to yt-dlp |

Prints one JSON object per finished file: `{id, path, format, sizeBytes}`.
Progress goes to stderr.

### `update`

| Option | Description |
|---|---|
| `--self` | Only update yt-data |
| `--yt-dlp` | Only update (or install) the managed yt-dlp |
| `--check` | Report available updates as JSON; change nothing |
| `--yt-dlp-channel <c>` | `stable` (default) or `nightly` |

A system-installed yt-dlp is never modified; the command prints the right upgrade
command for how it was installed.

### `doctor`

Checks yt-dlp (path, version, managed/system), ffmpeg, network, and runs a tiny request
against each data source. Exit 0 if everything required is OK.

### `schema [command]`

Prints the JSON Schema of a command's output (e.g. `yt-data schema video`). Without an
argument, lists commands that have schemas.

### `docs`

| Option | Description |
|---|---|
| (none) | Print this reference as markdown |
| `--man` | Print the man page (roff) |
| `--install-man` | Install the man page to `~/.local/share/man/man1/` |

## Output and errors

- Data → stdout. Logs, progress, warnings → stderr.
- Errors → non-zero exit and one JSON line on stderr:
  `{"error":{"code":"NOT_FOUND","message":"Video dQw4w9WgXcX not found","hint":null}}`

| Exit | Code | Meaning |
|---|---|---|
| 0 | — | success |
| 1 | `INTERNAL` | unexpected error |
| 2 | `USAGE` | invalid arguments / unparseable ref |
| 3 | `NOT_FOUND` | video/channel/transcript doesn't exist |
| 4 | `RATE_LIMITED` | 429 or bot check; retry later, use `--cookies` / `--proxy` |
| 5 | `UNAVAILABLE` | private, age-restricted, members-only, region-blocked |
| 6 | `MISSING_DEPENDENCY` | yt-dlp / ffmpeg not found |
| 7 | `NETWORK` | connection failure |

## Environment

`YT_DATA_CONFIG`, `YT_DATA_CACHE_DIR`, `YT_DATA_NO_CACHE`, `YT_DATA_NO_UPDATE_CHECK`,
`YT_DATA_YTDLP`, `YT_DATA_COOKIES`, `YT_DATA_PROXY`, `YT_DATA_LOG`.
Precedence: flag > env > config file > default.
