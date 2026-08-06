#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  printf '%s\n' 'Usage: ./uninstall.sh [--help]' '' 'Removes only the OpenAI compact server and TUI plugins. Configs are backed up before changes.'
  exit 0
fi
if [[ "$#" -ne 0 ]]; then
  printf '%s\n' 'Usage: ./uninstall.sh [--help]' >&2
  exit 2
fi

readonly CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
readonly OPENCODE_DIR="${OPENCODE_CONFIG_DIR:-$CONFIG_HOME/opencode}"
readonly PLUGIN_DIR="$OPENCODE_DIR/plugins/opencode-openai-compact"
readonly CONFIG_FILE="$OPENCODE_DIR/opencode.json"
readonly TUI_CONFIG_FILE="${OPENCODE_TUI_CONFIG:-$OPENCODE_DIR/tui.json}"

command -v python3 >/dev/null || { printf 'Error: python3 is required.\n' >&2; exit 1; }

OPENCODE_CONFIG_FILE="$CONFIG_FILE" OPENCODE_TUI_CONFIG_FILE="$TUI_CONFIG_FILE" OPENCODE_PLUGIN_DIR="$PLUGIN_DIR" python3 - <<'PY'
import json
import os
import shutil
import tempfile
from datetime import datetime, timezone

config_file = os.environ["OPENCODE_CONFIG_FILE"]
tui_config_file = os.environ["OPENCODE_TUI_CONFIG_FILE"]
plugin_dir = os.environ["OPENCODE_PLUGIN_DIR"]
entries_by_file = {
    config_file: {f"file://{plugin_dir}"},
    tui_config_file: {f"file://{plugin_dir}/dist/tui.js"},
}

def remove(path, entries):
    if not os.path.exists(path):
        print(f"No config found at {path}")
        return
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = f"{path}.bak-{stamp}"
    shutil.copy2(path, backup)
    with open(path, encoding="utf-8") as source:
        config = json.load(source)
    if not isinstance(config, dict):
        raise SystemExit(f"Error: {path} must contain a JSON object")
    plugins = config.get("plugin", [])
    if not isinstance(plugins, list):
        raise SystemExit(f"Error: {path} has a non-array plugin field")
    config["plugin"] = [entry for entry in plugins if entry not in entries]
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
    print(f"Updated {path} (backup: {backup})")

for path, entries in entries_by_file.items():
    remove(path, entries)
PY

rm -rf -- "$PLUGIN_DIR"
printf 'Uninstalled OpenAI compact. Restart OpenCode to apply the change.\n'
