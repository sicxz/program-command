#!/usr/bin/env bash
# Prepare the next N issues as worktrees only when repo-recovery guardrails are green.
set -euo pipefail

N="${1:-4}"
REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"
MANIFEST="${REPO_ROOT}/.autopilot-batch.txt"
MAX_REGISTERED_WORKTREES="${AUTOPILOT_MAX_REGISTERED_WORKTREES:-12}"

load_inventory_json() {
  if [[ -n "${AUTOPILOT_INVENTORY_JSON_FILE:-}" ]]; then
    cat "$AUTOPILOT_INVENTORY_JSON_FILE"
  else
    bash "$REPO_ROOT/scripts/worktree-inventory.sh" --json
  fi
}

inventory_file="${AUTOPILOT_INVENTORY_JSON_FILE:-}"
cleanup_inventory_file=false
if [[ -z "$inventory_file" ]]; then
  inventory_file="$(mktemp)"
  cleanup_inventory_file=true
  load_inventory_json > "$inventory_file"
fi
trap '[[ "$cleanup_inventory_file" == "true" ]] && rm -f "$inventory_file"' EXIT

read -r recover_count manual_review_count registered_count <<<"$(python3 - "$inventory_file" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf8") as handle:
    data = json.load(handle)

summary = data.get("summary", {})
print(summary.get("recoverCount", 0), summary.get("manualReviewCount", 0), summary.get("registeredWorktreeCount", 0))
PY
)"

if (( recover_count > 0 || manual_review_count > 0 )); then
  echo "error: autopilot blocked because repo recovery work is still pending (recover=${recover_count}, manual-review=${manual_review_count})." >&2
  echo "Run: npm run worktree:inventory && npm run worktree:repair -- --dry-run" >&2
  exit 1
fi

if (( registered_count > MAX_REGISTERED_WORKTREES )); then
  echo "error: autopilot blocked because registered worktrees (${registered_count}) exceed the guardrail (${MAX_REGISTERED_WORKTREES})." >&2
  echo "Run: npm run worktree:inventory && npm run worktree:repair -- --dry-run" >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "error: gh (GitHub CLI) required. Install: https://cli.github.com/" >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq required. Install: brew install jq" >&2
  exit 1
fi

: > "$MANIFEST"

git fetch origin >/dev/null 2>&1 || true
BASE=develop
for branch in develop main master; do
  if git rev-parse "origin/${branch}" >/dev/null 2>&1; then
    BASE="$branch"
    break
  fi
done

ISSUES=$(gh issue list --state open --limit 100 --json number,labels \
  | jq -r '[.[] | select(.labels | map(.name) | index("needs-human") | not)] | sort_by(.number) | .[0:'"$N"'][] | .number | tostring')

if [[ -z "$ISSUES" ]]; then
  echo "No unblocked issues found."
  exit 0
fi

PARENT=$(dirname "$REPO_ROOT")
get_worktree_path() { echo "${PARENT}/scheduler-v2-codex-${1}"; }
branch_for() { echo "codex/issue-${1}"; }

for num in $ISSUES; do
  branch=$(branch_for "$num")
  path=$(get_worktree_path "$num")
  if [[ ! -d "$path" ]]; then
    if ! git rev-parse --verify "$branch" >/dev/null 2>&1; then
      git branch "$branch" "origin/$BASE" >/dev/null 2>&1 || true
    fi
    git worktree add "$path" "$branch" >/dev/null 2>&1 || true
  fi
  printf '%s\t%s\t%s\n' "$num" "$branch" "$path" >> "$MANIFEST"
done

echo "Autopilot batch (N=$N) written to .autopilot-batch.txt"
echo ""
cat "$MANIFEST"
echo ""
echo "Next: implement each issue in the worktree above, then run: ./scripts/autopilot-finish.sh"
