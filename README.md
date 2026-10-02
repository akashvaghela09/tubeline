# yt-data

A fast, agent-friendly CLI for fetching YouTube data: channel details, video lists,
video metadata, transcripts, thumbnails and video/audio downloads.

- **No browser.** Metadata comes from YouTube's InnerTube JSON API over plain HTTP.
- **Downloads via [yt-dlp](https://github.com/yt-dlp/yt-dlp)**, auto-managed if you
  don't have it installed.
- **Built for scripts and AI agents:** JSON on stdout, logs on stderr, stable exit codes,
  `--fields` projection, NDJSON streaming, JSON Schemas for every output, man page.
- **Single binary**, no runtime needed. Self-updating.

> **Status:** early development. `channel`, `video`, `videos`, `transcript` and `thumbnail` work today; the other commands
> below are the v1 target — see [`docs/plan.md`](docs/plan.md) for the roadmap.

## Install

```sh
# Prebuilt binary (once releases exist)
curl -fsSL https://raw.githubusercontent.com/akashvaghela09/yt-data/main/install.sh | sh

# From source
git clone https://github.com/akashvaghela09/yt-data && cd yt-data
bun install
bun run build          # → dist/yt-data
```

Optional: `ffmpeg` (needed to merge video+audio for most downloads). yt-dlp is
used from your system if present, otherwise `yt-data update --yt-dlp` installs a managed
copy.

## Usage

```sh
yt-data channel @mkbhd
yt-data videos @mkbhd --limit 20 --fields id,title,viewCount,publishedText
yt-data video dQw4w9WgXcQ
yt-data transcript dQw4w9WgXcQ --as txt
yt-data thumbnail dQw4w9WgXcQ -o ./thumbs
yt-data download dQw4w9WgXcQ --quality 1080p -o ./downloads
yt-data download dQw4w9WgXcQ --quality audio --audio-format mp3

yt-data update            # update yt-data and managed yt-dlp
yt-data doctor            # check dependencies and data sources
yt-data schema video      # JSON Schema of `video` output
yt-data docs              # full reference, for humans and agents
```

Pipe-friendly:

```sh
yt-data videos @mkbhd -n 20 --format ndjson --fields id | jq -r .id | yt-data transcript - --as txt -o ./transcripts
```

Full reference: [`docs/cli.md`](docs/cli.md).

## For AI agents

Run `yt-data docs` for the complete reference, or `yt-data <command> --help`.
Outputs are JSON by default; use `--fields` to keep responses small and
`yt-data schema <command>` to learn the shape. The CLI never prompts. On failure it exits
non-zero and writes `{"error":{"code","message","hint"}}` to stderr. Exit codes are
documented in [`docs/cli.md`](docs/cli.md#output-and-errors).

## Development

Requires [Bun](https://bun.sh) ≥ 1.4.

```sh
bun install
bun run dev -- channel @mkbhd    # run from source
bun test                         # unit tests
YT_DATA_LIVE=1 bun test          # include live tests against YouTube
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
