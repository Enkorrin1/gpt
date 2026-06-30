from __future__ import annotations

import subprocess
from shutil import which
from collections.abc import Sequence
from pathlib import Path

from ai_dev_agent.tools.contracts import CommandResult, ToolRisk

DESTRUCTIVE_TOKENS = {
    "rm",
    "rmdir",
    "del",
    "erase",
    "format",
    "shutdown",
}

WRITE_TOKENS = {
    "apply_patch",
    "mv",
    "move",
    "cp",
    "copy",
    "touch",
}

GIT_WRITE_SUBCOMMANDS = {
    "add",
    "am",
    "apply",
    "bisect",
    "checkout",
    "clean",
    "clone",
    "commit",
    "merge",
    "mv",
    "pull",
    "push",
    "rebase",
    "reset",
    "restore",
    "revert",
    "rm",
    "stash",
    "switch",
    "tag",
}

PACKAGE_WRITE_COMMANDS = {
    "install",
    "add",
    "remove",
    "uninstall",
    "update",
    "audit",
    "fix",
}

TEST_COMMANDS = {
    ("npm", "test"),
    ("npm", "run", "test"),
    ("pnpm", "test"),
    ("pnpm", "run", "test"),
    ("yarn", "test"),
    ("python", "-m", "pytest"),
    ("python3", "-m", "pytest"),
    ("pytest",),
}


def classify_command(command: Sequence[str]) -> ToolRisk:
    if not command:
        return ToolRisk.UNKNOWN

    executable = Path(command[0]).name.lower()
    first = executable.removesuffix(".exe")
    normalized = [part.lower() for part in command]

    if first in DESTRUCTIVE_TOKENS:
        return ToolRisk.DESTRUCTIVE

    if first in WRITE_TOKENS:
        return ToolRisk.WRITE

    if first == "git":
        subcommand = normalized[1] if len(normalized) > 1 else ""
        if subcommand in GIT_WRITE_SUBCOMMANDS:
            return ToolRisk.DESTRUCTIVE if subcommand in {"clean", "reset", "rm"} else ToolRisk.WRITE
        return ToolRisk.READ

    if first in {"npm", "pnpm", "yarn"}:
        subcommand = normalized[1] if len(normalized) > 1 else ""
        if subcommand in PACKAGE_WRITE_COMMANDS:
            return ToolRisk.WRITE
        if _starts_with(normalized, TEST_COMMANDS):
            return ToolRisk.EXECUTE
        return ToolRisk.UNKNOWN

    if _starts_with(normalized, TEST_COMMANDS):
        return ToolRisk.EXECUTE

    if first in {"ls", "dir", "pwd", "type", "cat", "python"}:
        return ToolRisk.READ

    return ToolRisk.UNKNOWN


def requires_approval(risk: ToolRisk) -> bool:
    return risk in {ToolRisk.WRITE, ToolRisk.DESTRUCTIVE, ToolRisk.UNKNOWN}


def run_command(
    *,
    command: Sequence[str],
    cwd: Path,
    timeout_seconds: int = 20,
    approved: bool = False,
) -> CommandResult:
    normalized_command = [str(part) for part in command if str(part)]
    risk = classify_command(normalized_command)
    approval_required = requires_approval(risk)
    if approval_required and not approved:
        return CommandResult(
            command=normalized_command,
            cwd=str(cwd),
            exitCode=None,
            stderr=f"Command refused by policy: {risk.value} action requires approval.",
            risk=risk,
            requiresApproval=True,
        )

    resolved_command = _resolve_executable(normalized_command)
    try:
        completed = subprocess.run(
            resolved_command,
            cwd=cwd,
            text=True,
            capture_output=True,
            check=False,
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired as error:
        return CommandResult(
            command=normalized_command,
            cwd=str(cwd),
            exitCode=None,
            stdout=error.stdout or "",
            stderr=error.stderr or f"Command timed out after {timeout_seconds}s.",
            timedOut=True,
            risk=risk,
            requiresApproval=approval_required,
        )
    except OSError as error:
        return CommandResult(
            command=normalized_command,
            cwd=str(cwd),
            exitCode=None,
            stderr=str(error),
            risk=risk,
            requiresApproval=approval_required,
        )

    return CommandResult(
        command=normalized_command,
        cwd=str(cwd),
        exitCode=completed.returncode,
        stdout=completed.stdout,
        stderr=completed.stderr,
        risk=risk,
        requiresApproval=approval_required,
    )


def _starts_with(command: Sequence[str], prefixes: set[tuple[str, ...]]) -> bool:
    for prefix in prefixes:
        if tuple(command[: len(prefix)]) == prefix:
            return True
    return False


def _resolve_executable(command: list[str]) -> list[str]:
    if not command:
        return command

    resolved = which(command[0])
    if not resolved:
        return command

    return [resolved, *command[1:]]
