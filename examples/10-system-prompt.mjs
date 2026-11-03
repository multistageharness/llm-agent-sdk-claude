// 10-system-prompt — systemPrompt preset/append shaping. In append mode the
// harness layers your text on top of the Claude Code preset:
//   { type: 'preset', preset: 'claude_code', append: '<your text>' }
import { createHarness } from './_shared.mjs';
import { parseCommonArgs, requirePrompt, baseConfig, runExample, printResult } from './_shared.mjs';

const args = parseCommonArgs();
const prompt = requirePrompt(args, 'node examples/10-system-prompt.mjs "<question>"');
const harness = await createHarness({
  config: baseConfig(args, {
    systemPrompt: 'Always answer in the style of a terse senior engineer. No preamble.',
    systemPromptMode: 'append',
  }),
});
await runExample(harness, async () => {
  printResult(await harness.chat(prompt));
});
