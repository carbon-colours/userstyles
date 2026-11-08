#!/usr/bin/env bash
set -euo pipefail

codeberg="styles/codeberg/catppuccin.user.less"
if [ ! -f "$codeberg" ]; then
  echo "Codeberg style not found, skipping."
  exit 0
fi

# add @_urlAccent variable after the @import line
sed -i '/@import.*\/lib\/.*\.less/a\
\
@_urlAccent: if((@accentColor = subtext0), gray, @accentColor);' "$codeberg"

# replace gitea theme urls
sed -i \
  -e 's|catppuccin\.github\.io/gitea/theme-catppuccin-@{lightFlavor}-@{accentColor}|carbon-colours.github.io/gitea/theme-catppuccin-light-@{_urlAccent}|g' \
  -e 's|catppuccin\.github\.io/gitea/theme-catppuccin-@{darkFlavor}-@{accentColor}|carbon-colours.github.io/gitea/theme-catppuccin-dark-@{_urlAccent}|g' \
  "$codeberg"
