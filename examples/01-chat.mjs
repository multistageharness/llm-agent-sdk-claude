// 01-chat — buffered harness.chat() + usage report.
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
