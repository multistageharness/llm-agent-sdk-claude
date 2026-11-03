// 15-classification-pipeline — batch structured classification over a list.
//
// Run (copy-paste; from the package root, with ANTHROPIC_API_KEY set):
//   node examples/15-classification-pipeline.mjs                 # classifies three built-in sample items
//   node examples/15-classification-pipeline.mjs "refund my order" "app keeps crashing" "love the new UI"
import { createHarness } from './_shared.mjs';
import { parseCommonArgs, baseConfig, runExample } from './_shared.mjs';

const args = parseCommonArgs();
const items = args._.length ? args._ : ['refund my order', 'app keeps crashing', 'love the new UI'];
const labelSchema = {
  type: 'object',
  properties: { label: { enum: ['billing', 'bug', 'praise', 'other'] } },
  required: ['label'],
  additionalProperties: false,
};
const harness = await createHarness({ config: baseConfig(args) });
await runExample(harness, async () => {
  const out = [];
  for (const item of items) {
    const { value } = await harness.structured('Classify this support message.', labelSchema, { input: { message: item } });
    out.push({ item, label: value.label });
  }
  console.log(JSON.stringify(out, null, 2));
});
