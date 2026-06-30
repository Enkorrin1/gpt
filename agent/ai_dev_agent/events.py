from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field


class AgentEventType(StrEnum):
    TASK_STARTED = "task.started"
    ASSISTANT_DELTA = "assistant.delta"
    TOOL_CALL = "tool.call"
    TOOL_RESULT = "tool.result"
    COMMAND_OUTPUT = "command.output"
    FILE_CHANGED = "file.changed"
    DIFF_READY = "diff.ready"
    TASK_COMPLETED = "task.completed"
    TASK_FAILED = "task.failed"


class AgentEvent(BaseModel):
    id: str = Field(default_factory=lambda: f"evt_{uuid4().hex}")
    runId: str
    type: AgentEventType
    ts: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    message: str | None = None
    payload: dict[str, Any] | None = None


def make_event(
    *,
    run_id: str,
    event_type: AgentEventType,
    message: str | None = None,
    payload: dict[str, Any] | None = None,
) -> AgentEvent:
    return AgentEvent(runId=run_id, type=event_type, message=message, payload=payload)

