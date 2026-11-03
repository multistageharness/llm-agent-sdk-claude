// 11-multi-turn-chat — multiple sequential chat() calls sharing one native session.
//
// Run (copy-paste; from the package root, with ANTHROPIC_API_KEY set):
//   node examples/11-multi-turn-chat.mjs "What are the trade-offs of SSE vs WebSockets?"
import { createHarness } from './_shared.mjs';
import { parseCommonArgs, requirePrompt, baseConfig, runExample } from './_shared.mjs';

const args = parseCommonArgs();
const prompt = requirePrompt(args, 'node examples/11-multi-turn-chat.mjs "<opening question>"');
const harness = await createHarness({ config: baseConfig(args) });
await runExample(harness, async () => {
  const first = await harness.chat(prompt);
  console.log(`turn 1 (session ${first.sessionId}):\n${first.content}\n`);
  // resume the same session for the follow-up
  harness.resumeSession(first.sessionId);
  const second = await harness.chat('Expand on your previous answer with one concrete example.');
  console.log(`turn 2 (session ${second.sessionId}):\n${second.content}`);
});
