# AGENTS.md

Guidance for AI agents working **on** this codebase. (Agents *using* the CLI should run
`yt-data docs`.)

## Project

`yt-data`: TypeScript CLI on Bun, compiled to a single binary. Metadata from InnerTube
via `youtubei.js`; downloads via a `yt-dlp` subprocess. Plan and roadmap:
`docs/plan.md`. Command spec: `docs/cli.md`.

## Commands

- `bun run dev -- <args>`: run from source
- `bun test`: unit tests (`YT_DATA_LIVE=1` adds live YouTube tests)
- `bun run typecheck` / `bun run lint`
- `bun run build`: compile `dist/yt-data`

## Rules

- The output contract in `docs/plan.md` §5 is a public API. stdout carries data only;
  logs go to stderr; never prompt; map failures to the typed error codes/exit codes.
- zod schemas in `src/models/` are the single source of truth for output types and the
  `schema` command. Change a model → update `docs/cli.md` if user-visible.
- Never add AI co-author trailers or tool attribution to commits, PRs or files.
- Keep `docs/cli.md` in sync with actual flags. `yt-data docs` prints it.
- Every new dependency must work under `bun build --compile`.
- Unit tests use recorded fixtures in `tests/fixtures/`; don't hit the network in
  unit tests.
