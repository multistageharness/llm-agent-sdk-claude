// 06-token-budget — token budget + preflight gate.
//
// Run (copy-paste; from the package root, with ANTHROPIC_API_KEY set):
//   node examples/06-token-budget.mjs "Explain token budgets in two sentences."
//   node examples/06-token-budget.mjs --token-budget 50000 --budget-warn 60 "Explain token budgets."
import { createHarness } from './_shared.mjs';
import { parseCommonArgs, requirePrompt, baseConfig, runExample, printResult } from './_shared.mjs';

const args = parseCommonArgs();
const prompt = requirePrompt(args, 'node examples/06-token-budget.mjs "<question>"');
const harness = await createHarness({ config: baseConfig(args, { tokenBudget: { maxTokens: 200_000, enforcement: 'warn' } }) });
harness.on('preflight', (r) => console.error(`preflight: ~${r.estimatedTotalTokens} tokens, fits=${r.fitsWithinBudget}`));
harness.on('budget:warn', (b) => console.error(`budget warn: ${b.utilizationPercent}% used`));
await runExample(harness, async () => {
  const report = harness.preflight(prompt, { expectedOutputTokens: 500 });
  console.error(`recommendation: ${report.recommendation}`);
  printResult(await harness.chat(prompt));
});
