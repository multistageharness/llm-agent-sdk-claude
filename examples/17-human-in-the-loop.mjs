// 17-human-in-the-loop — human approval via a beforeToolCall veto. The hook
// approves an allowlist of read-only tools and denies everything else; the
// runtime records the denial in result.permission_denials and the tool never runs.
import { createHarness } from './_shared.mjs';
import { parseCommonArgs, requirePrompt, baseConfig, runExample, printResult } from './_shared.mjs';

const args = parseCommonArgs();
const prompt = requirePrompt(args, 'node examples/17-human-in-the-loop.mjs "<task>"');
const APPROVED = new Set(['get_weather', 'get_time']);
const harness = await createHarness({
  config: baseConfig(args),
  hooks: {
    // harness tools arrive qualified (mcp__harness__get_weather); match the bare name
    beforeToolCall: ({ toolName, bareToolName }) => {
      const name = bareToolName ?? String(toolName).replace(/^mcp__[^_]+__/, '');
      return APPROVED.has(name) ? {} : { deny: true, reason: 'user declined' };
    },
  },
});
harness.registerTool({
  name: 'get_weather',
  description: 'Current weather for a city',
  parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
  handler: async ({ city }) => ({ city, forecast: 'sunny', tempC: 21 }),
});
harness.registerTool({
  name: 'get_time',
  description: 'Current time in an IANA time zone',
  parameters: { type: 'object', properties: { timeZone: { type: 'string' } }, required: ['timeZone'] },
  handler: async ({ timeZone }) => ({ timeZone, time: new Date().toLocaleTimeString('en-US', { timeZone }) }),
});
harness.on('tool:denied', ({ tool, reason }) => console.error(`denied ${tool}: ${reason}`));
await runExample(harness, async () => {
  printResult(await harness.chat(prompt));
  console.log('\n' + harness.usageReport());
});
