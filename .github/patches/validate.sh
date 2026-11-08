#!/usr/bin/env bash
set -euo pipefail

FORK_PREFIX="github.com/carbon-colours/userstyles"
errors=0

# check url rewrites applied (spot-check one userstyle)
sample=$(ls styles/*/catppuccin.user.less | head -1)
if ! grep -q "$FORK_PREFIX" "$sample"; then
  echo "ERROR: URL rewrite failed in $sample"
  errors=$((errors + 1))
fi

# check codeberg fix applied (if codeberg style exists)
if [ -f styles/codeberg/catppuccin.user.less ]; then
  if ! grep -q '^@_urlAccent' styles/codeberg/catppuccin.user.less; then
    echo "ERROR: Codeberg fix failed"
    errors=$((errors + 1))
  fi
fi

# check flavour selectors were patched
if grep -q 'frappe:Frappé' "$sample"; then
  echo "ERROR: Flavour selector still contains frappe in $sample"
  errors=$((errors + 1))
fi

if [ "$errors" -gt 0 ]; then
  echo "FAILED: $errors validation error(s)"
  exit 1
fi

echo "All patches applied and validated successfully."
