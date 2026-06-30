from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class ModelRoute:
    provider: str
    model: str


class ModelProvider(Protocol):
    name: str

    async def stream_task(self, *, prompt: str, repo_context: str) -> str:
        """Stream or return model output for an agent planning step."""


def parse_model_route(value: str) -> ModelRoute:
    if "/" in value:
        provider, model = value.split("/", 1)
        return ModelRoute(provider=provider, model=model)

    return ModelRoute(provider="openai", model=value)

