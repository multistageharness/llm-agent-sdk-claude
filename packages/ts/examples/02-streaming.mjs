// 02-streaming — token-by-token harness.stream() deltas (includePartialMessages).
//
// Run (copy-paste; from the package root, with ANTHROPIC_API_KEY set):
//   node examples/02-streaming.mjs "Write a haiku about streaming tokens."
import { createHarness } from './_shared.mjs';
import { parseCommonArgs, requirePrompt, baseConfig, runExample, printDelta } from './_shared.mjs';

const args = parseCommonArgs();
const prompt = requirePrompt(args, 'node examples/02-streaming.mjs "<question>"');
const harness = await createHarness({ config: baseConfig(args) });
await runExample(harness, async () => {
  for await (const item of harness.stream(prompt)) {
    if (item.type === 'delta') printDelta(item.content);
    else if (item.type === 'done') console.log(`\n\n[done] ${item.usage.totalTokens} tokens`);
  }
});
