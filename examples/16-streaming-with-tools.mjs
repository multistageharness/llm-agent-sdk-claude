// 16-streaming-with-tools — stream() with a registered tool; partial assistant
// deltas interleave with mcp__harness__* tool turns.
//
// Run (copy-paste; from the package root, with ANTHROPIC_API_KEY set):
//   node examples/16-streaming-with-tools.mjs "What time is it in Tokyo?"
import { createHarness } from './_shared.mjs';
import { parseCommonArgs, requirePrompt, baseConfig, runExample, printDelta } from './_shared.mjs';

const args = parseCommonArgs();
const prompt = requirePrompt(args, 'node examples/16-streaming-with-tools.mjs "What time is it in Tokyo?"');
const harness = await createHarness({ config: baseConfig(args) });
harness.registerTool({
  name: 'get_time',
  description: 'Get the current time for a timezone',
  parameters: { type: 'object', properties: { tz: { type: 'string' } }, required: ['tz'] },
  handler: async ({ tz }) => ({ tz, iso: new Date().toISOString() }),
});
harness.on('tool:call', ({ tool }) => process.stderr.write(`\n[tool ${tool}] `));
await runExample(harness, async () => {
  for await (const item of harness.stream(prompt)) {
    if (item.type === 'delta') printDelta(item.content);
  }
  console.log();
});
