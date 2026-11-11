// 01-chat — buffered harness.chat() + usage report.
//
// Run (copy-paste; from the package root, with ANTHROPIC_API_KEY set):
//   node examples/01-chat.mjs "What is 2+2?"
//   node examples/01-chat.mjs --model claude-haiku-4-5 --effort low "What is 2+2?"
import { createHarness } from './_shared.mjs';
import { parseCommonArgs, requirePrompt, baseConfig, runExample, printResult } from './_shared.mjs';

const args = parseCommonArgs();
const prompt = requirePrompt(args, 'node examples/01-chat.mjs "<question>"');
const harness = await createHarness({ config: baseConfig(args) });
await runExample(harness, async () => {
  const result = await harness.chat(prompt);
  printResult(result);
  console.log('\n' + harness.usageReport());
});
