// 22-mcp-and-subagents — an external stdio MCP server plus a configured subagent.
//
// *** demo-grade — requires a live, authenticated Claude Code runtime (and the
//     external MCP binary on PATH). ***
//
// Run (copy-paste; from the package root, with ANTHROPIC_API_KEY set and my-mcp-fs on PATH):
//   node examples/22-mcp-and-subagents.mjs "List the project files and summarize them."
import { createHarness } from './_shared.mjs';
import { parseCommonArgs, requirePrompt, baseConfig, runExample, printResult } from './_shared.mjs';

const args = parseCommonArgs();
const prompt = requirePrompt(args, 'node examples/22-mcp-and-subagents.mjs "<research task>"');
const harness = await createHarness({
  config: baseConfig(args, {
    mcpServers: { fs: { command: 'my-mcp-fs', args: ['--stdio'] } },
    autoAllowMcp: true,
    agents: {
      researcher: {
        description: 'Researches a topic and reports findings',
        prompt: 'You are a thorough researcher. Cite the sources you consulted.',
        tools: ['Read', 'Grep', 'mcp__fs__*'],
        model: 'claude-opus-4-8',
        effort: 'high',
        maxTurns: 6,
      },
    },
  }),
});
harness.on('subagent:start', ({ parentToolUseId }) => console.error(`subagent started (${parentToolUseId})`));
await runExample(harness, async () => {
  printResult(await harness.chat(prompt));
  console.log('\nsubagents:', JSON.stringify(harness.usageSummary().subagents, null, 2));
});
