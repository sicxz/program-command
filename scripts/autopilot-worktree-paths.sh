#!/usr/bin/env bash
# Print branch -> worktree path mapping for use by autopilot (e.g. subagent paths).
# Usage: ./scripts/autopilot-worktree-paths.sh [--json] [--porcelain-file FILE]

set -euo pipefail

JSON=false
PORCELAIN_FILE="${WORKTREE_PORCELAIN_FILE:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --json)
      JSON=true
      shift
      ;;
    --porcelain-file)
      PORCELAIN_FILE="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

read_porcelain() {
  if [[ -n "$PORCELAIN_FILE" ]]; then
    cat "$PORCELAIN_FILE"
  else
    git worktree list --porcelain 2>/dev/null || true
  fi
}

LINES=$(read_porcelain | {
  worktree=""
  while IFS= read -r line; do
    if [[ "$line" = worktree\ * ]]; then
      worktree="${line#worktree }"
    elif [[ "$line" = branch\ refs/heads/* ]]; then
      branch="${line#branch refs/heads/}"
      [[ -n "$worktree" ]] && printf '%s\t%s\n' "$branch" "$worktree"
      worktree=""
    fi
  done
})

if "$JSON"; then
  echo -n '{'
  first=true
  while IFS=$'\t' read -r branch path; do
    [[ -z "$branch" ]] && continue
    "$first" || echo -n ','
    printf '"%s":"%s"' "$branch" "$path"
    first=false
  done <<< "$LINES"
  echo '}'
else
  echo "$LINES"
fi
