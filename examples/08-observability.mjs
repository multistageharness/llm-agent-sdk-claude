// 08-observability — OpenTelemetry golden signals (claude_agent_harness.*).
// Install @opentelemetry/api (+ an SDK/exporter) to see real metrics; without it
// the instruments degrade to no-ops.
//
// Run (copy-paste; from the package root, with ANTHROPIC_API_KEY set):
//   node examples/08-observability.mjs "What is 2+2?"
//   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 node examples/08-observability.mjs "What is 2+2?"
import { createHarness } from './_shared.mjs';
import { parseCommonArgs, requirePrompt, baseConfig, runExample, printResult } from './_shared.mjs';

const args = parseCommonArgs();
const prompt = requirePrompt(args, 'node examples/08-observability.mjs "<question>"');
const harness = await createHarness({
  config: baseConfig(args, {
    observability: {
      enabled: true,
      serviceName: 'claude-agent-sdk-harness',
      otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? null,
    },
  }),
});
await runExample(harness, async () => {
  printResult(await harness.chat(prompt));
  console.log('\nemitted: claude_agent_harness.{requests,tokens,request.duration_ms,tool.calls,...}');
});
