"""Offline checks for the Codex event assertions, independent of model runs."""
import unittest

from codex_eval import evaluate


class CodexEventTests(unittest.TestCase):
    def setUp(self):
        self.call = {
            "id": "call_1", "type": "mcp_tool_call", "server": "appium",
            "tool": "appium_session_management", "status": "completed",
            "arguments": {"action": "create", "platform": "ios"},
        }
        self.events = [
            {"type": "item.started", "item": self.call},
            {"type": "item.completed", "item": self.call},
            {"type": "turn.completed"},
        ]

    def errors(self, events=None, forbidden=()):
        return evaluate(
            self.events if events is None else events,
            "appium_session_management", {"action": "create", "platform": "ios"}, forbidden,
        )[1]

    def test_started_event_is_not_double_counted(self):
        self.assertEqual(self.errors(), [])

    def test_missing_or_repeated_calls_fail(self):
        self.assertTrue(self.errors([{"type": "turn.completed"}]))
        self.assertTrue(self.errors(self.events + [self.events[1]]))

    def test_forbidden_key_presence(self):
        for value in (None, "", "http://localhost:4723"):
            with self.subTest(value=value):
                self.call["arguments"]["remoteServerUrl"] = value
                self.assertTrue(self.errors())

    def test_wrong_arguments_and_server_fail(self):
        self.call["arguments"]["platform"] = "android"
        self.assertTrue(self.errors())
        self.call["arguments"]["platform"] = "ios"
        self.call["server"] = "other"
        self.assertTrue(self.errors())

    def test_forbidden_tool_fails(self):
        self.assertTrue(self.errors(forbidden=["appium_session_management"]))

    def test_runtime_and_tool_errors_fail(self):
        self.assertTrue(self.errors(self.events[:-1]))
        self.assertTrue(self.errors(self.events + [{"type": "turn.failed"}]))
        self.call["status"] = "failed"
        self.call["error"] = {"message": "approval required"}
        self.assertTrue(self.errors())


if __name__ == "__main__":
    unittest.main()
