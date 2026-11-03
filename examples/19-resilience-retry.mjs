// 19-resilience-retry — retry-with-backoff on failed runs, falling back to a
// smaller model on the last attempt.
//
// Run (copy-paste; from the package root, with ANTHROPIC_API_KEY set):
//   node examples/19-resilience-retry.mjs "What is 2+2?"
//   FALLBACK_MODEL=claude-haiku-4-5 node examples/19-resilience-retry.mjs "What is 2+2?"
import { createHarness } from './_shared.mjs';
import { parseCommonArgs, requirePrompt, baseConfig, runExample, printResult } from './_shared.mjs';

const args = parseCommonArgs();
const prompt = requirePrompt(args, 'node examples/19-resilience-retry.mjs "<question>"');
const harness = await createHarness({ config: baseConfig(args) });

// FALLBACK_MODEL overrides the last-attempt model for your account.
async function chatWithRetry(p, { attempts = 3, fallbackModel = process.env.FALLBACK_MODEL || 'claude-haiku-4-5' } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const model = i === attempts - 1 ? fallbackModel : undefined;
      return await harness.chat(p, model ? { model } : {});
    } catch (err) {
      lastErr = err;
      const backoff = 250 * 2 ** i;
      console.error(`attempt ${i + 1} failed (${err.message}); retrying in ${backoff}ms`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

await runExample(harness, async () => {
  printResult(await chatWithRetry(prompt));
});
