// 12-resume-session — resume/replay a stored conversation via options.resume.
//
// Run (copy-paste; from the package root, with ANTHROPIC_API_KEY set):
//   node examples/12-resume-session.mjs "Start a short story about a lighthouse keeper."
import { createHarness } from './_shared.mjs';
import { parseCommonArgs, requirePrompt, baseConfig, runExample } from './_shared.mjs';

const args = parseCommonArgs();
const prompt = requirePrompt(args, 'node examples/12-resume-session.mjs "<question>"');
const harness = await createHarness({ config: baseConfig(args) });
await runExample(harness, async () => {
  const first = await harness.chat(prompt);
  const id = first.sessionId;
  console.log(`captured session id: ${id}`);
  await harness.resumeSession(id);           // sets options.resume on the next run
  const cont = await harness.chat('Continue from where we left off.');
  console.log(cont.content);
});
