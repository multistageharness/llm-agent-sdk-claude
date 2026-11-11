// 06a-token-budget-within — a run that fits comfortably within the budget.
//
// Run (copy-paste; from the package root, with ANTHROPIC_API_KEY set):
//   node examples/06a-token-budget-within.mjs "What is 2+2?"
import { createHarness } from './_shared.mjs';
import { parseCommonArgs, requirePrompt, baseConfig, runExample, printResult } from './_shared.mjs';

const args = parseCommonArgs();
const prompt = requirePrompt(args, 'node examples/06a-token-budget-within.mjs "<short question>"');
const harness = await createHarness({ config: baseConfig(args, { tokenBudget: { maxTokens: 200_000, enforcement: 'block' } }) });
await runExample(harness, async () => {
  const report = harness.preflight(prompt, { expectedOutputTokens: 200 });
  console.error(`fits: ${report.fitsWithinBudget} (${report.estimatedTotalTokens} of ${report.budget.maxTokens})`);
  printResult(await harness.chat(prompt));
});
