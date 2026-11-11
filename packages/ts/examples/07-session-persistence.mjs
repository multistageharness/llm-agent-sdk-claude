// 07-session-persistence — persist exchanges to the context store, then show the file.
//
// Run (copy-paste; from the package root, with ANTHROPIC_API_KEY set):
//   node examples/07-session-persistence.mjs "Remember this: my favorite color is teal."
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHarness } from './_shared.mjs';
import { parseCommonArgs, requirePrompt, baseConfig, runExample } from './_shared.mjs';

const args = parseCommonArgs();
const prompt = requirePrompt(args, 'node examples/07-session-persistence.mjs "<question>"');
const directory = path.join(os.tmpdir(), 'claude-agent-harness-demo');
const harness = await createHarness({ config: baseConfig(args, { contextStore: { enabled: true, directory } }) });
await runExample(harness, async () => {
  await harness.chat(prompt);
  // every run starts a new session unless told otherwise: resume this one so the
  // follow-up sees the first exchange and both land in the same store file
  harness.resumeSession(harness.sessionId);
  await harness.chat('Now summarize that in one sentence.');
  const file = path.join(directory, `${harness.sessionId}.jsonl`);
  console.log(`persisted ${fs.readFileSync(file, 'utf8').trim().split('\n').length} exchange(s) to ${file}`);
});
