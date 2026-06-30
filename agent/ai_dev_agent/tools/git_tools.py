from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any


def _run_git(repo: Path, args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=repo,
        text=True,
        capture_output=True,
        check=False,
        timeout=10,
    )


def _parse_porcelain_line(line: str) -> dict[str, Any] | None:
    if len(line) < 4:
        return None

    status_code = line[:2]
    raw_path = line[3:].strip()
    old_path: str | None = None
    path = raw_path

    if " -> " in raw_path:
        old_path, path = raw_path.split(" -> ", 1)

    if status_code == "??":
        status = "untracked"
    elif "U" in status_code:
        status = "conflicted"
    elif "R" in status_code:
        status = "renamed"
    elif "A" in status_code:
        status = "added"
    elif "D" in status_code:
        status = "deleted"
    elif "M" in status_code:
        status = "modified"
    else:
        status = "unknown"

    result: dict[str, Any] = {
        "path": path,
        "status": status,
        "additions": 0,
        "deletions": 0,
    }
    if old_path:
        result["oldPath"] = old_path
    return result


def _parse_numstat(stdout: str) -> dict[str, dict[str, int]]:
    stats: dict[str, dict[str, int]] = {}
    for line in stdout.splitlines():
        parts = line.split("\t")
        if len(parts) < 3:
            continue

        additions_raw, deletions_raw, path = parts[0], parts[1], parts[-1]
        additions = int(additions_raw) if additions_raw.isdigit() else 0
        deletions = int(deletions_raw) if deletions_raw.isdigit() else 0
        stats[path] = {"additions": additions, "deletions": deletions}

    return stats


def get_git_summary(repo: Path) -> dict[str, Any]:
    if not repo.exists():
        return {
            "repoPath": str(repo),
            "rootPath": str(repo),
            "repoName": repo.name,
            "isGitRepo": False,
            "branch": "unknown",
            "isDirty": False,
            "changedFiles": [],
            "ahead": 0,
            "behind": 0,
            "error": "Repository path does not exist",
        }

    root_result = _run_git(repo, ["rev-parse", "--show-toplevel"])
    if root_result.returncode != 0:
        return {
            "repoPath": str(repo),
            "rootPath": str(repo),
            "repoName": repo.name,
            "isGitRepo": False,
            "branch": "unknown",
            "isDirty": False,
            "changedFiles": [],
            "ahead": 0,
            "behind": 0,
            "error": root_result.stderr.strip() or "Not a Git repository",
        }

    root_path = Path(root_result.stdout.strip())
    branch_result = _run_git(repo, ["branch", "--show-current"])
    upstream_result = _run_git(repo, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"])
    ahead_behind_result = _run_git(repo, ["rev-list", "--left-right", "--count", "HEAD...@{u}"])
    status_result = _run_git(repo, ["status", "--porcelain=v1"])
    numstat_result = _run_git(repo, ["diff", "--numstat", "HEAD"])
    remote_result = _run_git(repo, ["remote", "get-url", "origin"])

    changed_files = [
        parsed
        for line in status_result.stdout.splitlines()
        if (parsed := _parse_porcelain_line(line)) is not None
    ]
    stats_by_path = _parse_numstat(numstat_result.stdout)
    for file in changed_files:
        stats = stats_by_path.get(file["path"])
        if stats:
            file.update(stats)

    ahead = 0
    behind = 0
    if ahead_behind_result.returncode == 0:
        parts = ahead_behind_result.stdout.strip().split()
        if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
            ahead = int(parts[0])
            behind = int(parts[1])

    return {
        "repoPath": str(repo),
        "rootPath": str(root_path),
        "repoName": root_path.name,
        "isGitRepo": True,
        "branch": branch_result.stdout.strip() or "unknown",
        "upstream": upstream_result.stdout.strip() or None,
        "isDirty": len(changed_files) > 0,
        "changedFiles": changed_files,
        "remoteUrl": remote_result.stdout.strip() or None,
        "ahead": ahead,
        "behind": behind,
    }


def get_diff_stat(repo: Path) -> dict[str, Any]:
    summary = get_git_summary(repo)
    if not summary.get("isGitRepo"):
        return {
            "changedFiles": [],
            "fileCount": 0,
            "additions": 0,
            "deletions": 0,
            "error": summary.get("error"),
        }

    changed_files = summary["changedFiles"]
    additions = sum(int(file.get("additions", 0)) for file in changed_files)
    deletions = sum(int(file.get("deletions", 0)) for file in changed_files)
    return {
        "changedFiles": changed_files,
        "fileCount": len(changed_files),
        "additions": additions,
        "deletions": deletions,
    }
