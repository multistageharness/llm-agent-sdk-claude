// 06b-token-budget-exceeded — a run that trips budget:exceeded and throws
// TokenBudgetExceededError under enforcement: 'block'.
import { createHarness, TokenBudgetExceededError } from './_shared.mjs';
import { parseCommonArgs, requirePrompt, baseConfig, runExample, printResult } from './_shared.mjs';

const args = parseCommonArgs();
const prompt = requirePrompt(args, 'node examples/06b-token-budget-exceeded.mjs "<question>"');
// deliberately tiny budget so the heuristic preflight blocks before any run
const harness = await createHarness({ config: baseConfig(args, { tokenBudget: { maxTokens: 5, enforcement: 'block' } }) });
harness.on('budget:exceeded', (b) => console.error(`budget:exceeded — ${b.used}/${b.maxTokens}`));
await runExample(harness, async () => {
  try {
    printResult(await harness.chat(prompt));
  } catch (err) {
    if (err instanceof TokenBudgetExceededError) {
      console.error(`Blocked as expected: ${err.message}`);
      return;
    }
    throw err;
  }
});
