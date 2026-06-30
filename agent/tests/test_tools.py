from ai_dev_agent.tools.contracts import ToolRisk
from ai_dev_agent.tools.shell_tools import classify_command, run_command
from ai_dev_agent.tools.test_tools import detect_test_command


def test_classify_command_marks_read_only_git_as_read() -> None:
    assert classify_command(["git", "status", "--short"]) == ToolRisk.READ
    assert classify_command(["git", "diff", "--stat"]) == ToolRisk.READ


def test_classify_command_marks_git_reset_as_destructive() -> None:
    assert classify_command(["git", "reset", "--hard"]) == ToolRisk.DESTRUCTIVE


def test_run_command_refuses_unknown_command_without_approval(tmp_path) -> None:
    result = run_command(command=["custom-tool", "--write"], cwd=tmp_path)

    assert result.exitCode is None
    assert result.requiresApproval is True
    assert result.risk == ToolRisk.UNKNOWN
    assert "requires approval" in result.stderr


def test_detect_test_command_handles_utf8_bom_package_json(tmp_path) -> None:
    (tmp_path / "package.json").write_text(
        '\ufeff{"scripts":{"test":"node --test"}}',
        encoding="utf-8",
    )

    assert detect_test_command(tmp_path) == ["npm", "test"]
