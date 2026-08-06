#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  printf '%s\n' 'Usage: ./uninstall.sh [--help]' '' 'Removes only the OpenAI compact server and V1/V2 TUI plugins. Configs are backed up before changes.'
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
readonly CLI_CONFIG_FILE="${OPENCODE_CLI_CONFIG:-$OPENCODE_DIR/cli.json}"

command -v python3 >/dev/null || { printf 'Error: python3 is required.\n' >&2; exit 1; }

OPENCODE_CONFIG_FILE="$CONFIG_FILE" OPENCODE_TUI_CONFIG_FILE="$TUI_CONFIG_FILE" OPENCODE_CLI_CONFIG_FILE="$CLI_CONFIG_FILE" OPENCODE_PLUGIN_DIR="$PLUGIN_DIR" python3 - <<'PY'
import json
import os
import shutil
import tempfile
from datetime import datetime, timezone

config_file = os.environ["OPENCODE_CONFIG_FILE"]
tui_config_file = os.environ["OPENCODE_TUI_CONFIG_FILE"]
cli_config_file = os.environ["OPENCODE_CLI_CONFIG_FILE"]
plugin_dir = os.environ["OPENCODE_PLUGIN_DIR"]
entries_by_file = {
    tui_config_file: ("plugin", {f"file://{plugin_dir}/dist/tui.js"}),
    cli_config_file: ("plugins", {
        f"file://{plugin_dir}/src/v2-tui.tsx",
        f"file://{plugin_dir}/dist/v2-tui.js",
    }),
}

def remove(path, field, entries):
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
    plugins = config.get(field, [])
    if not isinstance(plugins, list):
        raise SystemExit(f"Error: {path} has a non-array {field} field")
    config[field] = [entry for entry in plugins if entry not in entries]
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

for path, (field, entries) in entries_by_file.items():
    remove(path, field, entries)
remove(config_file, "plugin", {f"file://{plugin_dir}", f"file://{plugin_dir}/dist/index.js"})
PY

rm -rf -- "$PLUGIN_DIR"
printf 'Uninstalled OpenAI compact. Restart OpenCode or OpenCode 2 to apply the change.\n'
