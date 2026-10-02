#!/bin/sh
# Installs the latest yt-data release binary.
#   curl -fsSL https://raw.githubusercontent.com/akashvaghela09/yt-data/main/install.sh | sh
# Env: YT_DATA_INSTALL_DIR (default ~/.local/bin), YT_DATA_VERSION (default latest, e.g. v0.1.0)
set -eu

REPO="akashvaghela09/yt-data"
INSTALL_DIR="${YT_DATA_INSTALL_DIR:-$HOME/.local/bin}"
VERSION="${YT_DATA_VERSION:-latest}"

case "$(uname -s)" in
  Linux) os=linux ;;
  Darwin) os=darwin ;;
  *) echo "yt-data: unsupported OS $(uname -s); download a binary from https://github.com/$REPO/releases" >&2; exit 1 ;;
esac
case "$(uname -m)" in
  x86_64 | amd64) arch=x64 ;;
  arm64 | aarch64) arch=arm64 ;;
  *) echo "yt-data: unsupported architecture $(uname -m)" >&2; exit 1 ;;
esac

asset="yt-data-$os-$arch"
if [ "$VERSION" = "latest" ]; then
  base="https://github.com/$REPO/releases/latest/download"
else
  base="https://github.com/$REPO/releases/download/$VERSION"
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "Downloading $asset ($VERSION)..." >&2
curl -fsSL "$base/$asset" -o "$tmp/$asset"
curl -fsSL "$base/SHA256SUMS" -o "$tmp/SHA256SUMS"

expected="$(grep " $asset\$" "$tmp/SHA256SUMS" | cut -d' ' -f1)"
if command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "$tmp/$asset" | cut -d' ' -f1)"
else
  actual="$(shasum -a 256 "$tmp/$asset" | cut -d' ' -f1)"
fi
if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
  echo "yt-data: checksum mismatch for $asset" >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR"
chmod +x "$tmp/$asset"
mv "$tmp/$asset" "$INSTALL_DIR/yt-data"
echo "Installed yt-data to $INSTALL_DIR/yt-data" >&2

case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *) echo "Note: $INSTALL_DIR is not on your PATH." >&2 ;;
esac
