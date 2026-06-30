# AI Developer Agent

Local Python sidecar runtime for AI Developer Desktop.

The Electron main process starts this agent with:

```bash
python -m ai_dev_agent.cli --repo <path> --task "<task>" --model <model> --run-id <run_id>
```

The agent emits newline-delimited JSON events to stdout. Electron parses the stream and forwards structured events to the renderer.

## Development

```bash
python -m venv .venv
.venv/Scripts/activate
pip install -e ".[dev]"
python -m ai_dev_agent.cli --repo .. --task "Inspect repository"
```

The runtime is bounded by default:

```bash
python -m ai_dev_agent.cli --repo .. --task "Inspect repository" --max-steps 8 --test-timeout-seconds 25
```

By default, test commands are detected but not executed. Use `--run-tests` for an explicit bounded test run. Write and destructive shell actions are classified by policy and refused until an explicit approval flow is added in the desktop app.
