from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import typer

from ai_dev_agent.runtime import AgentRuntime, emit_jsonl

app = typer.Typer(help="AI Developer Desktop local agent sidecar")


@app.command()
def run(
    repo: Path = typer.Option(..., "--repo", exists=False, file_okay=False),
    task: str = typer.Option(..., "--task"),
    model: str = typer.Option("gpt-5-codex", "--model"),
    run_id: str = typer.Option("", "--run-id"),
    max_steps: int = typer.Option(8, "--max-steps", min=1, max=32),
    test_timeout_seconds: int = typer.Option(25, "--test-timeout-seconds", min=1, max=120),
    run_tests: bool = typer.Option(False, "--run-tests"),
) -> None:
    runtime = AgentRuntime(
        repo=repo,
        task=task,
        model=model,
        run_id=run_id or f"run_{uuid4().hex}",
        max_steps=max_steps,
        test_timeout_seconds=test_timeout_seconds,
        run_tests=run_tests,
    )
    emit_jsonl(runtime.run())


if __name__ == "__main__":
    app()
