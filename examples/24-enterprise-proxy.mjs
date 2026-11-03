// 24-enterprise-proxy — Bedrock / Vertex / --base-url enterprise setup, plus a
// pathToClaudeCodeExecutable override.
//
// Auth is resolved from the environment by runtime.mjs:
//   ANTHROPIC_API_KEY            → direct Anthropic API
//   CLAUDE_CODE_USE_BEDROCK=1    → Amazon Bedrock
//   CLAUDE_CODE_USE_VERTEX=1     → Google Vertex AI
// Use --base-url for a proxy endpoint and CLAUDE_AGENT_EXECUTABLE (or config
// pathToClaudeCodeExecutable) to pin the Claude Code binary.
import { createHarness, resolveAuth } from './_shared.mjs';
import { parseCommonArgs, requirePrompt, baseConfig, runExample, printResult } from './_shared.mjs';

const args = parseCommonArgs();
const prompt = requirePrompt(args, 'node examples/24-enterprise-proxy.mjs "<question>"');
const auth = resolveAuth(process.env, { required: false });
console.error(`auth mode: ${auth.mode ?? 'none (set ANTHROPIC_API_KEY / CLAUDE_CODE_USE_BEDROCK / CLAUDE_CODE_USE_VERTEX)'}`);
const harness = await createHarness({
  config: baseConfig(args, {
    ...(process.env.CLAUDE_AGENT_EXECUTABLE && { pathToClaudeCodeExecutable: process.env.CLAUDE_AGENT_EXECUTABLE }),
  }),
});
await runExample(harness, async () => {
  printResult(await harness.chat(prompt));
});
