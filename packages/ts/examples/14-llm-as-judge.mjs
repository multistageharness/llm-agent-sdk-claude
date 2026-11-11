// 14-llm-as-judge — score a candidate answer against a rubric with structured().
//
// *** demo-grade — requires a live, authenticated Claude Code runtime. ***
//
// Run (copy-paste; from the package root, with ANTHROPIC_API_KEY set):
//   node examples/14-llm-as-judge.mjs "Paris is the capital of France and has about 2 million residents."
import { createHarness } from './_shared.mjs';
import { parseCommonArgs, requirePrompt, baseConfig, runExample } from './_shared.mjs';

const args = parseCommonArgs();
const candidate = requirePrompt(args, 'node examples/14-llm-as-judge.mjs "<candidate answer to score>"');
const rubric = {
  type: 'object',
  properties: {
    accuracy: { type: 'integer', minimum: 1, maximum: 5 },
    clarity: { type: 'integer', minimum: 1, maximum: 5 },
    verdict: { enum: ['pass', 'fail'] },
    rationale: { type: 'string', minLength: 1 },
  },
  required: ['accuracy', 'clarity', 'verdict', 'rationale'],
  additionalProperties: false,
};
const harness = await createHarness({ config: baseConfig(args, { effort: 'high' }) });
await runExample(harness, async () => {
  const { value } = await harness.structured('Score this candidate answer against the rubric.', rubric, { input: { candidate }, inputLabel: 'candidate' });
  console.log(JSON.stringify(value, null, 2));
});
