/**
 * llm-sdk-claude-agent — a production harness around the Claude Agent SDK
 * (`@anthropic-ai/claude-agent-sdk`).
 *
 * Preserves the public surface of the two sibling harnesses — `chat()` ·
 * `stream()` · `structured()` · `registerTool()` · `preflight()` ·
 * `usageSummary()` · sessions · hooks · events · OpenTelemetry — but backed by
 * the Agent SDK's `query()` runtime (which spawns the Claude Code CLI as a
 * subprocess) instead of the stateless Messages API. Sessions, tool execution,
 * hooks, permissions, and telemetry are handled natively by the SDK; the harness
 * bridges to that lifecycle rather than re-homing it client-side.
 *
 * @example
 * import { createHarness } from 'llm-sdk-claude-agent';
 *
 * const harness = await createHarness({
 *   config: { model: 'claude-opus-4-8', effort: 'low' },
 * });
 * try {
 *   const { content } = await harness.chat('What is 2 + 2?');
 *   console.log(content);
 *   console.log(harness.usageReport());
 * } finally {
 *   await harness.stop();
 * }
 */

export {
  ClaudeAgentHarness,
  ClaudeAgentHarness as Harness,
  createHarness,
  formatSSE,
  renderContextPreamble,
  extractContent,
  resolveAnswerContent,
  assertUserMessage,
  EmptyPromptError,
} from './harness.mjs';

export * from './config.mjs';
export * from './runtime.mjs';
export * from './tokens.mjs';
export * from './usage.mjs';
export * from './store.mjs';
export * from './hooks.mjs';
export * from './structured.mjs';
export * from './observability.mjs';
