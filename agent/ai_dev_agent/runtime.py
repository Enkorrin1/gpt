from __future__ import annotations

import json
import time
from collections.abc import Iterator
from pathlib import Path

from ai_dev_agent.events import AgentEvent, AgentEventType, make_event
from ai_dev_agent.providers import parse_model_route
from ai_dev_agent.tools.contracts import CommandResult, ToolCall, ToolResult, ToolRisk
from ai_dev_agent.tools.git_tools import get_diff_stat, get_git_summary
from ai_dev_agent.tools.registry import list_tool_definitions
from ai_dev_agent.tools.test_tools import describe_test_detection, run_detected_tests


class AgentRuntime:
    def __init__(
        self,
        *,
        repo: Path,
        task: str,
        model: str,
        run_id: str,
        max_steps: int = 8,
        test_timeout_seconds: int = 25,
        run_tests: bool = False,
    ) -> None:
        self.repo = repo
        self.task = task
        self.model = model
        self.run_id = run_id
        self.max_steps = max_steps
        self.test_timeout_seconds = test_timeout_seconds
        self.run_tests = run_tests

    def run(self) -> Iterator[AgentEvent]:
        route = parse_model_route(self.model)
        yield make_event(
            run_id=self.run_id,
            event_type=AgentEventType.TASK_STARTED,
            message="Task started",
            payload={
                "repo": str(self.repo),
                "model": route.model,
                "provider": route.provider,
                "maxSteps": self.max_steps,
                "permissions": {"write": False, "destructive": False},
                "tools": list_tool_definitions(),
            },
        )

        yield make_event(
            run_id=self.run_id,
            event_type=AgentEventType.ASSISTANT_DELTA,
            message=(
                f"Planning bounded local inspection for: {self.task}\n"
                "1. Read repository status\n"
                "2. Summarize current diff\n"
                "3. Detect test command and wait for approval before execution\n"
                "4. Return review-ready result"
            ),
        )

        if not self.repo.exists():
            yield make_event(
                run_id=self.run_id,
                event_type=AgentEventType.TASK_FAILED,
                message="Repository path does not exist",
                payload={"repo": str(self.repo)},
            )
            return

        yield self._tool_call("git.summary", {"repo": str(self.repo)}, ToolRisk.READ)
        git_summary = get_git_summary(self.repo)
        yield self._tool_result(
            ToolResult(
                name="git.summary",
                success=bool(git_summary.get("isGitRepo")),
                summary="Read Git status" if git_summary.get("isGitRepo") else "Repository is not a Git repo",
                metadata=git_summary,
            )
        )

        if not git_summary.get("isGitRepo"):
            yield make_event(
                run_id=self.run_id,
                event_type=AgentEventType.TASK_FAILED,
                message=str(git_summary.get("error") or "Repository is not a Git repository"),
                payload=git_summary,
            )
            return

        yield self._tool_call("git.diff_stat", {"repo": str(self.repo)}, ToolRisk.READ)
        diff_stat = get_diff_stat(self.repo)
        yield self._tool_result(
            ToolResult(
                name="git.diff_stat",
                success=True,
                summary=(
                    f"{diff_stat['fileCount']} changed files, "
                    f"+{diff_stat['additions']} -{diff_stat['deletions']}"
                ),
                metadata=diff_stat,
            )
        )

        yield self._tool_call("tests.detect", {"repo": str(self.repo)}, ToolRisk.READ)
        test_detection = describe_test_detection(self.repo)
        yield self._tool_result(
            ToolResult(
                name="tests.detect",
                success=True,
                summary=(
                    "Detected test command"
                    if test_detection["detected"]
                    else "No test command detected"
                ),
                metadata=test_detection,
            )
        )

        test_result: CommandResult | None = None
        if test_detection["command"] and self.run_tests:
            yield self._tool_call(
                "tests.run",
                {
                    "repo": str(self.repo),
                    "command": test_detection["command"],
                    "timeoutSeconds": self.test_timeout_seconds,
                },
                ToolRisk.EXECUTE,
            )
            test_result = run_detected_tests(
                self.repo,
                timeout_seconds=self.test_timeout_seconds,
            )
            if test_result:
                yield make_event(
                    run_id=self.run_id,
                    event_type=AgentEventType.COMMAND_OUTPUT,
                    message=_format_command_output(test_result),
                    payload=test_result.model_dump(mode="json"),
                )
                yield self._tool_result(
                    ToolResult(
                        name="tests.run",
                        success=test_result.exitCode == 0 and not test_result.timedOut,
                        summary=_test_summary(test_result),
                        risk=test_result.risk,
                        metadata=test_result.model_dump(mode="json"),
                    )
                )
        else:
            skipped_reason = (
                "Test command detected but execution is waiting for user approval"
                if test_detection["command"]
                else "No standard test command was detected"
            )
            yield self._tool_result(
                ToolResult(
                    name="tests.run",
                    success=True,
                    summary=f"Skipped tests: {skipped_reason}",
                    risk=ToolRisk.EXECUTE,
                    metadata={
                        "skipped": True,
                        "reason": skipped_reason,
                        "command": test_detection["command"],
                    },
                )
            )

        time.sleep(0.05)
        yield make_event(
            run_id=self.run_id,
            event_type=AgentEventType.DIFF_READY,
            message="Diff is ready for review",
            payload={
                "changedFiles": diff_stat.get("changedFiles", []),
                "test": test_result.model_dump(mode="json") if test_result else None,
            },
        )

        yield make_event(
            run_id=self.run_id,
            event_type=AgentEventType.TASK_COMPLETED,
            message="Agent inspection completed",
            payload={
                "changedFiles": diff_stat.get("fileCount", 0),
                "testsPassed": test_result.exitCode == 0 if test_result else None,
            },
        )

    def _tool_call(self, name: str, args: dict[str, object], risk: ToolRisk) -> AgentEvent:
        call = ToolCall(
            name=name,
            args=args,
            risk=risk,
            requiresApproval=risk in {ToolRisk.WRITE, ToolRisk.DESTRUCTIVE, ToolRisk.UNKNOWN},
        )
        return make_event(
            run_id=self.run_id,
            event_type=AgentEventType.TOOL_CALL,
            message=name,
            payload=call.model_dump(mode="json"),
        )

    def _tool_result(self, result: ToolResult) -> AgentEvent:
        return make_event(
            run_id=self.run_id,
            event_type=AgentEventType.TOOL_RESULT,
            message=result.summary,
            payload=result.model_dump(mode="json"),
        )


def emit_jsonl(events: Iterator[AgentEvent]) -> None:
    for event in events:
        print(json.dumps(event.model_dump(mode="json"), ensure_ascii=False), flush=True)


def _format_command_output(result: CommandResult) -> str:
    lines = [
        f"$ {' '.join(result.command)}",
        f"exitCode={result.exitCode}" if result.exitCode is not None else "exitCode=null",
    ]
    if result.timedOut:
        lines.append("timedOut=true")
    if result.stdout.strip():
        lines.append(result.stdout.strip())
    if result.stderr.strip():
        lines.append(result.stderr.strip())
    return "\n".join(lines)


def _test_summary(result: CommandResult) -> str:
    if result.timedOut:
        return "Test command timed out"
    if result.exitCode is None:
        return "Test command could not start"
    if result.exitCode == 0:
        return "Tests passed"
    return f"Tests failed with exit code {result.exitCode}"
