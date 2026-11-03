# Examples

Twenty-four runnable examples for the `llm-sdk-claude-agent` harness. Each is a standalone `.mjs`
importing the harness from `../src/index.mjs` and the shared CLI helpers from `_shared.mjs`.

## Running

```bash
export ANTHROPIC_API_KEY=...          # or CLAUDE_CODE_USE_BEDROCK=1 / CLAUDE_CODE_USE_VERTEX=1
node examples/01-chat.mjs "What is 2+2?"
```

Each example resolves the Claude Code CLI the Agent SDK spawns; install
`@anthropic-ai/claude-agent-sdk` (or set `CLAUDE_AGENT_EXECUTABLE` / `pathToClaudeCodeExecutable`).
With no message argument an example prints a usage hint and exits `2` **before** any run — nothing
is sent to the model.

## Common flags

| Flag | Meaning |
| --- | --- |
| `--model <id>` | model id (default `claude-opus-4-8`) |
| `--effort <level>` | reasoning effort: `low\|medium\|high\|xhigh\|max` |
| `--max-turns <n>` | agentic turn ceiling (default 8) |
| `--permission-mode <mode>` | `default\|acceptEdits\|plan\|bypassPermissions` |
| `--base-url <url>` | enterprise endpoint (Bedrock/Vertex/proxy) |
| `--token-budget <n>` | token ceiling (`maxTokens`) |
| `--budget-warn <pct>` | warn-at percent (default 80) |
| `--budget-enforcement <mode>` | `block\|warn` (default `warn` for examples) |

> **Deviation from the Copilot harness.** The `--cli-path` / `--proxy` flags are gone — the Agent SDK
> resolves its own Claude Code binary (override with `pathToClaudeCodeExecutable`) and enforces policy
> through `permissionMode` / `canUseTool` rather than a proxy. Use `--base-url` (example 24) for an
> enterprise endpoint.

## Catalog

| # | Example | Demonstrates |
| --- | --- | --- |
| 01 | `01-chat` | buffered `chat()` + usage report |
| 02 | `02-streaming` | token-by-token `stream()` deltas (`includePartialMessages`) |
| 03 | `03-sse-server` | HTTP server relaying `stream()` as SSE via `formatSSE()` |
| 04 | `04-structured-output` | JSON-Schema `structured()` + auto-repair |
| 05 | `05-tool-calling` | `registerTool()` → in-process `mcp__harness__*` + the agentic loop |
| 06 | `06-token-budget` | token budget + preflight gate |
| 06a | `06a-token-budget-within` | a run that fits the budget |
| 06b | `06b-token-budget-exceeded` | a run that trips `budget:exceeded` / throws |
| 07 | `07-session-persistence` | persist exchanges to the context store |
| 08 | `08-observability` | OpenTelemetry golden signals (`claude_agent_harness.*`) |
| 09 | `09-hooks-and-events` | native hook + event lifecycle |
| 10 | `10-system-prompt` | `systemPrompt` preset/append shaping |
| 11 | `11-multi-turn-chat` | multi-turn context within one session |
| 12 | `12-resume-session` | resume/replay a stored conversation via `options.resume` |
| 13 | `13-rag-grounding` | retrieval-augmented grounding *(demo-grade — live runtime)* |
| 14 | `14-llm-as-judge` | LLM-as-judge scoring *(demo-grade — live runtime)* |
| 15 | `15-classification-pipeline` | batch structured classification |
| 16 | `16-streaming-with-tools` | streaming alongside tool use |
| 17 | `17-human-in-the-loop` | human approval via `canUseTool` denial |
| 18 | `18-pii-redaction` | PII redaction via a `PreToolUse` hook |
| 19 | `19-resilience-retry` | retry / fallback resilience |
| 20 | `20-budget-warn-mode` | budget `warn` enforcement |
| 21 | `21-cost-report` | cost / usage reporting from `result.total_cost_usd` |
| 22 | `22-mcp-and-subagents` | external MCP server + `agents` subagents *(demo-grade — live runtime)* |
| 23 | `23-repl-chatbot` | interactive REPL chatbot |
| 24 | `24-enterprise-proxy` | Bedrock / Vertex / `--base-url` enterprise setup |
| 25 | `25-policy-gated-investigator` | Policy-gated investigation: bare-name tool veto (once per `toolUseId`), handler-side PII redaction, schema-validated + citation-verified report — C1, C2, E3, B1, B2, B3, E4 |

Examples 13, 14, and 22 require a live, authenticated runtime and are labeled demo-grade in their
headers.
