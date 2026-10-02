# yt-data — CLI Reference

> This file is also what `yt-data docs` prints, so keep it accurate and example-heavy.
>
> **Implemented:** `channel`, `video`, `videos`, `transcript`, `thumbnail`. Sections marked _(planned)_ are the v1 spec and
> land per the phases in [`plan.md`](plan.md).

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
| `--no-cache` | | Don't read or write cached data |
| `--refresh` | | Ignore cached results but store fresh ones |
| `--cookies <file>` | | Netscape cookies.txt for age-restricted / members-only content |
| `--cookies-from-browser <name>` | | _(planned, with `download`)_ `chrome`, `firefox`, … (passed to yt-dlp) |
| `--proxy <url>` | | HTTP/SOCKS proxy |
| `--region <code>` | `US` | Content region (2-letter country code) |
| `-q, --quiet` | | Suppress stderr logs (errors still printed) |
| `-v, --verbose` | | Debug logs to stderr |
| `-V, --version` | | Print version |
| `-h, --help` | | Help for any command |

## Commands

### `channel <ref...>`

Channel details. Accepts `@handle`, channel URLs (`/@handle`, `/channel/UC…`, `/c/name`,
`/user/name`) and `UC…` ids.

Fields: `id`, `handle`, `name`, `description`, `url`, `subscriberCount`,
`subscriberCountText`, `videoCount`, `viewCount`, `joinedAt` (YYYY-MM-DD), `country`,
`isVerified`, `isFamilySafe`, `keywords[]`, `links[]{title,url}`, `avatar{url,width,height}`,
`banner{…}`, `rssUrl`.

```
yt-data channel @mkbhd
yt-data channel https://www.youtube.com/@mkbhd --fields name,subscriberCount,videoCount
yt-data channel @mkbhd @LinusTechTips --format table --fields name,subscriberCount
```

### `videos <ref>`

List videos from a channel tab or a playlist, following pagination. `<ref>` is a channel
(`@handle`, URL, `UC…`) or a playlist (`PL…`, playlist URL).

| Option | Default | Description |
|---|---|---|
| `-t, --type <t>` | `videos` | `videos`, `shorts`, `streams`, or `all` (every upload, newest first) |
| `-s, --sort <s>` | `newest` | `newest`, `popular`, `oldest` (channel tabs only; availability varies per tab) |
| `-n, --limit <n>` | `50` | Max items; `0` = all |
| `--since <when>` | | Stop at videos older than this: ISO date or `30d`, `12w`, `6mo`, `1y`. Newest-first only |
| `--full` | | Emit full `video` objects (exact `publishedAt`, likes, description, …); one request per video, cached |
| `--concurrency <n>` | `4` | Parallel requests for `--full` |

Item fields (without `--full`): `id`, `url`, `title`, `type` (`video`/`short`/`stream`, or
`null` for `--type all` and playlists), `durationSeconds`, `viewCount` (approximate) +
`viewCountText`, `publishedText` (e.g. "2d ago"), `publishedAtApprox`, `isLive`,
`isUpcoming`, `isMembersOnly`, `thumbnail`, `channelName` (playlists only).

Notes:
- Output is always a list: a JSON array, or one object per line with `--format ndjson`
  (streamed as pages arrive, so large channels can be piped incrementally).
- Without `--full`, `--since` compares against `publishedAtApprox`, estimated from
  relative text ("3w ago" ≈ accurate to a week). With `--full` it uses exact dates.
- Shorts listings have no dates or durations; `--since` with shorts needs `--full`.
- With `--full`, a video that fails (e.g. members-only) is reported on stderr and
  skipped; the exit code reflects the first failure.

```
yt-data videos @mkbhd --limit 10 --fields id,title,viewCount,publishedText
yt-data videos @mkbhd --type shorts --sort popular -n 20
yt-data videos @mkbhd --limit 0 --format ndjson > all.ndjson
yt-data videos @mkbhd --since 30d --full --fields id,title,publishedAt,likeCount
yt-data videos https://www.youtube.com/playlist?list=PLBsP89CPrMeO7uztAu6YxSB10cRMpjgiY
```

### `video <ref...>`

Full metadata for one or more videos.

Fields: `id`, `url`, `title`, `description`, `durationSeconds`, `viewCount`, `likeCount`,
`commentCount` (approximate) + `commentCountText`, `publishedAt` / `uploadedAt` (ISO-8601 UTC),
`channel{id,name,handle,url,subscriberCount,subscriberCountText,isVerified}`, `category`,
`keywords[]`, `isLive`, `isLiveContent`, `isUpcoming`, `isUnlisted`, `isFamilySafe`,
`thumbnails[]{url,width,height}`, `captions[]{lang,name,isAuto,isTranslatable}`,
`chapters[]{title,startSeconds}`, `playability{status,reason}`.

`playability.status` is `OK` when the video can be played anonymously; `LOGIN_REQUIRED`
(age-restricted/private) and `UNPLAYABLE` (members-only, region-blocked, …) still return
metadata.

```
yt-data video dQw4w9WgXcQ
cat ids.txt | yt-data video - --format ndjson
```

### `transcript <refs...>`

Transcript from a video's captions. Source order: the InnerTube caption track, then
yt-dlp (used when InnerTube fails, or when the language only exists as a YouTube machine
translation).

| Option | Default | Description |
|---|---|---|
| `-l, --lang <code>` | English if available, else the first track | Caption language (`en`, `pt-BR`, …; base language matches, e.g. `en` → `en-US`) |
| `--prefer <p>` | `manual` | `manual` or `auto` (auto-generated) when both exist |
| `--as <fmt>` | `json` | `json`, `txt`, `vtt`, `srt` |
| `--timestamps` | | Prefix each `txt` line with `[mm:ss]` |
| `--list` | | List caption tracks: `{videoId, tracks[{lang,name,isAuto,isTranslatable}]}` |
| `-o, --output <path>` | stdout | File (one ref) or directory (several refs → `<id>.<lang>.<ext>`) |
| `--no-fallback` | | Don't fall back to yt-dlp |

JSON: `{videoId, lang, name, isAuto, isTranslated, source, segments[{start, duration, text}]}`
(times in seconds). With `-o`, stdout gets `{videoId, lang, path}` per file written.
`txt`/`vtt`/`srt` to stdout take a single video; use `-o <dir>` for several.

Machine-translated languages (a `--lang` with no native track) are best-effort: YouTube
often answers anonymous translation requests with HTTP 429 (exit 4); `--cookies` helps.

```
yt-data transcript dQw4w9WgXcQ --as txt
yt-data transcript dQw4w9WgXcQ --as txt --timestamps
yt-data transcript e1q-TuHdc4Y --lang ja --as srt -o talk.ja.srt
yt-data transcript dQw4w9WgXcQ --list
yt-data videos @mkbhd -n 5 -f ndjson --fields id | jq -r .id | yt-data transcript - --as txt -o ./transcripts
```

### `thumbnail <refs...>`

| Option | Default | Description |
|---|---|---|
| `--quality <q>` | `best` | `best`, `maxres` (1280×720), `sd` (640×480), `hq` (480×360), `mq` (320×180), `default` (120×90); falls back to the next smaller size if missing |
| `-o, --output <dir>` | `.` | Output directory; files named `<id>.jpg` |
| `--url-only` | | Print the URL, don't download |

Output: `{id, quality, url, width, height, path, sizeBytes}` (`path`/`sizeBytes` are null with
`--url-only`).

```
yt-data thumbnail dQw4w9WgXcQ -o ./thumbs
yt-data thumbnail dQw4w9WgXcQ --quality hq --url-only --fields url
```

### `download <ref...>` _(planned)_

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

### `update` _(planned)_

| Option | Description |
|---|---|
| `--self` | Only update yt-data |
| `--yt-dlp` | Only update (or install) the managed yt-dlp |
| `--check` | Report available updates as JSON; change nothing |
| `--yt-dlp-channel <c>` | `stable` (default) or `nightly` |

A system-installed yt-dlp is never modified; the command prints the right upgrade
command for how it was installed.

### `doctor` _(planned)_

Checks yt-dlp (path, version, managed/system), ffmpeg, network, and runs a tiny request
against each data source. Exit 0 if everything required is OK.

### `schema [command]` _(planned)_

Prints the JSON Schema of a command's output (e.g. `yt-data schema video`). Without an
argument, lists commands that have schemas.

### `docs` _(planned)_

| Option | Description |
|---|---|
| (none) | Print this reference as markdown |
| `--man` | Print the man page (roff) |
| `--install-man` | Install the man page to `~/.local/share/man/man1/` |

## Output and errors

- Data → stdout. Logs, progress, warnings → stderr.
- One ref → a JSON object. Several refs (or `-`) → a JSON array, in input order.
  `--format ndjson` always prints one object per line.
- JSON is pretty-printed when stdout is a terminal and compact otherwise.
- Counts are integers. Abbreviated display values ("21.3M") are parsed and approximate;
  the original text is kept in the matching `…Text` field.
- With several refs, failures don't stop the others: successful results still go to stdout,
  each failure is a JSON error line on stderr (with a `ref` field), and the exit code is
  that of the first failure.
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

## Caching

Results are cached under the cache directory (`~/.cache/yt-data` on Linux): handle → id
lookups for 7 days, channels for 6 hours, videos for 1 hour, plus the InnerTube visitor
session (3 days). Listings are never cached. Entries are discarded when yt-data is upgraded.

## Environment

`YT_DATA_CONFIG`, `YT_DATA_CACHE_DIR`, `YT_DATA_NO_CACHE`, `YT_DATA_NO_UPDATE_CHECK`,
`YT_DATA_YTDLP`, `YT_DATA_COOKIES`, `YT_DATA_PROXY`, `YT_DATA_LOG`.
Precedence: flag > env > config file > default.
