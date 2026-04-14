#!/usr/bin/env bash
set -euo pipefail

python3 - "$@" <<'PY'
import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ZERO_HEAD = "0000000000000000000000000000000000000000"
CLASSIFICATIONS = ("keep", "recover", "archive", "remove-candidate", "manual-review")


def run(cmd, cwd=None):
    return subprocess.run(cmd, cwd=cwd, text=True, capture_output=True)


def git_output(args):
    result = run(["git", *args])
    if result.returncode != 0:
        return ""
    return result.stdout.strip()


def real(path_value):
    try:
        return os.path.realpath(path_value)
    except OSError:
        return path_value


def parse_porcelain(text):
    records = []
    current = None

    def flush():
        nonlocal current
        if current and current.get("path"):
            current.setdefault("branch", "")
            current.setdefault("head", "")
            current.setdefault("locked", False)
            current.setdefault("prunable", False)
            records.append(current)
        current = None

    for raw in text.splitlines():
        line = raw.rstrip("\n")
        if not line:
            flush()
            continue
        if line.startswith("worktree "):
            flush()
            current = {"path": line.split(" ", 1)[1]}
        elif current is None:
            continue
        elif line.startswith("HEAD "):
            current["head"] = line.split(" ", 1)[1]
        elif line.startswith("branch refs/heads/"):
            current["branch"] = line.split("refs/heads/", 1)[1]
        elif line.startswith("locked"):
            current["locked"] = True
        elif line.startswith("prunable"):
            current["prunable"] = True

    flush()
    return records


def load_branch_rows(branch_tsv_file):
    if branch_tsv_file:
        text = Path(branch_tsv_file).read_text(encoding="utf8")
    else:
        text = git_output(
            [
                "for-each-ref",
                "--sort=refname",
                "--format=%(refname:short)\t%(upstream:short)\t%(upstream:trackshort)\t%(objectname:short)\t%(subject)",
                "refs/heads",
            ]
        )

    rows = []
    for raw in text.splitlines():
        if not raw.strip():
            continue
        parts = raw.split("\t", 4)
        while len(parts) < 5:
            parts.append("")
        rows.append(
            {
                "branch": parts[0],
                "upstream": parts[1],
                "track": parts[2],
                "sha": parts[3],
                "subject": parts[4],
            }
        )
    return rows


def load_open_prs(pr_json_file):
    if pr_json_file:
        return json.loads(Path(pr_json_file).read_text(encoding="utf8") or "[]")

    if not shutil.which("gh"):
        return []

    result = run(
        [
            "gh",
            "pr",
            "list",
            "--state",
            "open",
            "--limit",
            "200",
            "--json",
            "number,title,headRefName,baseRefName,isDraft",
        ]
    )
    if result.returncode != 0 or not result.stdout.strip():
        return []
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return []


def classify_registered_worktree(record, current_path, primary_repo_name, pr_heads):
    path = Path(record["path"])
    file_count = None
    if path.exists() and path.is_dir():
        try:
            file_count = sum(1 for _ in path.iterdir())
        except OSError:
            file_count = None

    git_status = run(["git", "-C", str(path), "status", "--short"]) if path.exists() else None
    dirty = None
    if git_status is not None and git_status.returncode == 0:
        dirty = bool(git_status.stdout.strip())

    reasons = []
    classification = "keep"

    if record["head"] == ZERO_HEAD:
        reasons.append("zero-head")
        classification = "recover"
    if record["prunable"]:
        reasons.append("prunable")
        classification = "recover"
    if record["locked"]:
        reasons.append("locked-initializing")
        classification = "manual-review"
    if file_count and file_count > 1 and record["head"] == ZERO_HEAD:
        reasons.append("nontrivial-working-copy")
        classification = "manual-review"
    if record["branch"] in pr_heads:
        reasons.append("open-pr")
    if real(record["path"]) == current_path:
        reasons.append("current-worktree")
        if classification != "keep":
            classification = "manual-review"
    if path.name == primary_repo_name:
        reasons.append("primary-checkout")
        if classification != "keep":
            classification = "manual-review"

    return {
        "kind": "registered-worktree",
        "path": record["path"],
        "name": path.name,
        "branch": record["branch"],
        "head": record["head"],
        "locked": record["locked"],
        "prunable": record["prunable"],
        "openPullRequest": record["branch"] in pr_heads,
        "topLevelEntryCount": file_count,
        "dirty": dirty,
        "classification": classification,
        "reasons": reasons,
    }


def classify_orphan_metadata(entry, registered_paths):
    child = entry
    file_count = 0
    try:
        file_count = sum(1 for _ in child.iterdir())
    except OSError:
        file_count = 0

    gitdir_file = child / "gitdir"
    resolved_worktree_path = ""
    if gitdir_file.exists():
        target = gitdir_file.read_text(encoding="utf8").strip()
        if target:
            resolved_worktree_path = str(Path(target).parent)

    if resolved_worktree_path and real(resolved_worktree_path) in registered_paths:
        return None

    reasons = ["orphan-metadata"]
    classification = "recover"

    if file_count == 0:
        reasons = ["empty-metadata-dir"]
        classification = "remove-candidate"
    elif not gitdir_file.exists():
        reasons.append("missing-gitdir")
    elif resolved_worktree_path and not Path(resolved_worktree_path).exists():
        reasons.append("missing-worktree-path")

    return {
        "kind": "orphan-metadata",
        "path": str(child),
        "name": child.name,
        "resolvedWorktreePath": resolved_worktree_path or None,
        "fileCount": file_count,
        "classification": classification,
        "reasons": reasons,
    }


def classify_unregistered_clone(directory, registered_paths, repo_root, pr_heads):
    real_dir = real(str(directory))
    if real_dir in registered_paths or real_dir == repo_root:
        return None

    if not directory.name.startswith(args.repo_prefix):
        return None

    git_check = run(["git", "-C", str(directory), "rev-parse", "--is-inside-work-tree"])
    is_git_repo = git_check.returncode == 0 and git_check.stdout.strip() == "true"

    branch = "BROKEN"
    dirty = None
    upstream = ""
    if is_git_repo:
        branch_result = run(["git", "-C", str(directory), "rev-parse", "--abbrev-ref", "HEAD"])
        if branch_result.returncode == 0:
            branch = branch_result.stdout.strip()
        status_result = run(["git", "-C", str(directory), "status", "--short"])
        if status_result.returncode == 0:
            dirty = bool(status_result.stdout.strip())
        upstream_result = run(
            ["git", "-C", str(directory), "for-each-ref", "--format=%(upstream:short)", f"refs/heads/{branch}"]
        )
        if upstream_result.returncode == 0:
            upstream = upstream_result.stdout.strip()

    reasons = ["unregistered-clone"]
    classification = "archive"

    if not is_git_repo:
        reasons.append("broken-repo")
    if dirty:
        reasons.append("dirty")
    if branch in pr_heads:
        reasons.append("open-pr")
        classification = "manual-review"
    if "backup" in directory.name or "orphan" in directory.name:
        reasons.append("backup-like-name")

    return {
        "kind": "unregistered-clone",
        "path": str(directory),
        "name": directory.name,
        "branch": branch,
        "upstream": upstream,
        "dirty": dirty,
        "classification": classification,
        "reasons": reasons,
    }


def classify_branch(row, current_branch, worktree_paths, pr_heads):
    reasons = []
    classification = "manual-review"
    attached_path = worktree_paths.get(row["branch"])

    if row["branch"] in ("main", "develop"):
        reasons.append("base-branch")
        classification = "keep"
    if row["branch"] == current_branch:
        reasons.append("current-branch")
        classification = "keep"
    if attached_path:
        reasons.append("attached-worktree")
        classification = "keep"
    if row["branch"] in pr_heads:
        reasons.append("open-pr")
        classification = "keep"

    if not row["upstream"]:
        reasons.append("no-upstream")
        if classification != "keep":
            classification = "archive"
    elif row["track"] in (">", "<>"):
        reasons.append("local-commits-not-on-upstream")
        if classification != "keep":
            classification = "archive"
    elif row["track"] == "<":
        reasons.append("behind-upstream")
    elif row["track"] == "=":
        reasons.append("in-sync-with-upstream")

    return {
        "kind": "branch",
        "branch": row["branch"],
        "upstream": row["upstream"] or None,
        "track": row["track"] or None,
        "sha": row["sha"],
        "subject": row["subject"],
        "worktreePath": attached_path,
        "classification": classification,
        "reasons": reasons,
    }


def base_branch_status(branch_name):
    local_sha = git_output(["rev-parse", "--verify", branch_name])
    remote_sha = git_output(["rev-parse", "--verify", f"origin/{branch_name}"])
    local_ahead = 0
    remote_ahead = 0

    if local_sha and remote_sha:
        counts = git_output(["rev-list", "--left-right", "--count", f"origin/{branch_name}...{branch_name}"])
        if counts:
            left, right = counts.split()
            remote_ahead = int(left)
            local_ahead = int(right)

    return {
        "branch": branch_name,
        "localSha": local_sha or None,
        "remoteSha": remote_sha or None,
        "localAhead": local_ahead,
        "remoteAhead": remote_ahead,
    }


parser = argparse.ArgumentParser(
    description="Inventory registered worktrees, orphan metadata, sibling clones, and branch/PR drift for the scheduler repo."
)
parser.add_argument("--json", action="store_true", help="Emit JSON instead of a human-readable report.")
parser.add_argument("--github-root", default=os.getenv("GITHUB_ROOT", str(Path.home() / "Documents/GitHub")))
parser.add_argument("--repo-prefix", default=os.getenv("WORKTREE_REPO_PREFIX", "scheduler-v2-codex"))
parser.add_argument("--primary-repo-name", default=os.getenv("WORKTREE_PRIMARY_REPO_NAME"))
parser.add_argument("--porcelain-file", default=os.getenv("WORKTREE_PORCELAIN_FILE"))
parser.add_argument("--branch-tsv-file", default=os.getenv("WORKTREE_BRANCH_TSV_FILE"))
parser.add_argument("--pr-json-file", default=os.getenv("WORKTREE_PR_JSON_FILE"))
parser.add_argument("--git-common-dir", default=os.getenv("WORKTREE_GIT_COMMON_DIR"))
parser.add_argument("--current-path", default=os.getenv("WORKTREE_CURRENT_PATH"))
args = parser.parse_args()

repo_root = git_output(["rev-parse", "--show-toplevel"]) or str(Path.cwd())
git_common_dir = args.git_common_dir or git_output(["rev-parse", "--git-common-dir"]) or os.path.join(repo_root, ".git")
git_common_dir = str(Path(git_common_dir).resolve())
current_path = real(args.current_path or str(Path.cwd().resolve()))
primary_repo_name = args.primary_repo_name or args.repo_prefix
current_branch = git_output(["branch", "--show-current"])

if args.porcelain_file:
    porcelain_text = Path(args.porcelain_file).read_text(encoding="utf8")
else:
    porcelain_text = git_output(["worktree", "list", "--porcelain"])

open_prs = load_open_prs(args.pr_json_file)
pr_heads = {item.get("headRefName", "") for item in open_prs if item.get("headRefName")}
branch_rows = load_branch_rows(args.branch_tsv_file)

parsed_worktrees = parse_porcelain(porcelain_text)
registered_records = [
    classify_registered_worktree(record, current_path, primary_repo_name, pr_heads)
    for record in parsed_worktrees
]
registered_paths = {real(item["path"]) for item in registered_records}
worktree_paths = {item["branch"]: item["path"] for item in registered_records if item["branch"]}

orphan_records = []
worktrees_dir = Path(git_common_dir) / "worktrees"
if worktrees_dir.exists():
    for child in sorted(worktrees_dir.iterdir()):
        if not child.is_dir():
            continue
        record = classify_orphan_metadata(child, registered_paths)
        if record:
            orphan_records.append(record)

unregistered_clones = []
github_root = Path(args.github_root)
if github_root.exists():
    for child in sorted(github_root.iterdir()):
        if not child.is_dir():
            continue
        record = classify_unregistered_clone(child, registered_paths, real(repo_root), pr_heads)
        if record:
            unregistered_clones.append(record)

branch_records = [
    classify_branch(row, current_branch, worktree_paths, pr_heads)
    for row in branch_rows
]

operational_items = registered_records + orphan_records + unregistered_clones
classification_totals = {name: 0 for name in CLASSIFICATIONS}
for item in operational_items:
    classification_totals[item["classification"]] += 1

branch_totals = {"keep": 0, "archive": 0, "manual-review": 0}
for item in branch_records:
    branch_totals[item["classification"]] += 1

zero_head_count = sum(1 for item in registered_records if item["head"] == ZERO_HEAD)
locked_count = sum(1 for item in registered_records if item["locked"])
prunable_count = sum(1 for item in registered_records if item["prunable"])
broken_registered_count = sum(1 for item in registered_records if item["classification"] in ("recover", "manual-review"))

payload = {
    "repoRoot": repo_root,
    "gitCommonDir": git_common_dir,
    "githubRoot": str(github_root),
    "repoPrefix": args.repo_prefix,
    "primaryRepoName": primary_repo_name,
    "currentPath": current_path,
    "currentBranch": current_branch or None,
    "summary": {
        "registeredWorktreeCount": len(registered_records),
        "brokenRegisteredWorktreeCount": broken_registered_count,
        "zeroHeadCount": zero_head_count,
        "lockedCount": locked_count,
        "prunableCount": prunable_count,
        "orphanMetadataCount": len(orphan_records),
        "unregisteredCloneCount": len(unregistered_clones),
        "localBranchCount": len(branch_records),
        "openPrBranchCount": len(pr_heads),
        "keepCount": classification_totals["keep"],
        "recoverCount": classification_totals["recover"],
        "archiveCount": classification_totals["archive"],
        "removeCandidateCount": classification_totals["remove-candidate"],
        "manualReviewCount": classification_totals["manual-review"],
        "branchKeepCount": branch_totals["keep"],
        "branchArchiveCount": branch_totals["archive"],
        "branchManualReviewCount": branch_totals["manual-review"],
    },
    "baseBranches": {
        "develop": base_branch_status("develop"),
        "main": base_branch_status("main"),
    },
    "openPullRequests": open_prs,
    "registeredWorktrees": registered_records,
    "orphanMetadata": orphan_records,
    "unregisteredClones": unregistered_clones,
    "branches": branch_records,
}

if args.json:
    json.dump(payload, sys.stdout, indent=2)
    sys.stdout.write("\n")
    sys.exit(0)

summary = payload["summary"]
print("Scheduler repo recovery inventory")
print(f"Repo root:      {payload['repoRoot']}")
print(f"Git common dir: {payload['gitCommonDir']}")
print(f"Current path:   {payload['currentPath']}")
print(f"Current branch: {payload['currentBranch'] or '<detached>'}")
print("")
print("Summary")
print(f"  registered worktrees:   {summary['registeredWorktreeCount']}")
print(f"  broken registered:      {summary['brokenRegisteredWorktreeCount']}")
print(f"  orphan metadata dirs:   {summary['orphanMetadataCount']}")
print(f"  unregistered clones:    {summary['unregisteredCloneCount']}")
print(f"  open PR branches:       {summary['openPrBranchCount']}")
print(f"  classifications:        keep={summary['keepCount']} recover={summary['recoverCount']} archive={summary['archiveCount']} remove-candidate={summary['removeCandidateCount']} manual-review={summary['manualReviewCount']}")
print(f"  branch triage:          keep={summary['branchKeepCount']} archive={summary['branchArchiveCount']} manual-review={summary['branchManualReviewCount']}")
print("")
print("Base branches")
for name, info in payload["baseBranches"].items():
    print(
        f"  {name}: local={info['localSha'] or '<missing>'} remote={info['remoteSha'] or '<missing>'} local-ahead={info['localAhead']} remote-ahead={info['remoteAhead']}"
    )

if registered_records:
    print("\nRegistered worktrees")
    for item in registered_records:
        print(f"  [{item['classification']}] {item['name']}")
        print(f"    branch: {item['branch'] or '<none>'}")
        print(f"    head: {item['head'] or '<none>'}")
        print(
            f"    flags: locked={str(item['locked']).lower()} prunable={str(item['prunable']).lower()} dirty={item['dirty'] if item['dirty'] is not None else 'unknown'} entries={item['topLevelEntryCount'] if item['topLevelEntryCount'] is not None else 'unknown'}"
        )
        print(f"    path: {item['path']}")
        if item["reasons"]:
            print(f"    reasons: {', '.join(item['reasons'])}")

if orphan_records:
    print("\nOrphan metadata")
    for item in orphan_records:
        print(f"  [{item['classification']}] {item['name']}")
        print(f"    path: {item['path']}")
        print(f"    files: {item['fileCount']}")
        if item["resolvedWorktreePath"]:
            print(f"    resolved worktree path: {item['resolvedWorktreePath']}")
        print(f"    reasons: {', '.join(item['reasons'])}")

if unregistered_clones:
    print("\nUnregistered sibling clones")
    for item in unregistered_clones:
        print(f"  [{item['classification']}] {item['name']}")
        print(f"    branch: {item['branch']}")
        print(f"    dirty: {item['dirty'] if item['dirty'] is not None else 'unknown'}")
        print(f"    path: {item['path']}")
        print(f"    reasons: {', '.join(item['reasons'])}")

print("\nBranch preservation")
for item in branch_records:
    if item["classification"] == "keep":
        continue
    print(f"  [{item['classification']}] {item['branch']}")
    print(f"    upstream: {item['upstream'] or '<none>'}")
    print(f"    track: {item['track'] or '<none>'}")
    if item["worktreePath"]:
        print(f"    worktree: {item['worktreePath']}")
    print(f"    reasons: {', '.join(item['reasons'])}")
PY
