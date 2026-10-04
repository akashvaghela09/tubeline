# tubeline

A fast YouTube CLI for people **and** AI agents: channel details, video lists, search,
video metadata, transcripts, thumbnails and video/audio downloads.

- **No browser.** Metadata comes from YouTube's InnerTube JSON API over plain HTTP.
- **Downloads via [yt-dlp](https://github.com/yt-dlp/yt-dlp)**, auto-managed if you
  don't have it installed.
- **Interactive menus for people:** run `tubeline`, paste a link or search, pick what to do.
  Readable output by default at a terminal.
- **Built for scripts and AI agents:** `--json` (the default when piped), logs on stderr,
  stable exit codes, `--fields` projection, NDJSON streaming, JSON Schemas, man page.
- **Single binary**, no runtime needed. Self-updating.

> **Status:** pre-1.0. All commands below work; see [`docs/plan.md`](docs/plan.md) for the roadmap.

## Install

```sh
# Prebuilt binary (once releases exist)
curl -fsSL https://raw.githubusercontent.com/akashvaghela09/tubeline/main/install.sh | sh

# From source
git clone https://github.com/akashvaghela09/tubeline && cd tubeline
bun install
bun run build          # → dist/tubeline
```

The installer also puts a man page in `~/.local/share/man/man1` (or run
`tubeline docs --install-man`).

Optional dependencies, only for `download` and the transcript fallback:
- **yt-dlp** — `tubeline update --yt-dlp` installs a managed copy (or use your own).
- **ffmpeg** — for downloads above 360p and audio conversion.

Keep everything current with `tubeline update`.

## Usage

### Interactive

```sh
tubeline          # full-screen app: paste a link or search, then download, transcribe, browse
```

Paste a link, `@handle` or id — or type to search — then use single keys: `d` download
(opens a small panel with your defaults; `Enter` starts it), `a` audio, `t` transcript,
`i` thumbnail, `c` channel. Browse channels and playlists in columns, filter with `/`,
select several with `space` and download them in one go. Downloads run in the background
with a live progress panel (size, speed, ETA). Pick a colour theme in Settings (`Ctrl+S`).
`Esc`/`Backspace` go back, `Ctrl+C` returns Home (and quits from Home), `?` lists every key.

### Commands

```sh
tubeline channel @mkbhd
tubeline videos @mkbhd --limit 20 --fields id,title,viewCount,publishedText
tubeline search mkbhd iphone review
tubeline search mkbhd --type channel
tubeline video dQw4w9WgXcQ
tubeline transcript dQw4w9WgXcQ --as txt
tubeline thumbnail dQw4w9WgXcQ -o ./thumbs
tubeline download dQw4w9WgXcQ --quality 1080p -o ./downloads
tubeline download dQw4w9WgXcQ --quality audio --audio-format mp3

tubeline update            # update tubeline and managed yt-dlp
tubeline doctor            # check dependencies and data sources
tubeline schema video      # JSON Schema of `video` output
tubeline docs              # full reference, for humans and agents
```

Pipe-friendly:

```sh
tubeline videos @mkbhd -n 20 --format ndjson --fields id | jq -r .id | tubeline transcript - --as txt -o ./transcripts
```

Full reference: [`docs/cli.md`](docs/cli.md).

## For AI agents

- `tubeline docs` prints the complete reference (markdown); `tubeline <command> --help` and
  `man tubeline` cover the same options.
- `tubeline schema <name>` prints the JSON Schema of an output (`schema` alone lists them).
- Pass `--json` (JSON is also the default whenever stdout isn't a terminal); `--fields a,b.c`
  keeps responses small; `--format ndjson` streams lists. Don't use `tubeline ui` — it's
  for people.
- The CLI never prompts. Failures exit non-zero with one JSON line on stderr:
  `{"error":{"code","message","hint"}}` — see the
  [exit codes](docs/cli.md#output-and-errors).
- `tubeline doctor` tells you what's missing or broken.

## Development

Requires [Bun](https://bun.sh) ≥ 1.4.

```sh
bun install
bun run dev -- channel @mkbhd    # run from source
bun test                         # unit tests
TUBELINE_LIVE=1 bun test          # include live tests against YouTube
bun run typecheck
bun run lint
bun run build                    # compile binary for this platform
```

Project layout and architecture: [`docs/plan.md`](docs/plan.md#3-architecture).
Releasing: [`docs/releasing.md`](docs/releasing.md). Contributor/agent rules: [`AGENTS.md`](AGENTS.md).

## Disclaimer

This tool talks to undocumented YouTube endpoints. Use it responsibly, respect
YouTube's Terms of Service and creators' rights, and only download content you're
allowed to.

## License

[MIT](LICENSE)
