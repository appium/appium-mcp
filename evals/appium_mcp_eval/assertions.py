from dataclasses import dataclass

from mcp_eval.evaluators.base import EvaluatorContext, SyncEvaluator
from mcp_eval.evaluators.shared import EvaluatorResult


@dataclass
class NoArgumentKey(SyncEvaluator):
    """Check key presence, including a key supplied with null or an empty value."""

    tool_name: str
    key: str
    requires_final_metrics: bool = True

    def evaluate_sync(self, ctx: EvaluatorContext) -> EvaluatorResult:
        calls = [call for call in ctx.tool_calls if call.name == self.tool_name]
        offending = [call.arguments for call in calls if self.key in call.arguments]
        return EvaluatorResult(
            passed=bool(calls) and not offending,
            expected=f"{self.tool_name} called without {self.key}",
            actual=offending if calls else "tool not called",
        )
