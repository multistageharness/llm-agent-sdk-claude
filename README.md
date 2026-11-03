# `llm-sdk-claude-agent`

A production harness around the official **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`):
chat, streaming, structured I/O, native tools/MCP, token budgets, sessions/resume, OpenTelemetry, and
the full hook/event lifecycle — in dependency-light Node ESM (`.mjs`).

It preserves the public surface of its two sibling harnesses (`chat()` · `stream()` · `structured()` ·
`registerTool()` · `preflight()` · `usageSummary()` · sessions · hooks · events · OTel) but is backed
by the Agent SDK's `query()` runtime, which spawns the Claude Code CLI as a subprocess. Sessions, tool
execution, hooks, permission modes, and telemetry are handled **natively** by the runtime; the harness
bridges to that lifecycle instead of re-homing it client-side.

## Quickstart

```bash
npm install            # pulls @anthropic-ai/claude-agent-sdk (which resolves/spawns the Claude Code CLI)
export ANTHROPIC_API_KEY=...   # or CLAUDE_CODE_USE_BEDROCK=1 / CLAUDE_CODE_USE_VERTEX=1
```

```js
import { createHarness } from 'llm-sdk-claude-agent';

const harness = await createHarness({
  config: { model: 'claude-opus-4-8', effort: 'low', maxTurns: 8 },
});
try {
  const { content, usage } = await harness.chat('What is 2 + 2?');
  console.log(content);
  console.log(harness.usageReport());
} finally {
  await harness.stop();
}
```

## Capabilities

- **Chat & streaming** — `chat()` drains a single `SDKMessage` generator to the terminal `result`
  (the runtime runs the internal tool loop). `stream()` enables `includePartialMessages` and maps
  partial-assistant deltas into a clean `{type:'delta'}` … `{type:'done'}` sequence; frame it for the
  wire with `formatSSE()`.
- **Structured I/O** — `structured(prompt, schema)` asks for JSON, validates it against a
  dependency-free JSON-Schema subset, and auto-repairs up to `structured.maxRepairAttempts` times. Set
  `structured.native` for a single strict-output call (a directive appended to the system prompt),
  validated locally.
- **Tools** — `registerTool({ name, description, parameters, handler })` declares an in-process SDK MCP
  server (`createSdkMcpServer` / `tool()`) surfaced to the model as `mcp__harness__<name>`; the runtime
  invokes the handler. External servers go in `mcpServers`.
- **Token budget & preflight** — `preflight(prompt)` runs a heuristic estimate against the budget; the
  gate blocks (or warns) before dispatch and reconciles actual spend from `result.usage`.
- **Sessions** — `resumeSession(id)` threads `options.resume`; `forkSession(id)` branches; a durable
  context store mirrors conversations so `continueFrom(id)` can replay them when a runtime session is
  gone.
- **Observability** — `claude_agent_harness.*` OpenTelemetry golden signals (optional peer dep; no-op
  when `@opentelemetry/api` is absent).
- **Hooks & events** — awaitable lifecycle hooks bridged onto native SDK hook events
  (`PreToolUse`/`PostToolUse`/`UserPromptSubmit`/`SessionStart`/`SessionEnd`/`Stop`), plus a
  fire-and-forget `EventEmitter` surface, a `canUseTool` policy, and permission modes.

## How it fits together

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ClaudeAgentHarness (EventEmitter)                                         │
│   chat() · stream() · structured() · registerTool() · preflight() ·       │
│   usageSummary() · resumeSession() · continueFrom() · forkSession()       │
├─────────────────────────────────────────────────────────────────────────┤
│ config.mjs        defaults < file < env < overrides                       │
│ runtime.mjs       Claude Code executable resolution + query() factory     │
│                   (the Agent SDK analog of Copilot's cli-path.mjs)        │
│ tokens.mjs        estimates · TokenBudget · preflight                     │
│ usage.mjs         tokens/tools aggregation from result.usage / modelUsage │
│ hooks.mjs         harness hooks mapped to native SDK hook events          │
│ store.mjs         request/response JSONL persistence                      │
│ structured.mjs    JSON-Schema validate · extract · repair                 │
│ observability.mjs OTel golden signals (optional peer dep)                 │
└─────────────────────────────────────────────────────────────────────────┘
                                   │  query({ prompt, options })
                                   ▼
                 spawned Claude Code CLI subprocess  →  Claude models
```

The single source of truth for usage/cost is the terminal `result` message (`usage`, `modelUsage`,
`total_cost_usd`) plus tool-loop timings. `runtime.mjs` resolves the CLI binary with the embedded
`findClaude()` finder — the closest installed `@anthropic-ai/claude-code`, then
`@anthropic-ai/claude-agent-sdk`, each located by native module resolution and a manual
`node_modules` walk — overridable via `pathToClaudeCodeExecutable` (config) or
`CLAUDE_AGENT_EXECUTABLE` (env). The Copilot twin `findCopilot()` is exported for interchange
parity.

## Configuration

Precedence: **defaults < config file < environment < overrides**. See
[`harness.config.example.json`](harness.config.example.json).

| Key | Default | Purpose |
| --- | --- | --- |
| `model` | `claude-opus-4-8` | model id |
| `effort` | `low` | reasoning effort (`low\|medium\|high\|xhigh\|max`) |
| `maxTurns` | `10` | agentic turn ceiling |
| `permissionMode` | `default` | `default\|acceptEdits\|plan\|bypassPermissions` |
| `allowedTools` / `disallowedTools` | `[]` | tool allow/deny patterns (`mcp__github__*`, …) |
| `systemPrompt` | `null` | string, or `{type:'preset',preset,append}` (append mode) |
| `systemPromptMode` | `append` | `append` (preset+append) or `replace` (raw string) |
| `mcpServers` | `{}` | external MCP servers (stdio/http/sse) |
| `agents` | `{}` | `Record<name, AgentDefinition>` subagents → `options.agents` |
| `permissions` | `{allow:[],deny:[]}` | `canUseTool` policy patterns |
| `settingSources` | `[]` | filesystem settings to load (`[]` = none) |
| `tokenBudget` | `{maxTokens:null,warnAtPercent:80,enforcement:'block'}` | budget + gate |
| `contextStore` | `{enabled:false,directory:…}` | JSONL conversation persistence |
| `observability` | `{enabled:false,…}` | OTel golden signals |
| `structured` | `{maxRepairAttempts:2,native:false}` | structured-output loop |
| `pathToClaudeCodeExecutable` | `null` | override the resolved CLI binary |
| `baseURL` | `env.ANTHROPIC_BASE_URL ?? null` | endpoint override, injected as `ANTHROPIC_BASE_URL` into the subprocess env |
| `hooks` (constructor) | — | initial harness hook handlers |

### Environment variables

| Var | Maps to |
| --- | --- |
| `ANTHROPIC_API_KEY` | runtime auth (api-key) |
| `CLAUDE_CODE_USE_BEDROCK` / `CLAUDE_CODE_USE_VERTEX` | enterprise auth |
| `CLAUDE_AGENT_MODEL` | `model` |
| `CLAUDE_AGENT_EFFORT` | `effort` |
| `CLAUDE_AGENT_PERMISSION_MODE` | `permissionMode` |
| `CLAUDE_AGENT_EXECUTABLE` | `pathToClaudeCodeExecutable` |
| `ANTHROPIC_BASE_URL` | `baseURL` (default endpoint) |
| `CLAUDE_AGENT_TOKEN_BUDGET` | `tokenBudget.maxTokens` |
| `CLAUDE_AGENT_STORE_DIR` | `contextStore.{enabled,directory}` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `observability.otlpEndpoint` |

## Events & hooks

**Events** (fire-and-forget, never awaited, cannot veto): `started`, `stopped`, `session:created`,
`session:resumed`, `session:replayed`, `run:start`, `run:end`, `event` (once per raw `SDKMessage`),
`message`, `delta`, `preflight`, `budget:warn`, `budget:exceeded`, `tool:call`, `tool:result`,
`tool:error`, `tool:denied`, `usage:tokens`, `structured:ok`, `structured:invalid`, `error:run`,
`subagent:start`, `subagent:activity`.

**Hooks** (awaited interception points): `beforeRun`, `afterRun`, `beforeToolCall` (return
`{deny, reason}` to block), `afterToolCall`, `onToolFailure`, `onPromptSubmit`, `onSessionStart`,
`onSessionEnd`, `onError`, `onBudgetWarning`, `onBudgetExceeded`. `beforeToolCall`/`afterToolCall` fire
for the runtime's **built-in** tools too, via the native `PreToolUse`/`PostToolUse` bridge (correlated
by `toolUseID`).

## Mapping & deviations

This package is the "runtime" sibling in a lineage: Messages API port (`claude-sdk/v100`) → Copilot CLI
port (`github-sdk/v300`) → **Claude Agent SDK** harness.

### vs the Messages API port (`claude-sdk/v100`) — what comes back natively

1. **Sessions** — no longer a client-side `{sessionId, messages[]}` array; the SDK owns sessions and
   `resumeSession` forwards `options.resume` (the CLI reconnects server-side).
2. **Tools** — no client-side agentic loop; `registerTool` becomes an in-process
   `createSdkMcpServer`/`tool()` server surfaced as `mcp__harness__*`, and `query()` runs the loop and
   emits tool turns.
3. **Hooks** — harness hooks map 1:1 onto native SDK hook events (`PreToolUse`, `PostToolUse`,
   `UserPromptSubmit`, `SessionStart`/`SessionEnd`, `Stop`, and friends) instead of being fully synthetic.
4. **Subprocess telemetry** — the CLI runtime is back, so runtime-level signals return alongside the
   harness-side `claude_agent_harness.*` instruments.

### vs the Copilot port (`github-sdk/v300`)

- `query()` replaces the Copilot client as the runtime entry; `runtime.mjs` is the analog of
  `cli-path.mjs` (executable resolution + factory), overridable via `pathToClaudeCodeExecutable`.
  Both finders are embedded in `runtime.mjs` directly (`findClaude` / `findCopilot`, one shared
  `findModule` core) — no separate finder package.
- `permissionMode` (`default\|acceptEdits\|plan\|bypassPermissions`) + `canUseTool` replace the Copilot
  proxy flags; `--cli-path` / `--proxy` are gone.
- Native hooks map 1:1 rather than being translated.

### Deviation (the other way) — token counts are heuristic-only

The Agent SDK exposes **no `countTokens()` endpoint** (it spawns the Claude Code CLI subprocess), so
`preflight()` estimates are heuristic and cannot be verified pre-run; only the terminal
`result.usage`/`modelUsage`/`total_cost_usd` (a client-side cost **estimate**, not authoritative
billing) are ground truth. The sibling's `analyzeRunAccurate` has no true analog — it delegates to the
heuristic `analyzeRun`.

### Naming

| `claude-sdk/v100` | this package |
| --- | --- |
| `llm-sdk-anthropic` | `llm-sdk-claude-agent` |
| `ClaudeHarness` | `ClaudeAgentHarness` |
| `claude_harness.*` | `claude_agent_harness.*` |
| `ANTHROPIC_*` env | `CLAUDE_AGENT_*` env |
| `reasoningEffort` | `effort` |

Default model stays `claude-opus-4-8`.

## For downstream agents

See [`./.agent.md`](./.agent.md) — a terse, machine-friendly integration guide (install, auth, entry
points, minimal snippet).

## Examples

Twenty-four runnable examples live in [`examples/`](examples/README.md).

## Testing

```bash
npm test        # node --test, fully offline against a mock query() — no subprocess, no network
```
