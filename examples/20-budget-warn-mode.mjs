// 20-budget-warn-mode — budget enforcement 'warn': run past warnAtPercent and show
// budget:warn firing without throwing.
import { createHarness } from './_shared.mjs';
import { parseCommonArgs, requirePrompt, baseConfig, runExample } from './_shared.mjs';

const args = parseCommonArgs();
const prompt = requirePrompt(args, 'node examples/20-budget-warn-mode.mjs "<question>"');
const harness = await createHarness({ config: baseConfig(args, { tokenBudget: { maxTokens: 2000, warnAtPercent: 50, enforcement: 'warn' } }) });
harness.on('budget:warn', (b) => console.error(`budget:warn at ${b.utilizationPercent}% (${b.used}/${b.maxTokens})`));
harness.on('budget:exceeded', (b) => console.error(`budget:exceeded (${b.used}/${b.maxTokens}) — proceeding (warn mode)`));
await runExample(harness, async () => {
  for (let i = 0; i < 5; i += 1) {
    const { content } = await harness.chat(`${prompt} (turn ${i + 1})`);
    console.log(`turn ${i + 1}: ${content.slice(0, 60)}...`);
  }
  console.log('\n' + harness.usageReport());
});
