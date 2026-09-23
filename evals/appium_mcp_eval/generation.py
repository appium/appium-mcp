"""Surface provider errors that mcp-agent records but does not raise."""
from mcp_agent.workflows.llm.augmented_llm import RequestParams
from mcp_eval.evaluators.base import SyncEvaluator
from mcp_eval.evaluators.shared import EvaluatorResult


class GenerationSucceeded(SyncEvaluator):
    def evaluate_sync(self, ctx):
        spans = ctx.span_tree.find(
            lambda span: "AugmentedLLM" in span.name and span.name.endswith(".generate")
        ) if ctx.span_tree else []
        errors = [
            event.get("attributes", {}).get("exception.message", "LLM generation failed")
            for span in spans
            for event in span.events
            if event.get("name") == "exception"
        ]
        return EvaluatorResult(
            passed=bool(spans) and not errors,
            expected="LLM generation completed without a provider/runtime exception",
            actual=errors or ("completed" if spans else "generation trace missing"),
        )


async def generate(agent, prompt):
    response = await agent.generate_str(prompt, request_params=RequestParams(max_iterations=4))
    # generate_str has flushed OTEL. Check before registering behavioral assertions.
    agent.session.evaluate_now(GenerationSucceeded(), response, "llm_generation_succeeded")
    if not agent.session.all_passed():
        raise RuntimeError(
            "LLM generation failed; behavioral assertions were not run. "
            "See llm_generation_succeeded in the eval report for the provider error."
        )
    return response
