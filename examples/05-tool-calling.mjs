// 05-tool-calling — registerTool() → in-process mcp__harness__* + the agentic loop.
import { createHarness } from './_shared.mjs';
import { parseCommonArgs, requirePrompt, baseConfig, runExample, printResult } from './_shared.mjs';

const args = parseCommonArgs();
const prompt = requirePrompt(args, 'node examples/05-tool-calling.mjs "What is the weather in Paris?"');
const harness = await createHarness({ config: baseConfig(args) });
harness.registerTool({
  name: 'get_weather',
  description: 'Get the current weather for a city',
  parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
  handler: async ({ city }) => ({ city, tempC: 21, conditions: 'sunny' }),
});
harness.on('tool:call', ({ tool, args: a }) => console.error(`→ ${tool}(${JSON.stringify(a)})`));
harness.on('tool:result', ({ tool }) => console.error(`← ${tool} ok`));
await runExample(harness, async () => {
  printResult(await harness.chat(prompt));
});
