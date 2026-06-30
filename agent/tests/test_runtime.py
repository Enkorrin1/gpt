import subprocess

from ai_dev_agent.events import AgentEventType
from ai_dev_agent.runtime import AgentRuntime


def test_runtime_emits_bounded_git_and_diff_events(tmp_path) -> None:
    subprocess.run(["git", "init"], cwd=tmp_path, check=True, capture_output=True, text=True)
    subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=tmp_path, check=True)
    subprocess.run(["git", "config", "user.name", "Test User"], cwd=tmp_path, check=True)
    (tmp_path / "README.md").write_text("hello\n", encoding="utf-8")
    subprocess.run(["git", "add", "README.md"], cwd=tmp_path, check=True)
    subprocess.run(["git", "commit", "-m", "init"], cwd=tmp_path, check=True, capture_output=True, text=True)
    (tmp_path / "README.md").write_text("hello\nworld\n", encoding="utf-8")

    runtime = AgentRuntime(
        repo=tmp_path,
        task="Inspect repo",
        model="openai/gpt-4.1",
        run_id="run_test",
        test_timeout_seconds=1,
    )

    events = list(runtime.run())
    event_types = [event.type for event in events]

    assert event_types[0] == AgentEventType.TASK_STARTED
    assert AgentEventType.TOOL_CALL in event_types
    assert AgentEventType.TOOL_RESULT in event_types
    assert AgentEventType.DIFF_READY in event_types
    assert event_types[-1] == AgentEventType.TASK_COMPLETED

    diff_event = next(event for event in events if event.type == AgentEventType.DIFF_READY)
    assert diff_event.payload is not None
    assert diff_event.payload["changedFiles"][0]["path"] == "README.md"

