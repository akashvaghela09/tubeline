# Releasing

1. Make sure `main` is green in CI.
2. Bump `version` in `package.json` and move `[Unreleased]` entries in `CHANGELOG.md`
   under the new version with today's date.
3. Commit: `git commit -am "release: vX.Y.Z"`.
4. Tag and push: `git tag vX.Y.Z && git push origin main vX.Y.Z`.
5. The `Release` workflow lints, type-checks, tests, verifies that the tag matches
   `package.json`, cross-compiles all targets (`bun run build:all`) and publishes a GitHub
   Release with the binaries and `SHA256SUMS`.

Asset names (`yt-data-<os>-<arch>[.exe]`) and `SHA256SUMS` are what `install.sh` and
`yt-data update` depend on. Don't rename them without updating both.

Build locally without publishing: `bun run build:all` → `dist/`.
