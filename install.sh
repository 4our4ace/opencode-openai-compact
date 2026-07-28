#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./install.sh [--help]

Clones or updates the OpenAI compact plugin, installs production dependencies,
and adds its server and TUI plugins to the global OpenCode configuration.
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi
if [[ "$#" -ne 0 ]]; then
  usage >&2
  exit 2
fi

readonly CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
readonly OPENCODE_DIR="${OPENCODE_CONFIG_DIR:-$CONFIG_HOME/opencode}"
readonly PLUGIN_DIR="$OPENCODE_DIR/plugins/opencode-openai-compact"
readonly CONFIG_FILE="$OPENCODE_DIR/opencode.json"
readonly TUI_CONFIG_FILE="${OPENCODE_TUI_CONFIG:-$OPENCODE_DIR/tui.json}"
readonly REPO="https://github.com/4our4ace/opencode-openai-compact.git"

command -v git >/dev/null || { printf 'Error: git is required.\n' >&2; exit 1; }
command -v python3 >/dev/null || { printf 'Error: python3 is required.\n' >&2; exit 1; }

if [[ -e "$PLUGIN_DIR" && ! -d "$PLUGIN_DIR/.git" ]]; then
  printf 'Error: %s exists but is not a git checkout.\n' "$PLUGIN_DIR" >&2
  exit 1
fi
mkdir -p "$(dirname "$PLUGIN_DIR")"
if [[ ! -e "$PLUGIN_DIR" ]]; then
  git clone -- "$REPO" "$PLUGIN_DIR"
else
  remote="$(git -C "$PLUGIN_DIR" remote get-url origin 2>/dev/null || true)"
  if [[ "$remote" != "$REPO" ]]; then
    printf 'Error: %s has unexpected origin %s.\n' "$PLUGIN_DIR" "${remote:-<none>}" >&2
    exit 1
  fi
  if [[ -n "$(git -C "$PLUGIN_DIR" status --porcelain)" ]]; then
    printf 'Error: %s has local changes; refusing to update it.\n' "$PLUGIN_DIR" >&2
    exit 1
  fi
  git -C "$PLUGIN_DIR" pull --ff-only --quiet
fi

if command -v corepack >/dev/null 2>&1; then
  corepack pnpm --version >/dev/null
  (cd "$PLUGIN_DIR" && corepack pnpm install --prod --frozen-lockfile)
elif command -v pnpm >/dev/null 2>&1; then
  printf 'Warning: corepack is unavailable; using pnpm from PATH.\n' >&2
  (cd "$PLUGIN_DIR" && pnpm install --prod --frozen-lockfile)
else
  printf 'Error: corepack/pnpm is required to install opencode-openai-compact.\n' >&2
  exit 1
fi

OPENCODE_CONFIG_FILE="$CONFIG_FILE" OPENCODE_TUI_CONFIG_FILE="$TUI_CONFIG_FILE" OPENCODE_PLUGIN_DIR="$PLUGIN_DIR" python3 - <<'PY'
import json
import os
import shutil
import tempfile
from datetime import datetime, timezone

config_file = os.environ["OPENCODE_CONFIG_FILE"]
tui_config_file = os.environ["OPENCODE_TUI_CONFIG_FILE"]
plugin_dir = os.environ["OPENCODE_PLUGIN_DIR"]
server = f"file://{plugin_dir}"
tui = f"file://{plugin_dir}/dist/tui.js"

def update(path, entries):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path):
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup = f"{path}.bak-{stamp}"
        shutil.copy2(path, backup)
        with open(path, encoding="utf-8") as source:
            config = json.load(source)
    else:
        backup = None
        config = {}
    if not isinstance(config, dict):
        raise SystemExit(f"Error: {path} must contain a JSON object")
    plugins = config.get("plugin", [])
    if not isinstance(plugins, list):
        raise SystemExit(f"Error: {path} has a non-array plugin field")
    config["plugin"] = [entry for entry in plugins if entry not in entries] + entries
    directory = os.path.dirname(path)
    fd, temporary = tempfile.mkstemp(prefix=f".{os.path.basename(path)}.", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as target:
            json.dump(config, target, indent=2)
            target.write("\n")
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print(f"Updated {path}" + (f" (backup: {backup})" if backup else ""))

update(config_file, [server])
update(tui_config_file, [tui])
PY
