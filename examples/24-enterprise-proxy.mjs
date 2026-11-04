// 24-enterprise-proxy — Bedrock / Vertex / --base-url enterprise setup, plus a
// pathToClaudeCodeExecutable override.
//
// Auth is resolved from the environment by runtime.mjs:
//   ANTHROPIC_API_KEY              → direct Anthropic API
//   CLAUDE_CODE_OAUTH_TOKEN        → OAuth token (e.g. from `claude setup-token`)
//   CLAUDE_CODE_USE_BEDROCK=1      → Amazon Bedrock
//   CLAUDE_CODE_USE_VERTEX=1       → Google Vertex AI
//   CLAUDE_AGENT_USE_CLI_LOGIN=1   → installed CLI's stored login (also prefers the
//                                    installed `claude` binary over the SDK's cli.js)
// Use --base-url for a proxy endpoint and CLAUDE_AGENT_EXECUTABLE (or config
// pathToClaudeCodeExecutable) to pin the Claude Code binary.
//
// Run (copy-paste; from the package root — pick the auth that matches your account):
//   ANTHROPIC_API_KEY=***** node examples/24-enterprise-proxy.mjs "What is 2+2?"
//   CLAUDE_CODE_USE_BEDROCK=1 AWS_REGION=us-east-1 node examples/24-enterprise-proxy.mjs "What is 2+2?"
//   CLAUDE_CODE_USE_VERTEX=1 ANTHROPIC_VERTEX_PROJECT_ID=my-project node examples/24-enterprise-proxy.mjs "What is 2+2?"
//   CLAUDE_AGENT_USE_CLI_LOGIN=1 node examples/24-enterprise-proxy.mjs "What is 2+2?"
//   node examples/24-enterprise-proxy.mjs --base-url https://llm-proxy.internal.example.com "What is 2+2?"
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
