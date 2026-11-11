// 23-repl-chatbot — interactive REPL calling chat() per line, sharing one session.
//
// Run (copy-paste; from the package root, with ANTHROPIC_API_KEY set):
//   node examples/23-repl-chatbot.mjs            # then type at the you> prompt; Ctrl+C to exit
import readline from 'node:readline';
import { createHarness } from './_shared.mjs';
import { parseCommonArgs, baseConfig } from './_shared.mjs';

const args = parseCommonArgs();
const harness = await createHarness({ config: baseConfig(args) });
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'you> ' });

console.log('Claude Agent REPL — Ctrl+C to exit.');
rl.prompt();
rl.on('line', async (line) => {
  const text = line.trim();
  if (!text) { rl.prompt(); return; }
  try {
    if (harness.sessionId) harness.resumeSession(harness.sessionId);
    const { content } = await harness.chat(text);
    console.log(`claude> ${content}`);
  } catch (err) {
    console.error(`error: ${err.message}`);
  }
  rl.prompt();
});
rl.on('close', async () => { await harness.stop(); process.exit(0); });
