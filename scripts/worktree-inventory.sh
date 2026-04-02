#!/usr/bin/env bash
set -euo pipefail

JSON=false
PORCELAIN_FILE="${WORKTREE_PORCELAIN_FILE:-}"
GITHUB_ROOT="${GITHUB_ROOT:-${HOME}/Documents/GitHub}"
REPO_PREFIX="${WORKTREE_REPO_PREFIX:-scheduler-v2-codex}"
PRIMARY_REPO_NAME="${WORKTREE_PRIMARY_REPO_NAME:-$REPO_PREFIX}"
CURRENT_PATH="${WORKTREE_CURRENT_PATH:-$(pwd -P)}"

usage() {
  cat <<'EOF'
Usage: ./scripts/worktree-inventory.sh [--json] [--github-root PATH] [--repo-prefix PREFIX] [--porcelain-file FILE]

Inventories registered Git worktrees plus sibling repo directories for the scheduler workspace.
Defaults:
  --github-root   $HOME/Documents/GitHub
  --repo-prefix   scheduler-v2-codex
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --json)
      JSON=true
      shift
      ;;
    --github-root)
      GITHUB_ROOT="${2:-}"
      shift 2
      ;;
    --repo-prefix)
      REPO_PREFIX="${2:-}"
      shift 2
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

declare -a WORKTREE_RECORDS=()
declare -a REGISTERED_PATHS=()
declare -a CLONE_RECORDS=()

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

  local classification="keep"
  local -a reasons=()
  local reasons_csv=""

  if [[ "$current_head" == "$ZERO_HEAD" ]]; then
    classification="repair"
    reasons+=("zero-head")
  fi

  if [[ "$current_prunable" == "true" ]]; then
    classification="repair"
    reasons+=("prunable")
  fi

  if [[ "$current_locked" == "true" ]]; then
    classification="manual-review"
    reasons+=("locked-initializing")
  fi

  if [[ "$(basename "$current_path")" == "$PRIMARY_REPO_NAME" ]] && [[ "$current_head" == "$ZERO_HEAD" || "$current_prunable" == "true" || "$current_locked" == "true" ]]; then
    classification="manual-review"
    reasons+=("primary-checkout")
  fi

  if [[ "$current_path" == "$CURRENT_PATH" ]]; then
    reasons+=("current-worktree")
  fi

  if (( ${#reasons[@]} > 0 )); then
    reasons_csv="$(IFS=,; echo "${reasons[*]}")"
  fi

  WORKTREE_RECORDS+=("${current_path}"$'\t'"$(basename "$current_path")"$'\t'"${current_branch}"$'\t'"${current_head}"$'\t'"${current_locked}"$'\t'"${current_prunable}"$'\t'"${classification}"$'\t'"${reasons_csv}")
  REGISTERED_PATHS+=("$current_path")

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

contains_registered_path() {
  local candidate="$1"
  local registered
  for registered in "${REGISTERED_PATHS[@]}"; do
    if [[ "$registered" == "$candidate" ]]; then
      return 0
    fi
  done
  return 1
}

if [[ -d "$GITHUB_ROOT" ]]; then
  while IFS= read -r dir; do
    [[ -e "$dir/.git" ]] || continue
    if contains_registered_path "$dir"; then
      continue
    fi

    CLONE_RECORDS+=("${dir}"$'\t'"$(basename "$dir")"$'\t'"manual-review"$'\t'"unregistered-clone")
  done < <(find "$GITHUB_ROOT" -mindepth 1 -maxdepth 1 -type d -name "${REPO_PREFIX}*" | sort)
fi

registered_count=${#WORKTREE_RECORDS[@]}
zero_head_count=0
locked_count=0
prunable_count=0
healthy_count=0
repair_count=0
manual_review_count=0

for record in "${WORKTREE_RECORDS[@]}"; do
  IFS=$'\t' read -r _path _name _branch head locked prunable classification _reasons <<< "$record"
  [[ "$head" == "$ZERO_HEAD" ]] && ((zero_head_count+=1))
  [[ "$locked" == "true" ]] && ((locked_count+=1))
  [[ "$prunable" == "true" ]] && ((prunable_count+=1))
  [[ "$classification" == "keep" ]] && ((healthy_count+=1))
  [[ "$classification" == "repair" ]] && ((repair_count+=1))
  [[ "$classification" == "manual-review" ]] && ((manual_review_count+=1))
done

unregistered_clone_count=${#CLONE_RECORDS[@]}
scheduler_family_dir_count=$((registered_count + unregistered_clone_count))

if "$JSON"; then
  worktree_tmp=$(mktemp)
  clone_tmp=$(mktemp)
  trap 'rm -f "$worktree_tmp" "$clone_tmp"' EXIT

  if (( ${#WORKTREE_RECORDS[@]} > 0 )); then
    printf '%s\n' "${WORKTREE_RECORDS[@]}" > "$worktree_tmp"
  else
    : > "$worktree_tmp"
  fi

  if (( ${#CLONE_RECORDS[@]} > 0 )); then
    printf '%s\n' "${CLONE_RECORDS[@]}" > "$clone_tmp"
  else
    : > "$clone_tmp"
  fi

  python3 - "$worktree_tmp" "$clone_tmp" "$GITHUB_ROOT" "$REPO_PREFIX" "$CURRENT_PATH" "$registered_count" "$zero_head_count" "$locked_count" "$prunable_count" "$healthy_count" "$repair_count" "$manual_review_count" "$scheduler_family_dir_count" "$unregistered_clone_count" <<'PY'
import json
import sys

worktree_file, clone_file, github_root, repo_prefix, current_path, registered_count, zero_head_count, locked_count, prunable_count, healthy_count, repair_count, manual_review_count, scheduler_family_dir_count, unregistered_clone_count = sys.argv[1:]
worktrees = []
clones = []

for raw in open(worktree_file, encoding="utf8").read().splitlines():
    if not raw:
        continue
    parts = raw.split("\t")
    reasons = [value for value in parts[7].split(",") if value]
    worktrees.append({
        "path": parts[0],
        "name": parts[1],
        "branch": parts[2],
        "head": parts[3],
        "locked": parts[4] == "true",
        "prunable": parts[5] == "true",
        "classification": parts[6],
        "reasons": reasons,
    })

for raw in open(clone_file, encoding="utf8").read().splitlines():
    if not raw:
        continue
    parts = raw.split("\t")
    reasons = [value for value in parts[3].split(",") if value]
    clones.append({
        "path": parts[0],
        "name": parts[1],
        "classification": parts[2],
        "reasons": reasons,
    })

payload = {
    "githubRoot": github_root,
    "repoPrefix": repo_prefix,
    "currentPath": current_path,
    "summary": {
        "registeredWorktreeCount": int(registered_count),
        "zeroHeadCount": int(zero_head_count),
        "lockedCount": int(locked_count),
        "prunableCount": int(prunable_count),
        "healthyCount": int(healthy_count),
        "repairCount": int(repair_count),
        "manualReviewCount": int(manual_review_count),
        "schedulerFamilyDirCount": int(scheduler_family_dir_count),
        "unregisteredCloneCount": int(unregistered_clone_count),
    },
    "worktrees": worktrees,
    "unregisteredClones": clones,
}

json.dump(payload, sys.stdout, indent=2)
sys.stdout.write("\n")
PY
  exit 0
fi

printf 'Scheduler worktree inventory\n'
printf 'Repo prefix: %s\n' "$REPO_PREFIX"
printf 'GitHub root: %s\n' "$GITHUB_ROOT"
printf 'Current path: %s\n\n' "$CURRENT_PATH"
printf 'Summary\n'
printf '  registered worktrees: %s\n' "$registered_count"
printf '  zero-head entries:    %s\n' "$zero_head_count"
printf '  locked entries:       %s\n' "$locked_count"
printf '  prunable entries:     %s\n' "$prunable_count"
printf '  healthy entries:      %s\n' "$healthy_count"
printf '  repair entries:       %s\n' "$repair_count"
printf '  manual-review items:  %s\n' "$manual_review_count"
printf '  unregistered clones:  %s\n\n' "$unregistered_clone_count"

printf 'Registered worktrees\n'
for record in "${WORKTREE_RECORDS[@]}"; do
  IFS=$'\t' read -r path name branch head locked prunable classification reasons <<< "$record"
  printf '  [%s] %s\n' "$classification" "$name"
  printf '    path: %s\n' "$path"
  printf '    branch: %s\n' "${branch:-<none>}"
  printf '    head: %s\n' "$head"
  printf '    flags: locked=%s prunable=%s\n' "$locked" "$prunable"
  [[ -n "$reasons" ]] && printf '    reasons: %s\n' "$reasons"
done

if [[ ${#CLONE_RECORDS[@]} -gt 0 ]]; then
  printf '\nUnregistered scheduler-family clones\n'
  for record in "${CLONE_RECORDS[@]}"; do
    IFS=$'\t' read -r path name classification reasons <<< "$record"
    printf '  [%s] %s\n' "$classification" "$name"
    printf '    path: %s\n' "$path"
    printf '    reasons: %s\n' "$reasons"
  done
fi
