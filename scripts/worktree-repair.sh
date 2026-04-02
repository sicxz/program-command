#!/usr/bin/env bash
set -euo pipefail

JSON=false
APPLY=false
PORCELAIN_FILE="${WORKTREE_PORCELAIN_FILE:-}"
PRIMARY_REPO_NAME="${WORKTREE_PRIMARY_REPO_NAME:-scheduler-v2-codex}"
CURRENT_PATH="${WORKTREE_CURRENT_PATH:-$(pwd -P)}"

usage() {
  cat <<'EOF'
Usage: ./scripts/worktree-repair.sh [--json] [--apply] [--porcelain-file FILE]

Surfaces repair actions for broken worktree metadata. Dry-run is the default.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --json)
      JSON=true
      shift
      ;;
    --apply)
      APPLY=true
      shift
      ;;
    --porcelain-file)
      PORCELAIN_FILE="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

read_porcelain() {
  if [[ -n "$PORCELAIN_FILE" ]]; then
    cat "$PORCELAIN_FILE"
  else
    git worktree list --porcelain
  fi
}

declare -a ENTRY_RECORDS=()
declare -a COMMANDS=()

ZERO_HEAD="0000000000000000000000000000000000000000"

current_path=""
current_branch=""
current_head=""
current_locked="false"
current_prunable="false"

flush_current() {
  if [[ -z "$current_path" ]]; then
    return
  fi

  local action="keep"
  local command=""
  local -a reasons=()
  local reasons_csv=""

  if [[ "$current_prunable" == "true" ]]; then
    action="prune-candidate"
    command="git worktree prune"
    reasons+=("prunable")
  fi

  if [[ "$current_head" == "$ZERO_HEAD" ]]; then
    action="remove-candidate"
    command="git worktree remove --force '$current_path'"
    reasons+=("zero-head")
  fi

  if [[ "$current_locked" == "true" ]]; then
    action="manual-review-locked"
    command=""
    reasons+=("locked-initializing")
  fi

  if [[ "$current_path" == "$CURRENT_PATH" && "$current_head" == "$ZERO_HEAD" ]]; then
    action="manual-review-current"
    command=""
    reasons+=("current-worktree")
  elif [[ "$current_path" == "$CURRENT_PATH" ]]; then
    reasons+=("current-worktree")
  fi

  if [[ "$(basename "$current_path")" == "$PRIMARY_REPO_NAME" ]] && [[ "$current_head" == "$ZERO_HEAD" || "$current_prunable" == "true" || "$current_locked" == "true" ]]; then
    action="manual-review-primary"
    command=""
    reasons+=("primary-checkout")
  fi

  if [[ -n "$command" ]]; then
    COMMANDS+=("$command")
  fi

  if (( ${#reasons[@]} > 0 )); then
    reasons_csv="$(IFS=,; echo "${reasons[*]}")"
  fi

  ENTRY_RECORDS+=("${current_path}"$'\t'"$(basename "$current_path")"$'\t'"${current_branch}"$'\t'"${current_head}"$'\t'"${current_locked}"$'\t'"${current_prunable}"$'\t'"${action}"$'\t'"${command}"$'\t'"${reasons_csv}")

  current_path=""
  current_branch=""
  current_head=""
  current_locked="false"
  current_prunable="false"
}

while IFS= read -r line || [[ -n "$line" ]]; do
  if [[ -z "$line" ]]; then
    flush_current
    continue
  fi

  case "$line" in
    worktree\ *)
      current_path="${line#worktree }"
      ;;
    HEAD\ *)
      current_head="${line#HEAD }"
      ;;
    branch\ refs/heads/*)
      current_branch="${line#branch refs/heads/}"
      ;;
    locked*)
      current_locked="true"
      ;;
    prunable*)
      current_prunable="true"
      ;;
  esac
done < <(read_porcelain)

flush_current

if "$APPLY"; then
  for command in "${COMMANDS[@]}"; do
    eval "$command"
  done
fi

remove_candidate_count=0
locked_count=0
prune_candidate_count=0
manual_review_count=0

for record in "${ENTRY_RECORDS[@]}"; do
  IFS=$'\t' read -r _path _name _branch _head _locked _prunable action _command _reasons <<< "$record"
  [[ "$action" == "remove-candidate" ]] && ((remove_candidate_count+=1))
  [[ "$action" == "manual-review-locked" ]] && ((locked_count+=1))
  [[ "$action" == "prune-candidate" ]] && ((prune_candidate_count+=1))
  [[ "$action" == manual-review-* ]] && ((manual_review_count+=1))
done

if "$JSON"; then
  entry_tmp=$(mktemp)
  command_tmp=$(mktemp)
  trap 'rm -f "$entry_tmp" "$command_tmp"' EXIT

  if (( ${#ENTRY_RECORDS[@]} > 0 )); then
    printf '%s\n' "${ENTRY_RECORDS[@]}" > "$entry_tmp"
  else
    : > "$entry_tmp"
  fi

  if (( ${#COMMANDS[@]} > 0 )); then
    printf '%s\n' "${COMMANDS[@]}" > "$command_tmp"
  else
    : > "$command_tmp"
  fi

  python3 - "$entry_tmp" "$command_tmp" "$CURRENT_PATH" "$APPLY" "$remove_candidate_count" "$locked_count" "$prune_candidate_count" "$manual_review_count" <<'PY'
import json
import sys

entry_file, command_file, current_path, apply_flag, remove_count, locked_count, prune_count, manual_count = sys.argv[1:]
entries = []
commands = []

for raw in open(entry_file, encoding="utf8").read().splitlines():
    if not raw:
        continue
    parts = raw.split("\t")
    reasons = [value for value in parts[8].split(",") if value]
    entries.append({
        "path": parts[0],
        "name": parts[1],
        "branch": parts[2],
        "head": parts[3],
        "locked": parts[4] == "true",
        "prunable": parts[5] == "true",
        "action": parts[6],
        "command": parts[7] or None,
        "reasons": reasons,
    })

for raw in open(command_file, encoding="utf8").read().splitlines():
    if raw:
        commands.append(raw)

payload = {
    "currentPath": current_path,
    "apply": apply_flag == "true",
    "summary": {
        "removeCandidateCount": int(remove_count),
        "lockedManualReviewCount": int(locked_count),
        "pruneCandidateCount": int(prune_count),
        "manualReviewCount": int(manual_count),
    },
    "entries": entries,
    "commands": commands,
}

json.dump(payload, sys.stdout, indent=2)
sys.stdout.write("\n")
PY
  exit 0
fi

printf 'Worktree repair dry-run\n'
printf 'Current path: %s\n' "$CURRENT_PATH"
printf 'Apply mode:   %s\n\n' "$APPLY"

for record in "${ENTRY_RECORDS[@]}"; do
  IFS=$'\t' read -r path name branch head locked prunable action command reasons <<< "$record"
  printf '  [%s] %s\n' "$action" "$name"
  printf '    path: %s\n' "$path"
  printf '    branch: %s\n' "${branch:-<none>}"
  printf '    head: %s\n' "$head"
  printf '    flags: locked=%s prunable=%s\n' "$locked" "$prunable"
  [[ -n "$reasons" ]] && printf '    reasons: %s\n' "$reasons"
  [[ -n "$command" ]] && printf '    command: %s\n' "$command"
done
