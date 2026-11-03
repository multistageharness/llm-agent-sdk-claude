// 21-cost-report — cost / usage reporting from result.total_cost_usd (a client-side
// estimate, not authoritative billing) and per-model modelUsage.
import { createHarness } from './_shared.mjs';
import { parseCommonArgs, requirePrompt, baseConfig, runExample } from './_shared.mjs';

const args = parseCommonArgs();
const prompt = requirePrompt(args, 'node examples/21-cost-report.mjs "<question>"');
const harness = await createHarness({ config: baseConfig(args) });
await runExample(harness, async () => {
  for (let i = 0; i < 3; i += 1) await harness.chat(`${prompt} (${i + 1})`);
  const s = harness.usageSummary();
  console.log(`total tokens: ${s.tokens.total}`);
  console.log(`est. cost: ${s.cost != null ? `$${s.cost}` : 'n/a'} (client-side estimate, not billing)`);
  console.log('per-model:', JSON.stringify(s.models, null, 2));
});
