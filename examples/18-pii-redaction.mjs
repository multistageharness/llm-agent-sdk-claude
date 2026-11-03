// 18-pii-redaction — keep PII away from the model and from tool side effects.
// Redaction happens where it is guaranteed to apply: on the prompt before
// chat(), and inside the tool handler (defense in depth). beforeRun /
// beforeToolCall act as verification gates that veto anything still unredacted.
import { createHarness } from './_shared.mjs';
import { parseCommonArgs, requirePrompt, baseConfig, runExample, printResult } from './_shared.mjs';

const PII = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[REDACTED_EMAIL]'],
  [/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]'],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[REDACTED_IP]'],
];

function redactPII(value) {
  if (typeof value === 'string') return PII.reduce((s, [re, mask]) => s.replace(re, mask), value);
  if (Array.isArray(value)) return value.map(redactPII);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactPII(v)]));
  }
  return value;
}

const containsPII = (value) => JSON.stringify(value ?? '') !== JSON.stringify(redactPII(value));

const args = parseCommonArgs();
const prompt = redactPII(requirePrompt(args, 'node examples/18-pii-redaction.mjs "<task>"'));
const harness = await createHarness({
  config: baseConfig(args),
  hooks: {
    beforeRun: ({ prompt: p }) => {
      if (containsPII(p)) throw new Error('unredacted PII in prompt');
    },
    beforeToolCall: ({ args: a }) => (containsPII(a) ? { deny: true, reason: 'unredacted PII in tool input' } : {}),
  },
});
harness.registerTool({
  name: 'store_note',
  description: 'Persist a note',
  parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  // redact again at the side effect: the input may come from model output
  handler: async ({ text }) => ({ stored: redactPII(text) }),
});
console.error(`sending: ${prompt}`);
await runExample(harness, async () => {
  printResult(await harness.chat(prompt));
});
