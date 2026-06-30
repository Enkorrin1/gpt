from ai_dev_agent.events import AgentEventType, make_event


def test_make_event_uses_shared_contract_names() -> None:
    event = make_event(
        run_id="run_test",
        event_type=AgentEventType.TASK_STARTED,
        message="Started",
    )

    payload = event.model_dump(mode="json")

    assert payload["runId"] == "run_test"
    assert payload["type"] == "task.started"
    assert payload["message"] == "Started"
    assert payload["id"].startswith("evt_")

