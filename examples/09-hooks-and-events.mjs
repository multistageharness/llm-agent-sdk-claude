// 09-hooks-and-events — the native hook + event lifecycle. beforeRun/afterRun and
// beforeToolCall hooks are bridged onto native SDK hooks (PreToolUse/PostToolUse).
import { createHarness } from './_shared.mjs';
import { parseCommonArgs, requirePrompt, baseConfig, runExample, printResult } from './_shared.mjs';

const args = parseCommonArgs();
const prompt = requirePrompt(args, 'node examples/09-hooks-and-events.mjs "<question>"');
const harness = await createHarness({
  config: baseConfig(args),
  hooks: {
    beforeRun: ({ prompt: p }) => console.error(`[hook] beforeRun: ${p.slice(0, 40)}...`),
    afterRun: ({ usage }) => console.error(`[hook] afterRun: ${usage.totalTokens} tokens`),
    beforeToolCall: ({ toolName }) => console.error(`[hook] beforeToolCall: ${toolName}`),
  },
});
for (const ev of ['run:start', 'run:end', 'session:created', 'usage:tokens']) {
  harness.on(ev, () => console.error(`[event] ${ev}`));
}
await runExample(harness, async () => {
  printResult(await harness.chat(prompt));
});
