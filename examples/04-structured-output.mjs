// 04-structured-output — JSON-Schema harness.structured() + auto-repair.
//
// Run (copy-paste; from the package root, with ANTHROPIC_API_KEY set):
//   node examples/04-structured-output.mjs "Checkout was fast, but my confirmation email never arrived."
import { createHarness } from './_shared.mjs';
import { parseCommonArgs, requirePrompt, baseConfig, runExample } from './_shared.mjs';

const args = parseCommonArgs();
const prompt = requirePrompt(args, 'node examples/04-structured-output.mjs "<text to analyze>"');
const schema = {
  type: 'object',
  properties: {
    sentiment: { enum: ['positive', 'negative', 'neutral'] },
    summary: { type: 'string', minLength: 1 },
  },
  required: ['sentiment', 'summary'],
  additionalProperties: false,
};
const harness = await createHarness({ config: baseConfig(args) });
harness.on('structured:invalid', ({ attempt }) => console.error(`repair attempt ${attempt}...`));
harness.on('structured:ok', ({ attempts }) => console.error(`valid after ${attempts} attempt(s)`));
await runExample(harness, async () => {
  const { value } = await harness.structured(`Analyze this text: ${prompt}`, schema);
  console.log(JSON.stringify(value, null, 2));
});
