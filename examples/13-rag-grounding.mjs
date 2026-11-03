// 13-rag-grounding — retrieval-augmented grounding: inject retrieved passages into
// systemPrompt.append, then ground the answer.
//
// *** demo-grade — requires a live, authenticated Claude Code runtime. ***
//
// Run (copy-paste; from the package root, with ANTHROPIC_API_KEY set):
//   node examples/13-rag-grounding.mjs "How does the harness resolve the Claude Code binary?"
import { createHarness } from './_shared.mjs';
import { parseCommonArgs, requirePrompt, baseConfig, runExample, printResult } from './_shared.mjs';

const args = parseCommonArgs();
const question = requirePrompt(args, 'node examples/13-rag-grounding.mjs "<question about the docs>"');
// a real app would retrieve these from a vector store keyed on the question
const passages = [
  'The harness resolves the Claude Code binary via pathToClaudeCodeExecutable, then PATH.',
  'Token accounting is heuristic pre-run; the result message carries authoritative usage.',
];
const grounding = `Answer ONLY from these passages; say "not in the docs" otherwise:\n${passages.map((p, i) => `[${i + 1}] ${p}`).join('\n')}`;
const harness = await createHarness({ config: baseConfig(args, { systemPrompt: grounding, systemPromptMode: 'append' }) });
await runExample(harness, async () => {
  printResult(await harness.chat(question));
});
