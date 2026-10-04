#!/bin/sh
# Installs the latest tubeline release binary.
#   curl -fsSL https://raw.githubusercontent.com/akashvaghela09/tubeline/main/install.sh | sh
# Env: TUBELINE_INSTALL_DIR (default ~/.local/bin), TUBELINE_VERSION (default latest, e.g. v0.1.0)
set -eu

REPO="akashvaghela09/tubeline"
INSTALL_DIR="${TUBELINE_INSTALL_DIR:-$HOME/.local/bin}"
VERSION="${TUBELINE_VERSION:-latest}"

case "$(uname -s)" in
  Linux) os=linux ;;
  Darwin) os=darwin ;;
  *) echo "tubeline: unsupported OS $(uname -s); download a binary from https://github.com/$REPO/releases" >&2; exit 1 ;;
esac
case "$(uname -m)" in
  x86_64 | amd64) arch=x64 ;;
  arm64 | aarch64) arch=arm64 ;;
  *) echo "tubeline: unsupported architecture $(uname -m)" >&2; exit 1 ;;
esac

asset="tubeline-$os-$arch"
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
  echo "tubeline: checksum mismatch for $asset" >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR"
chmod +x "$tmp/$asset"
mv "$tmp/$asset" "$INSTALL_DIR/tubeline"
echo "Installed tubeline to $INSTALL_DIR/tubeline" >&2

# Man page (optional): `man tubeline`.
MAN_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/man/man1"
if curl -fsSL "$base/tubeline.1" -o "$tmp/tubeline.1" 2>/dev/null; then
  mkdir -p "$MAN_DIR" && mv "$tmp/tubeline.1" "$MAN_DIR/tubeline.1" && echo "Installed man page to $MAN_DIR/tubeline.1" >&2
fi

case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *) echo "Note: $INSTALL_DIR is not on your PATH." >&2 ;;
esac
