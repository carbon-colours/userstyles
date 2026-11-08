#!/usr/bin/env bash
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

exec deno run --no-config --lock=.github/patches/palette.lock \
  --allow-read --allow-write --allow-net \
  .github/patches/palette.ts "$@"
