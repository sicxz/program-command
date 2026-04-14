#!/usr/bin/env bash
# Push branches from .autopilot-batch.txt and open PRs against develop by default.
set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"
MANIFEST="${REPO_ROOT}/.autopilot-batch.txt"
BASE="${AUTOPILOT_PR_BASE:-develop}"

if [[ ! -f "$MANIFEST" ]]; then
  echo "error: .autopilot-batch.txt not found. Run: ./scripts/autopilot-run.sh [N]" >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "error: gh (GitHub CLI) required. Install: https://cli.github.com/" >&2
  exit 1
fi

while IFS=$'\t' read -r num branch path; do
  [[ -z "$num" ]] && continue
  echo "Pushing $branch (issue #$num)..."

  if git push origin "$branch" >/dev/null 2>&1; then
    echo "  pushed."
  else
    echo "  push failed (no new commits or auth?). Continuing."
  fi

  title=$(gh issue view "$num" --json title -q .title 2>/dev/null || echo "Closes #$num")
  existing=$(gh pr list --head "$branch" --json number -q '.[0].number' 2>/dev/null || true)
  if [[ -n "$existing" ]]; then
    echo "  PR #$existing already exists."
    continue
  fi

  if gh pr create --base "$BASE" --head "$branch" --title "$title" --body "Closes #$num"; then
    echo "  PR created."
  else
    echo "  PR create failed. Try: gh auth status; or set AUTOPILOT_PR_BASE to your base branch."
  fi
done < "$MANIFEST"

echo "Done. Update the recovery artifacts or handoff notes with any blockers."
