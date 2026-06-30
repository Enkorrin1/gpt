from __future__ import annotations

from pydantic import BaseModel, Field

from ai_dev_agent.tools.contracts import ToolRisk


class ToolDefinition(BaseModel):
    name: str
    description: str
    risk: ToolRisk
    inputSchema: dict[str, object] = Field(default_factory=dict)
    sideEffect: str


TOOL_REGISTRY: dict[str, ToolDefinition] = {
    "git.summary": ToolDefinition(
        name="git.summary",
        description="Read branch, remote, dirty state, and changed files for the selected repository.",
        risk=ToolRisk.READ,
        inputSchema={"repo": "path"},
        sideEffect="read-only git commands",
    ),
    "git.diff_stat": ToolDefinition(
        name="git.diff_stat",
        description="Read compact diff statistics for changed files.",
        risk=ToolRisk.READ,
        inputSchema={"repo": "path"},
        sideEffect="read-only git diff",
    ),
    "tests.detect": ToolDefinition(
        name="tests.detect",
        description="Detect the most likely project test command without executing it.",
        risk=ToolRisk.READ,
        inputSchema={"repo": "path"},
        sideEffect="read project metadata",
    ),
    "tests.run": ToolDefinition(
        name="tests.run",
        description="Run the detected test command with a short timeout.",
        risk=ToolRisk.EXECUTE,
        inputSchema={"repo": "path", "command": "string[]", "timeoutSeconds": "number"},
        sideEffect="bounded local process execution",
    ),
    "shell.run": ToolDefinition(
        name="shell.run",
        description="Run a local command only when risk policy allows it.",
        risk=ToolRisk.UNKNOWN,
        inputSchema={"repo": "path", "command": "string[]", "timeoutSeconds": "number"},
        sideEffect="depends on command risk classification",
    ),
}


def list_tool_definitions() -> list[dict[str, object]]:
    return [definition.model_dump(mode="json") for definition in TOOL_REGISTRY.values()]

