// 26-plugins — load a local directory plugin and scope built-in tools to read-only.
//
// Patterns (see SPEC_PATTERN.md §4 C6):
//   A  built-in tool scoping   — `tools` limits which built-ins exist at all (no Bash/Write/Edit)
//   B  local directory plugin  — `plugins` injects ./plugins/repo-auditor for this session only;
//                                the harness resolves it to an absolute path, so a different
//                                `cwd` for the runtime does not break discovery
// `plugins:loaded` reports what the runtime actually loaded (skills + plugin errors) and
// flags `ambient` plugins nobody configured: in CLI-login mode (the default) the installed
// `claude` binary also loads the account's built-in/synced plugins and skills, which
// `settingSources: []` does not switch off. For a strictly isolated plugin set, run with
// CLAUDE_AGENT_USE_CLI_LOGIN=0 plus an API key, or pin the SDK-bundled CLI via
// CLAUDE_AGENT_EXECUTABLE=node_modules/@anthropic-ai/claude-agent-sdk/cli.js.
//
// *** demo-grade — requires a live, authenticated Claude Code runtime. ***
//
// Run (copy-paste; from the package root, with ANTHROPIC_API_KEY set):
//   node examples/26-plugins.mjs "List your loaded skills, then audit src/config.mjs."
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHarness } from './_shared.mjs';
import { parseCommonArgs, requirePrompt, baseConfig, runExample, printResult } from './_shared.mjs';

const args = parseCommonArgs();
const prompt = requirePrompt(args, 'node examples/26-plugins.mjs "List your loaded skills, then audit src/config.mjs."');
const pluginDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'plugins', 'repo-auditor');

const harness = await createHarness({
  config: baseConfig(args, {
    tools: ['Read', 'Glob', 'Grep', 'Skill'],
    plugins: [pluginDir],
  }),
});
harness.on('plugins:loaded', ({ plugins, ambient, skills, errors }) => {
  console.error(`plugins: ${plugins.map((p) => p.name).join(', ') || '(none)'}`);
  console.error(`skills:  ${skills.join(', ') || '(none)'}`);
  if (ambient.length) {
    console.error(`warning: ${ambient.length} plugin(s) loaded that were not configured: ${ambient.map((p) => p.name).join(', ')}`);
  }
  for (const e of errors) console.error(`plugin error: ${e.plugin ?? '?'} — ${e.message}`);
});
await runExample(harness, async () => {
  printResult(await harness.chat(prompt));
});
