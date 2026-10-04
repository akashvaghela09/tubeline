# AGENTS.md

Guidance for AI agents working **on** this codebase. (Agents *using* the CLI should run
`tubeline docs`.)

## Project

`tubeline`: TypeScript CLI on Bun, compiled to a single binary. Metadata from InnerTube
via `youtubei.js`; downloads via a `yt-dlp` subprocess. Plan and roadmap:
`docs/plan.md`. Command spec: `docs/cli.md`.

## Commands

- `bun run dev -- <args>`: run from source
- `bun test`: unit + contract tests, offline (`TUBELINE_LIVE=1` adds live YouTube tests)
- `bun run scripts/record-fixtures.ts [scenario]`: re-record InnerTube fixtures
- UI tests (`tests/ui/`) drive the OpenTUI app in an in-memory renderer with fake
  services; `TUBELINE_UI_KEYLOG=/tmp/keys.log tubeline` logs real key events when debugging.
- Cross-compiling needs every platform's OpenTUI package:
  `bun install --frozen-lockfile --os='*' --cpu='*'` before `bun run build:all`.
- `bun run typecheck` / `bun run lint`
- `bun run build`: compile `dist/tubeline`

## Rules

- The JSON output contract (`docs/plan.md` §5) is a public API. Human output (`--format
  human`, the default at a terminal) and `src/ui/` are for people and may change freely, but
  must never appear when stdout isn't a terminal or with `--json`. Commands never prompt;
  only `tubeline ui` (or bare `tubeline` at a terminal) is interactive.
- `src/ui/` (OpenTUI + React) talks to the rest only through `UiServices`
  (`src/ui/services.ts`); keep it that way so the UI stays testable. Screen state that must
  survive navigation lives in the screen's stack entry (`model`), not in component state.
  Screens ignore Ctrl/Alt keys; those belong to the app shell.
- Branches: develop on `dev`; `main` is what's released; `version-1` holds the v0.1.x line. stdout carries data only;
  logs go to stderr; never prompt; map failures to the typed error codes/exit codes.
- zod schemas in `src/models/` are the single source of truth for output types and the
  `schema` command. Change a model → update `docs/cli.md` if user-visible.
- Never add AI co-author trailers or tool attribution to commits, PRs or files.
- Keep `docs/cli.md` in sync with actual flags. `tubeline docs` prints it.
- Every new dependency must work under `bun build --compile`.
- Tests must not hit the network unless they live in `tests/live/`. New InnerTube behaviour
  gets a scenario in `tests/helpers/scenarios.ts` plus a recorded fixture.
- Library objects from youtubei.js are mapped in `src/sources/innertube.ts` only; commands
  work with our models.
