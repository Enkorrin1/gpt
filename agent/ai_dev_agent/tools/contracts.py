from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class ToolRisk(StrEnum):
    READ = "read"
    EXECUTE = "execute"
    WRITE = "write"
    DESTRUCTIVE = "destructive"
    UNKNOWN = "unknown"


class ToolCall(BaseModel):
    name: str
    args: dict[str, Any] = Field(default_factory=dict)
    risk: ToolRisk
    requiresApproval: bool = False


class ToolResult(BaseModel):
    name: str
    success: bool
    summary: str
    output: str = ""
    risk: ToolRisk = ToolRisk.READ
    metadata: dict[str, Any] = Field(default_factory=dict)


class CommandResult(BaseModel):
    command: list[str]
    cwd: str
    exitCode: int | None
    stdout: str = ""
    stderr: str = ""
    timedOut: bool = False
    risk: ToolRisk
    requiresApproval: bool

