#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

python3 - "$SCRIPT_DIR" "$@" <<'PY'
import argparse
import json
import os
import shlex
import subprocess
import sys
from pathlib import Path


def run(cmd):
    return subprocess.run(cmd, text=True, capture_output=True)


script_dir = Path(sys.argv[1])
argv = sys.argv[2:]

parser = argparse.ArgumentParser(
    description="Surface safe repair actions for registered worktrees and orphan worktree metadata."
)
parser.add_argument("--json", action="store_true", help="Emit JSON instead of a human-readable report.")
parser.add_argument("--apply", action="store_true", help="Apply only the safe commands surfaced by this report.")
parser.add_argument("--github-root", default=os.getenv("GITHUB_ROOT", str(Path.home() / "Documents/GitHub")))
parser.add_argument("--repo-prefix", default=os.getenv("WORKTREE_REPO_PREFIX", "scheduler-v2-codex"))
parser.add_argument("--primary-repo-name", default=os.getenv("WORKTREE_PRIMARY_REPO_NAME"))
parser.add_argument("--porcelain-file", default=os.getenv("WORKTREE_PORCELAIN_FILE"))
parser.add_argument("--branch-tsv-file", default=os.getenv("WORKTREE_BRANCH_TSV_FILE"))
parser.add_argument("--pr-json-file", default=os.getenv("WORKTREE_PR_JSON_FILE"))
parser.add_argument("--git-common-dir", default=os.getenv("WORKTREE_GIT_COMMON_DIR"))
parser.add_argument("--current-path", default=os.getenv("WORKTREE_CURRENT_PATH"))
args = parser.parse_args(argv)

inventory_cmd = [
    "bash",
    str(script_dir / "worktree-inventory.sh"),
    "--json",
    "--github-root",
    args.github_root,
    "--repo-prefix",
    args.repo_prefix,
]
if args.primary_repo_name:
    inventory_cmd.extend(["--primary-repo-name", args.primary_repo_name])
if args.porcelain_file:
    inventory_cmd.extend(["--porcelain-file", args.porcelain_file])
if args.branch_tsv_file:
    inventory_cmd.extend(["--branch-tsv-file", args.branch_tsv_file])
if args.pr_json_file:
    inventory_cmd.extend(["--pr-json-file", args.pr_json_file])
if args.git_common_dir:
    inventory_cmd.extend(["--git-common-dir", args.git_common_dir])
if args.current_path:
    inventory_cmd.extend(["--current-path", args.current_path])

inventory_result = run(inventory_cmd)
if inventory_result.returncode != 0:
    sys.stderr.write(inventory_result.stderr or inventory_result.stdout)
    sys.exit(inventory_result.returncode)

inventory = json.loads(inventory_result.stdout)
entries = []
commands = []
seen_commands = set()


def add_command(command):
    if not command or command in seen_commands:
        return
    seen_commands.add(command)
    commands.append(command)


for item in inventory["registeredWorktrees"]:
    action = item["classification"]
    command = None
    reasons = list(item["reasons"])

    if item["classification"] == "recover":
        if "prunable" in reasons:
            action = "recover"
            command = "git worktree prune"
        elif "zero-head" in reasons:
            if item.get("topLevelEntryCount") is not None and item["topLevelEntryCount"] <= 1 and "open-pr" not in reasons:
                action = "remove-candidate"
                command = f"git worktree remove --force {shlex.quote(item['path'])}"
            else:
                action = "manual-review"

    if item["classification"] == "manual-review":
        action = "manual-review"

    entries.append(
        {
            "kind": item["kind"],
            "name": item["name"],
            "path": item["path"],
            "branch": item["branch"],
            "classification": action,
            "command": command,
            "reasons": reasons,
        }
    )
    add_command(command)

for item in inventory["orphanMetadata"]:
    action = item["classification"]
    command = None

    if item["classification"] == "remove-candidate":
        command = f"rmdir {shlex.quote(item['path'])}"

    entries.append(
        {
            "kind": item["kind"],
            "name": item["name"],
            "path": item["path"],
            "classification": action,
            "command": command,
            "reasons": item["reasons"],
        }
    )
    add_command(command)

summary = {
    "recoverCount": sum(1 for item in entries if item["classification"] == "recover"),
    "removeCandidateCount": sum(1 for item in entries if item["classification"] == "remove-candidate"),
    "manualReviewCount": sum(1 for item in entries if item["classification"] == "manual-review"),
}

if args.apply:
    for command in commands:
        result = subprocess.run(command, shell=True, text=True, capture_output=True)
        if result.returncode != 0:
            sys.stderr.write(result.stderr or result.stdout)
            sys.exit(result.returncode)

payload = {
    "apply": args.apply,
    "currentPath": inventory["currentPath"],
    "summary": summary,
    "entries": entries,
    "commands": commands,
}

if args.json:
    json.dump(payload, sys.stdout, indent=2)
    sys.stdout.write("\n")
    sys.exit(0)

print("Scheduler repo recovery repair plan")
print(f"Current path: {payload['currentPath']}")
print(f"Apply mode:   {'true' if args.apply else 'false'}")
print("")
print(
    f"Summary: recover={summary['recoverCount']} remove-candidate={summary['removeCandidateCount']} manual-review={summary['manualReviewCount']}"
)

for item in entries:
    print(f"\n[{item['classification']}] {item['kind']} {item['name']}")
    print(f"  path: {item['path']}")
    if item.get("branch"):
        print(f"  branch: {item['branch']}")
    print(f"  reasons: {', '.join(item['reasons'])}")
    if item["command"]:
        print(f"  command: {item['command']}")
PY
