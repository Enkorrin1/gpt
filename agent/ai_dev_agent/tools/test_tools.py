from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ai_dev_agent.tools.contracts import CommandResult
from ai_dev_agent.tools.shell_tools import run_command


def detect_test_command(repo: Path) -> list[str] | None:
    package_json = repo / "package.json"
    if package_json.exists():
        try:
            package_data = json.loads(package_json.read_text(encoding="utf-8-sig"))
        except (OSError, json.JSONDecodeError):
            package_data = {}

        scripts = package_data.get("scripts")
        test_script = scripts.get("test") if isinstance(scripts, dict) else None
        if isinstance(test_script, str) and test_script.strip() and "no test specified" not in test_script:
            return ["npm", "test"]

    if (repo / "pyproject.toml").exists() and (repo / "agent" / "tests").exists():
        return ["python", "-m", "pytest", "agent/tests"]

    if (repo / "pyproject.toml").exists() and (repo / "tests").exists():
        return ["python", "-m", "pytest", "tests"]

    if (repo / "pytest.ini").exists() or (repo / "tox.ini").exists():
        return ["python", "-m", "pytest"]

    return None


def describe_test_detection(repo: Path) -> dict[str, Any]:
    command = detect_test_command(repo)
    return {
        "command": command,
        "detected": command is not None,
        "repoPath": str(repo),
    }


def run_detected_tests(repo: Path, *, timeout_seconds: int = 25) -> CommandResult | None:
    command = detect_test_command(repo)
    if not command:
        return None

    return run_command(
        command=command,
        cwd=repo,
        timeout_seconds=timeout_seconds,
        approved=False,
    )
