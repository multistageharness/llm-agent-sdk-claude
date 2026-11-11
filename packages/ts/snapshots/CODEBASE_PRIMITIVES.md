---
snapshot_schema: "1.0"
package_name: "llm-sdk-claude-agent"
package_version: "0.1.0"
commit: "cbcdcf7"
generated_at: "2026-11-11"
extraction_method: "deterministic static analysis (no live runtime/network execution)"
---

# Codebase Architectural Primitives Snapshot: `llm-sdk-claude-agent`

## 1. Snapshot Metadata & Package Identity

- **Package / Service Name:** `llm-sdk-claude-agent`
- **Version:** `0.1.0`
- **Commit Baseline:** `cbcdcf7` (repo `multistageharness-com/RCM-llm-sdk`, path `claude-agent-sdk/v100`)
- **Module / Runtime System:** ESM (`"type": "module"`, `.mjs`), Node `>=20.6`
- **Primary Entry Point:** `src/index.mjs` (`main` and `exports["."]`)
- **Total Production Modules Analyzed:** `10` (`src/*.mjs`; `test/`, `examples/`, `.ci/` excluded)
- **Extraction:** `extract_primitives.py` (regex/AST IR) + static class-member/root-barrel enrichment pass + manual source trace. No target module was imported or executed.
- **Description (manifest):** Production harness around the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`): chat, native streaming + SSE, structured I/O, tool calling via in-process SDK MCP servers, native sessions, token budgets, usage/cost accounting, permission modes, events + hooks bridged to native SDK hooks, and OpenTelemetry observability.
- **Scripts:** `test` = `node --test test/*.test.mjs`; `test:watch`; `example` = `node examples/01-chat.mjs`
- **License:** MIT

## 2. Package Entry Points - Module & Export Surface

| Subpath / Module | Source File | Exported Symbols (`kind`) | In Root Barrel (`inRootBarrel`) |
| :--- | :--- | :--- | :--- |
| `.` | `src/index.mjs` | `COPILOT_DEFAULT_CANDIDATES` (const), `ClaudeAgentHarness` (class), `ConfigError` (class), `ContextStore` (class), `DEFAULT_BINARY_NAMES` (const), `DEFAULT_CANDIDATES` (const), `DEFAULT_ORDER` (const), `DEFAULT_SYSTEM_DIRS` (const), `EFFORT` (const), `EmptyPromptError` (class), `HOOK_NAMES` (const), `Harness` (class, alias of ClaudeAgentHarness), `HookManager` (class), `Observability` (class), `PERMISSION_MODES` (const), `REASONING_EFFORTS` (const), `StructuredOutputError` (class), `THINKING_TYPES` (const), `TokenBudget` (class), `TokenBudgetExceededError` (class), `UsageTracker` (class), `_setOtelApiForTests` (fn), `analyzeRun` (fn), `analyzeRunAccurate` (fn), `assertUserMessage` (fn), `buildQueryOptions` (fn), `buildRepairPrompt` (fn), `buildStrictOutputDirective` (fn), `buildStructuredPrompt` (fn), `configFromEnv` (fn), `createHarness` (fn), `createQuery` (fn), `defaultConfig` (fn), `dispatchQuery` (fn), `estimateMessagesTokens` (fn), `estimateTokens` (fn), `extractContent` (fn), `extractJson` (fn), `fallbackCreateSdkMcpServer` (fn), `fallbackTool` (fn), `findClaude` (fn), `findClaudeBinary` (fn), `findClosestModuleDir` (fn), `findCopilot` (fn), `findModule` (fn), `findNativeBinary` (fn), `formatSSE` (fn), `genAiAttributes` (fn), `inspectBinary` (fn), `jsonSchemaToZod` (fn), `jsonSchemaToZodShape` (fn), `loadConfig` (fn), `loadConfigFile` (fn), `loadOtelApi` (fn), `loadSdkTooling` (fn), `mergeConfig` (fn), `nativeBinaryLocations` (fn), `packageRootFromEntry` (fn), `parseStructuredResponse` (fn), `readManifestEntry` (fn), `renderContextPreamble` (fn), `renderStructuredInput` (fn), `resolveAnswerContent` (fn), `resolveAuth` (fn), `resolveBinInfo` (fn), `resolveClaudeCodeExecutable` (fn), `resolveExecutablePath` (fn), `resolveModuleEntry` (fn), `resolveSystemPrompt` (fn), `telemetryConfigFor` (fn), `validateConfig` (fn), `validateSchema` (fn) | `true` (barrel, 72 symbols) |
| `./config` | `src/config.mjs` | `ConfigError` (class), `EFFORT` (const), `PERMISSION_MODES` (const), `REASONING_EFFORTS` (const), `THINKING_TYPES` (const), `buildQueryOptions` (fn), `configFromEnv` (fn), `defaultConfig` (fn), `loadConfig` (fn), `loadConfigFile` (fn), `mergeConfig` (fn), `resolveSystemPrompt` (fn), `validateConfig` (fn) | `true` |
| `./hooks` | `src/hooks.mjs` | `HOOK_NAMES` (const), `HookManager` (class) | `true` |
| `./observability` | `src/observability.mjs` | `Observability` (class), `_setOtelApiForTests` (fn), `genAiAttributes` (fn), `loadOtelApi` (fn), `telemetryConfigFor` (fn) | `true` |
| `./runtime` | `src/runtime.mjs` | `COPILOT_DEFAULT_CANDIDATES` (const), `DEFAULT_BINARY_NAMES` (const), `DEFAULT_CANDIDATES` (const), `DEFAULT_ORDER` (const), `DEFAULT_SYSTEM_DIRS` (const), `createQuery` (fn), `dispatchQuery` (fn), `fallbackCreateSdkMcpServer` (fn), `fallbackTool` (fn), `findClaude` (fn), `findClaudeBinary` (fn), `findClosestModuleDir` (fn), `findCopilot` (fn), `findModule` (fn), `findNativeBinary` (fn), `inspectBinary` (fn), `jsonSchemaToZod` (fn), `jsonSchemaToZodShape` (fn), `loadSdkTooling` (fn), `nativeBinaryLocations` (fn), `packageRootFromEntry` (fn), `readManifestEntry` (fn), `resolveAuth` (fn), `resolveBinInfo` (fn), `resolveClaudeCodeExecutable` (fn), `resolveExecutablePath` (fn), `resolveModuleEntry` (fn) | `true` |
| `./store` | `src/store.mjs` | `ContextStore` (class) | `true` |
| `./structured` | `src/structured.mjs` | `StructuredOutputError` (class), `buildRepairPrompt` (fn), `buildStrictOutputDirective` (fn), `buildStructuredPrompt` (fn), `extractJson` (fn), `parseStructuredResponse` (fn), `renderStructuredInput` (fn), `validateSchema` (fn) | `true` |
| `./tokens` | `src/tokens.mjs` | `TokenBudget` (class), `TokenBudgetExceededError` (class), `analyzeRun` (fn), `analyzeRunAccurate` (fn), `estimateMessagesTokens` (fn), `estimateTokens` (fn) | `true` |
| `./usage` | `src/usage.mjs` | `UsageTracker` (class) | `true` |
| *(no subpath — root barrel only)* | `src/harness.mjs` | `ClaudeAgentHarness` (class), `EmptyPromptError` (class), `assertUserMessage` (fn), `createHarness` (fn), `extractContent` (fn), `formatSSE` (fn), `normalizeToolName` (fn) — **inRootBarrel: false**, `renderContextPreamble` (fn), `resolveAnswerContent` (fn) | mixed (8/9) |

**Barrel notes**
- The root barrel re-exports `src/harness.mjs` by explicit list (adding alias `Harness`) and every other module with `export *`.
- `src/harness.mjs` has no `exports` subpath; `normalizeToolName` is therefore unreachable through the package entry points.
- `_setOtelApiForTests` (test seam) is **in** the root barrel, because `export * from './observability.mjs'` does not filter underscore-prefixed names.

## 3. Core Orchestration Primitives & Framing Functions

- **`ClaudeAgentHarness`** (`src/harness.mjs`, `extends EventEmitter` from `node:events`; also exported as `Harness`): facade over the Agent SDK `query()` runtime, which spawns the Claude Code CLI subprocess. It:
  - Composes config, hooks, budget, usage tracking, context store, and observability.
  - Builds SDK `Options`, including in-process MCP tools, the `canUseTool` policy, and native `options.hooks` bridging.
  - Drains `SDKMessage` streams for `chat()`, `stream()`, and `structured()`.
  - Manages native sessions (`resume`/`forkSession`).
- **`createHarness(options = {}, deps = {})` -> `Promise<ClaudeAgentHarness>`:** constructs the harness and awaits `start()`.
- **`dispatchQuery({ prompt, options = {}, queryImpl, env = process.env, fromDir } = {})`** (`src/runtime.mjs`, `async *`) -> `AsyncGenerator<SDKMessage>`. On the real path (no `queryImpl`) it calls `resolveAuth(env)`, fills in `options.pathToClaudeCodeExecutable ??= resolveExecutablePath(...)`, lazy-imports the SDK `query`, and yields `query({ prompt, options })`.
- **`createQuery(config, { queryImpl, env, abortController, fromDir } = {})`** (`src/runtime.mjs`) -> `RunFn` (`(prompt) => AsyncIterable<SDKMessage>` with `.abortController`, `.options`). It binds `buildQueryOptions(config)`.
- **Framing functions (pure, `src/harness.mjs`):**
  - `formatSSE(item = {})` -> `string`: `event: <delta|done|error|type>\ndata: <json>\n\n`.
  - `renderContextPreamble(messages = [])` -> `string`: `<conversation-context>\nPrior conversation to continue from:\nROLE: content…\n</conversation-context>\n`, or `''` when there are no messages.
  - `extractContent(content = [])` -> `{ text, thinking: string[], toolUses: object[] }`.
  - `resolveAnswerContent(content = [], fallback = undefined)` -> `string`: the concatenated text blocks, else `fallback.content`, else `''`.
  - `assertUserMessage(message, method = 'chat')` -> `void`: throws `EmptyPromptError`.
  - `normalizeToolName(name)` -> `string`: strips `^mcp__[^_]+__`.
- **Prompt framing (pure, `src/structured.mjs`):** `renderStructuredInput`, `buildStructuredPrompt`, `buildRepairPrompt`, `buildStrictOutputDirective` (see §11).

## 4. Orchestrator Constructor & Composed Properties

- **Constructor Signature:** `new ClaudeAgentHarness(options = {}, deps = {})`
  - `options`: `{ configFile?: string, config?: Partial<HarnessConfig>, hooks?: Partial<Record<HookName, Fn | Fn[]>> }`
  - `deps` (test/DI seams): `{ queryImpl?, tool?, createSdkMcpServer?, zod?, env? }`

| Property | Type | Accessor | Role in Composed State |
| :--- | :--- | :--- | :--- |
| `_agentSpan` | `Span \| null` | Instance field (private) | Active root `invoke_agent` span (nested-call reuse) |
| `_createSdkMcpServer` | `Function` | Instance field (private) | SDK `createSdkMcpServer` or `fallbackCreateSdkMcpServer` |
| `_deps` | `object` | Instance field (private) | Injected dependency seams |
| `_env` | `ProcessEnv` | Instance field (private) | `deps.env ?? process.env` |
| `_pendingContext` | `ContextMessage[]` | Instance field (private) | Turns to fold into the next prompt preamble |
| `_pendingFork` | `boolean` | Instance field (private) | Next run sets `options.forkSession` |
| `_pendingResume` | `string \| null` | Instance field (private) | Next run sets `options.resume` |
| `_pendingToolCalls` | `Map<toolUseId, PendingToolCall>` | Instance field (private) | PreToolUse→PostToolUse correlation records |
| `_queryImpl` | `Function \| null` | Instance field (private) | Injected mock `query()` |
| `_sdkTool` | `Function` | Instance field (private) | SDK `tool()` or `fallbackTool` |
| `_sessionId` | `string \| null` | Instance field (private) | Captured runtime session id |
| `_started` | `boolean` | Instance field (private) | Idempotency flag for `start()` |
| `_toolVerdicts` | `Map<toolUseId, ToolVerdict>` | Instance field (private) | Per-run `beforeToolCall` verdict cache |
| `_tools` | `RegisteredTool[]` | Instance field (private) | Tools registered via `registerTool()` |
| `_zod` | `ZodNamespace \| null` | Instance field (private) | zod for JSON Schema→zod shape conversion |
| `budget` | `TokenBudget` | Instance field (`composedState`) | Built from `config.tokenBudget` |
| `config` | `HarnessConfig` | Instance field (`composedState`) | `loadConfig({ configFile, overrides: options.config, env })` |
| `hooks` | `HookManager` | Instance field (`composedState`) | Built from `options.hooks` |
| `obs` | `Observability` | Instance field (`composedState`) | Built from `config.observability`, with `providerName` from env |
| `sessionId` | `string \| null` | Getter (`getter: true`) | Returns `_sessionId` |
| `store` | `ContextStore \| null` | Instance field (`composedState`) | Non-null only when `config.contextStore.enabled` |
| `tracker` | `UsageTracker` | Instance field (`composedState`) | Usage aggregation |
| `usage` | `UsageTracker` | Instance field (`composedState`) | Alias of `tracker` |

## 5. Lifecycle, Session & Execution Methods

**Process Lifecycle**
- **`async start()` -> `this`:** idempotent. Awaits `obs.init()`, then resolves `tool`/`createSdkMcpServer`/`zod` through `loadSdkTooling()` unless injected. Emits `started`.
- **`async stop()` -> `Error[]`:** runs `onSessionEnd` if a session ran (errors are collected), sets `_started = false`, and emits `stopped { errors }`.

**Session / State Management**
- **`get sessionId`** -> `string | null`.
- **`resumeSession(id, opts = {})` -> `this`:** queues `resume = id` and emits `session:resumed { sessionId, mode: 'resume', restored: 0 }`.
- **`continueFrom(id, opts = {})` -> `this`:** the id resolves to `id ?? _sessionId ?? store.latestSessionId()`.
  - If the store has records for that id and `opts.resume !== true`: calls `attachContext(store.asContextMessages(id))` and emits `session:replayed`.
  - Otherwise: queues `resume` and emits `session:resumed { mode: 'continue' }`.
- **`forkSession(id, opts = {})` -> `this`:** queues `resume = id` plus `forkSession = true`, and emits `session:resumed { mode: 'fork' }`.
- **`attachContext(messages = [])` -> `this`:** appends to `_pendingContext`, which is rendered as a preamble on the next run.
- **`registerTool({ name, description?, parameters?, handler })` -> `this`:** throws `TypeError` without `name`/`handler`. The tool is exposed as `mcp__harness__<name>` and auto-added to `allowedTools`.

**Execution & Reporting**
- **`preflight(prompt, opts = {})` -> `RunAnalysis`:** runs `analyzeRun` with the system prompt, pending + `opts.context`, `opts.attachments`, and `opts.expectedOutputTokens`. Emits `preflight`.
- **`async chat(prompt, opts = {})` -> `ChatResult`:** order of steps:
  1. `assertUserMessage`, then root span `invoke_agent`.
  2. `preflight`, then the `beforeRun` hook (can abort), then the budget gate.
  3. `_buildOptions`, then `dispatchQuery` inside the `chat {model}` span.
  4. `_onSdkMessage` for each message.
  5. Requires a `result` message with `subtype === 'success'`, otherwise throws.
  6. `tracker.ingestResult`, budget reconcile, `store.saveExchange`, the `afterRun` hook, and `run:end`.
  - On error: `onError` (phase `chat`), `error:run`, then rethrow.
  - `opts`: `{ model?, effort?, permissionMode?, maxTurns?, systemPrompt?, systemPromptOverride?, abortController?, context?, attachments?, expectedOutputTokens? }`.
- **`async *stream(prompt, opts = {})` -> `AsyncGenerator<StreamChunk>`:** same pipeline as `chat()`, with `includePartialMessages: true`.
  - Maps `stream_event` `text_delta` events to `{ type: 'delta', content }`. Both cumulative and incremental snapshots are handled, and trailing text in `assistant` messages is reconciled.
  - Ends with one `{ type: 'done', content, usage, sessionId, costUsd, numTurns }`.
  - Spans are started and ended manually. On error: `onError` (phase `stream`).
- **`async structured(task, schema, opts = {})` -> `StructuredResult`:**
  - **Native mode** (`config.structured.native`): makes one `chat()` call with `systemPromptOverride = { type: 'preset', preset, append: base + strict directive }` and validates the reply locally. Throws `StructuredOutputError` on failure.
  - **Repair mode:** makes up to `1 + maxRepairAttempts` attempts. Repair turns call `resumeSession(lastSessionId)` and emit `structured:invalid` or `structured:ok`.
  - `opts`: chat opts plus `{ input?, inputLabel? }`.
- **`usageSummary()` -> `UsageSummary & { budget: BudgetSnapshot | null }`.**
- **`usageReport()` -> `string`:** `tracker.report()`, plus a budget line when `maxTokens` is set.

**Internal (private) methods**
- **Tools and MCP:** `_jsonSchemaToZod(parameters)`, `_claimBridgedCall(bareName, toolUseId)`, `_wrapHandler(tool)` → `(args, extra) => Promise<CallToolResult>`, `_toSdkTool(tool)`, `_buildMcpServers()`, `_buildAllowedTools()`.
- **Permission policy:** `_matchesDeny(toolName)`, `_toolHookPayload(toolName, args, toolUseId)`, `async _toolVerdictOnce(toolName, args, toolUseId)` → `{ verdict, cached }`, `_buildCanUseTool()`.
- **Native hook bridge:** `async _preToolHook(input)`, `async _postToolHook(input)`, `_buildNativeHooks()`.
- **Options and prompt assembly:** `_resolveSystemPromptText()`, `_buildOptions(opts, { streaming, systemPromptOverride })`, `_composePrompt(prompt)`.
- **Budget:** `async _gateOnBudget(report)`, `_reconcileBudget(runTotalTokens)`.
- **Message dispatch and spans:** `_onSdkMessage(msg, state)`, `_captureSession(sessionId)`, `async _withAgentSpan(fn)`, `_responseModel(resultMsg)`.
- **Run bodies:** `async _chat(prompt, opts, agentSpan)`, `_mapPartial(msg, state)`, `async *_stream(prompt, opts, agentSpan, onChatSpan)`, `async _structured(task, schema, opts)`.

## 6. Configuration Primitives

Precedence, lowest to highest (`loadConfig`):

1. `defaultConfig(env)`: built-in defaults. `model`, `effort`, and `baseURL` read `CLAUDE_AGENT_MODEL`, `CLAUDE_AGENT_EFFORT`, and `ANTHROPIC_BASE_URL`.
2. `loadConfigFile(configFile)`: the JSON file, passed through `normalizeSharedKeys` (`reasoningEffort` → `effort` when `effort` is absent in the same layer).
3. `configFromEnv(env)`: canonical `LLM_SDK_*` names are applied first, then the provider-prefixed `CLAUDE_AGENT_*`, `ANTHROPIC_BASE_URL`, and `OTEL_EXPORTER_OTLP_ENDPOINT`, which overwrite within the layer.
4. `overrides`: programmatic `options.config`, passed through `normalizeSharedKeys`.

The result of `mergeConfig` is checked by `validateConfig`. `buildQueryOptions` then projects it to SDK `Options`, with `requestDefaults` spread last. Finally `ClaudeAgentHarness._buildOptions` applies per-call `opts` and harness-owned keys.

- `defaultConfig(env = process.env)` -> `HarnessConfig`
- `mergeConfig(base, ...layers)` -> `object`: plain objects merge recursively, everything else replaces, `undefined` is skipped, and values are `structuredClone`d.
- `configFromEnv(env = process.env)` -> `Partial<HarnessConfig>`
- `loadConfigFile(file)` -> `object`: `{}` when `file` is falsy. Throws `Error` on read or parse failure.
- `validateConfig(config)` -> `HarnessConfig`: throws `ConfigError`. Internal helpers: `validateMcpServers`, `validateAgents`, `validatePermissions`.
- `loadConfig({ configFile?, overrides?, env? } = {})` -> `HarnessConfig`
- `resolveSystemPrompt(config)` -> `null | string | { type: 'preset', preset, append }`: reads `systemPromptFile` synchronously.
- `buildQueryOptions(config)` -> `Partial<SdkOptions>`. Notes:
  - `settingSources` is always emitted.
  - `baseURL` produces `env = { ...process.env, ...config.env, ANTHROPIC_BASE_URL }`.
  - Harness-only knobs are not forwarded.
- `normalizeSharedKeys(layer)` (internal) -> `layer`

**Executable resolution precedence** (`resolveExecutablePath`):
1. `config.pathToClaudeCodeExecutable` (must be a file)
2. `CLAUDE_AGENT_EXECUTABLE` (must be a file)
3. When `CLAUDE_AGENT_USE_CLI_LOGIN` is set and not `'0'`: `findNativeBinary()`
4. `findClaude()` from the package dir, then from `cwd` (or from `fromDir` alone when it is given)
5. `findNativeBinary()`, if not already tried
6. Throw (`required = true`) or return `null`

**Auth resolution order** (`resolveAuth`, first match wins): `ANTHROPIC_API_KEY` → `CLAUDE_CODE_OAUTH_TOKEN` → `CLAUDE_CODE_USE_BEDROCK` → `CLAUDE_CODE_USE_VERTEX` → `CLAUDE_AGENT_USE_CLI_LOGIN` (≠ `'0'`). If none is set, it throws.

## 7. Configuration Schema & Environment Variable Mapping

| Config Path | Type | Default Value | Mapped Environment Variable(s) |
| :--- | :--- | :--- | :--- |
| `agentName` | `string` | *(not in defaults; span name falls back to `'harness'`)* | - |
| `agents` | `Record<string, AgentDefinition>` | `{}` | - |
| `allowedTools` | `string[]` | `[]` | - |
| `autoAllowMcp` | `boolean` | `false` | - |
| `baseURL` | `string \| null` | `env.ANTHROPIC_BASE_URL ?? null` | `ANTHROPIC_BASE_URL` (default + env layer) |
| `contextStore.directory` | `string` | `'.claude-agent-harness/context'` | `LLM_SDK_STORE_DIR` (canonical), `CLAUDE_AGENT_STORE_DIR` (wins) |
| `contextStore.enabled` | `boolean` | `false` | set `true` by `LLM_SDK_STORE_DIR` / `CLAUDE_AGENT_STORE_DIR` |
| `cwd` | `string \| null` | `null` | - |
| `disallowedTools` | `string[]` | `[]` | - |
| `effort` | `'low'\|'medium'\|'high'\|'xhigh'\|'max'` | `env.CLAUDE_AGENT_EFFORT ?? 'low'` | `LLM_SDK_REASONING_EFFORT` (canonical), `CLAUDE_AGENT_EFFORT` (default + wins) |
| `env` | `Record<string,string> \| null` | `null` | - |
| `hookTimeoutMs` | `number \| null` | `null` | - |
| `maxTokens` | `number` | *(not in defaults; inert parity key)* | `LLM_SDK_MAX_TOKENS` |
| `maxTurns` | `number` | `10` | - |
| `mcpServers` | `Record<string, McpServerConfig>` | `{}` | - |
| `model` | `string` | `env.CLAUDE_AGENT_MODEL ?? 'claude-opus-4-8'` | `LLM_SDK_MODEL` (canonical), `CLAUDE_AGENT_MODEL` (default + wins) |
| `nativeHooks` | `Record<HookEvent, HookCallbackMatcher[]>` | `{}` | - |
| `observability.captureContent` | `boolean` | `false` | - |
| `observability.enabled` | `boolean` | `false` | - |
| `observability.exporterType` | `string \| null` | `null` | - |
| `observability.filePath` | `string \| null` | `null` | - |
| `observability.otlpEndpoint` | `string \| null` | `null` | `OTEL_EXPORTER_OTLP_ENDPOINT` (recorded only; wires nothing on the runtime) |
| `observability.providerName` | `string` | *(not in defaults; derived: `aws.bedrock` / `gcp.vertex_ai` / `anthropic`)* | indirectly `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX` |
| `observability.serviceName` | `string` | `'claude-agent-sdk-harness'` | - |
| `observability.sourceName` | `string` | *(not in defaults; read by `telemetryConfigFor`)* | - |
| `pathToClaudeCodeExecutable` | `string \| null` | `null` | `CLAUDE_AGENT_EXECUTABLE` |
| `permissionMode` | `'default'\|'acceptEdits'\|'plan'\|'bypassPermissions'` | `'default'` | `CLAUDE_AGENT_PERMISSION_MODE` |
| `permissions.allow` | `string[]` | `[]` | - |
| `permissions.deny` | `string[]` | `[]` | - |
| `reasoningEffort` | `string` | *(not in defaults; alias mirrored to `effort` per file/override layer)* | - |
| `requestDefaults` | `Partial<SdkOptions>` | `{}` | - |
| `settingSources` | `string[]` | `[]` | - |
| `structured.maxRepairAttempts` | `number` | `2` | - |
| `structured.native` | `boolean` | `false` | - |
| `systemPrompt` | `string \| null` | `null` | - |
| `systemPromptFile` | `string \| null` | `null` | `LLM_SDK_SYSTEM_PROMPT_FILE` (canonical), `CLAUDE_AGENT_SYSTEM_PROMPT_FILE` (wins) |
| `systemPromptMode` | `'append'\|'replace'` | `'append'` | - |
| `systemPromptPreset` | `string` | `'claude_code'` | - |
| `tokenBudget.enforcement` | `'block'\|'warn'` | `'block'` | - |
| `tokenBudget.maxTokens` | `number \| null` | `null` | `LLM_SDK_TOKEN_BUDGET` (canonical), `CLAUDE_AGENT_TOKEN_BUDGET` (wins) |
| `tokenBudget.warnAtPercent` | `number` | `80` | - |

**Runtime / non-config environment variables**

| Variable | Read By | Effect |
| :--- | :--- | :--- |
| `ANTHROPIC_API_KEY` | `runtime.resolveAuth` | auth mode `'api-key'` |
| `CLAUDE_AGENT_EXECUTABLE` | `config.configFromEnv`, `runtime.resolveExecutablePath` | executable path (precedence 2) |
| `CLAUDE_AGENT_USE_CLI_LOGIN` | `runtime.resolveAuth`, `runtime.resolveExecutablePath` | auth mode `'cli-login'`, and the native binary is preferred (ignored when `'0'`) |
| `CLAUDE_CODE_OAUTH_TOKEN` | `runtime.resolveAuth` | auth mode `'oauth-token'` |
| `CLAUDE_CODE_USE_BEDROCK` | `runtime.resolveAuth`, `harness.providerNameFor` | auth mode `'bedrock'`, and `gen_ai.provider.name = 'aws.bedrock'` (≠ `'0'`) |
| `CLAUDE_CODE_USE_VERTEX` | `runtime.resolveAuth`, `harness.providerNameFor` | auth mode `'vertex'`, and `gen_ai.provider.name = 'gcp.vertex_ai'` (≠ `'0'`) |
| `HOME` | `runtime.nativeBinaryLocations` | `~/.local/bin`, `~/.claude/local` probe roots |
| `PATH` (also `Path`) | `runtime.nativeBinaryLocations` | PATH probe directories |
| `USERPROFILE` | `runtime.nativeBinaryLocations` | HOME fallback |

## 8. Primitive Taxonomy

| Domain Layer | Module | Classes | Functions | Constants | Errors |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Core Orchestration** | `harness` | `ClaudeAgentHarness` (alias `Harness`) | `assertUserMessage`, `createHarness`, `extractContent`, `formatSSE`, `normalizeToolName`, `renderContextPreamble`, `resolveAnswerContent` (+ internal `argsChanged`, `cloneArgs`, `matchesPattern`, `providerNameFor`, `toToolResultText`, `toolTypeFor`, `usageFields`) | - | `EmptyPromptError` |
| **Configuration** | `config` | - | `buildQueryOptions`, `configFromEnv`, `defaultConfig`, `loadConfig`, `loadConfigFile`, `mergeConfig`, `resolveSystemPrompt`, `validateConfig` (+ internal `isPlainObject`, `normalizeSharedKeys`, `validateAgents`, `validateMcpServers`, `validatePermissions`) | `EFFORT`, `PERMISSION_MODES`, `REASONING_EFFORTS`, `THINKING_TYPES` | `ConfigError` |
| **Runtime / Discovery** | `runtime` | - | `createQuery`, `dispatchQuery`, `fallbackCreateSdkMcpServer`, `fallbackTool`, `findClaude`, `findClaudeBinary`, `findClosestModuleDir`, `findCopilot`, `findModule`, `findNativeBinary`, `inspectBinary`, `jsonSchemaToZod`, `jsonSchemaToZodShape`, `loadSdkTooling`, `nativeBinaryLocations`, `packageRootFromEntry`, `readManifestEntry`, `resolveAuth`, `resolveBinInfo`, `resolveClaudeCodeExecutable`, `resolveExecutablePath`, `resolveModuleEntry` (+ internal `binaryNameVariants`, `isDir`, `isExecutableFile`, `isFile`, `loadRealQuery`, `normalizeCandidates`) | `COPILOT_DEFAULT_CANDIDATES`, `DEFAULT_BINARY_NAMES`, `DEFAULT_CANDIDATES`, `DEFAULT_ORDER`, `DEFAULT_SYSTEM_DIRS` (+ internal `CLI_RELATIVE_CANDIDATES`, `NOT_RESOLVABLE`, `VERSIONISH`) | - |
| **Hooks** | `hooks` | `HookManager` | - | `HOOK_NAMES` | - |
| **Observability** | `observability` | `Observability` | `_setOtelApiForTests`, `genAiAttributes`, `loadOtelApi`, `telemetryConfigFor` | (internal `NOOP_SPAN`) | - |
| **Persistence** | `store` | `ContextStore` | (internal `sanitizeId`) | - | - |
| **Structured I/O** | `structured` | - | `buildRepairPrompt`, `buildStrictOutputDirective`, `buildStructuredPrompt`, `extractJson`, `parseStructuredResponse`, `renderStructuredInput`, `validateSchema` (+ internal `typeMatches`, `typeOf`) | - | `StructuredOutputError` |
| **Token Budget** | `tokens` | `TokenBudget` | `analyzeRun`, `analyzeRunAccurate`, `estimateMessagesTokens`, `estimateTokens` (+ internal `buildReport`) | (internal `CHARS_PER_TOKEN = 4`) | `TokenBudgetExceededError` |
| **Usage Accounting** | `usage` | `UsageTracker` | - | - | - |
| **Barrel** | `index` | - | - | - | - |

## 9. Upstream Consumed Packages & Primitives

- **Required Dependencies:**
  - `@anthropic-ai/claude-agent-sdk` (`^0.1.0`): dynamically imported (`await import(...)`) in `runtime.mjs` only.
    - *Client & Session Primitives:* `query({ prompt, options })` (via `loadRealQuery`), `tool(name, description, zodShape, handler)`, `createSdkMcpServer({ name, version, tools })`.
    - *`Options` keys set:* `abortController`, `agents`, `allowedTools`, `canUseTool`, `cwd`, `disallowedTools`, `effort`, `env`, `forkSession`, `hooks`, `includePartialMessages`, `maxTurns`, `mcpServers`, `model`, `pathToClaudeCodeExecutable`, `permissionMode`, `resume`, `settingSources`, `systemPrompt` (plus the `requestDefaults` passthrough).
    - *Bridged Upstream Hooks:* `PreToolUse`, `PostToolUse`, `SessionEnd`, `SessionStart`, `Stop` (no-op), `UserPromptSubmit`. User `config.nativeHooks` matchers are concatenated after the bridged ones.
    - *Consumed Upstream Events (`SDKMessage`):*
      - `system`/`init`: `session_id`, `mcp_servers`.
      - `assistant`: `message.{id,content,usage,model}`, `parent_tool_use_id`.
      - `stream_event`: `event.type = content_block_delta` with `delta.type ∈ {text_delta, thinking_delta}`.
      - `result`: `subtype`, `session_id`, `usage`, `total_cost_usd`, `num_turns`, `modelUsage`, `permission_denials`.
    - *Hook inputs consumed:*
      - Tool hooks: `tool_name`, `tool_input`, `tool_use_id`, `tool_output` / `tool_response`, `is_error`.
      - Prompt and session hooks: `prompt`, `session_id`, `reason`.
    - *Hook outputs produced:* `hookSpecificOutput { hookEventName: 'PreToolUse', permissionDecision: 'deny'|'allow', permissionDecisionReason?, updatedInput? }`.
    - *`canUseTool` results:* `{ behavior: 'deny', message, interrupt: false }` and `{ behavior: 'allow', updatedInput }`.
    - *MCP tool-call extra read:* `extra.toolUseId` and `extra._meta['claudecode/toolUseId']`.
  - `zod` (`^3.25.0 || ^4.0.0`): dynamically imported in `loadSdkTooling`. Uses `z.any`, `z.array`, `z.boolean`, `z.enum`, `z.number`, `z.number().int`, `z.object`, `z.string`, `.describe`, `.nullable`, `.optional`.
- **Optional / Peer Dependencies:**
  - `@opentelemetry/api` (`>=1.7.0`, `optional: true`): dynamically imported by `loadOtelApi`, with no-op fallback.
    - *API primitives:* `trace.getTracer`, `trace.setSpan`, `context.active`, `context.with`, `metrics.getMeter`, `SpanKind`, `SpanStatusCode.ERROR`.
    - *Telemetry / Metrics Instruments (Counters, Histograms, Gauges, Spans):*
      - Counter `claude_agent_harness.errors` (attr `kind=provider|rate_limit|session|harness`, plus `reason`/`status`)
      - Counter `claude_agent_harness.requests`
      - Counter `claude_agent_harness.tokens` (attr `direction=input|output|reasoning|cache_read|cache_write`, `model`)
      - Counter `claude_agent_harness.tool.calls` (attrs `tool`, `outcome=success|failure|denied`)
      - Histogram `claude_agent_harness.request.duration_ms` (unit `ms`)
      - Histogram `claude_agent_harness.request.ttft_ms` (unit `ms`)
      - Histogram `claude_agent_harness.tool.duration_ms` (unit `ms`)
      - ObservableGauge `claude_agent_harness.budget.utilization`
      - ObservableGauge `claude_agent_harness.context_window.utilization`
      - Spans: `invoke_agent {agentName}` (CLIENT), `chat {model}` (CLIENT), `execute_tool {bareToolName}` (INTERNAL)
      - Span event: `gen_ai.client.inference.operation.details` (opt-in content capture)
      - Span attributes (`gen_ai.*`): `agent.name`, `conversation.id`, `input.messages`, `operation.name`, `output.messages`, `provider.name`, `request.model`, `response.model`, `response.time_to_first_chunk`, `tool.call.id`, `tool.name`, `tool.type`, `usage.input_tokens`, `usage.output_tokens`, `usage.reasoning.output_tokens`
- **Node built-ins:** `node:events` (`EventEmitter`), `node:fs`, `node:module` (`createRequire`), `node:path`, `node:url` (`fileURLToPath`).

## 10. Events, EventEmitter & Lifecycle Hooks

**Emitted Events Surface** (`ClaudeAgentHarness extends EventEmitter`)
- **Static Events:**
  - **Budget:**
    - `budget:exceeded` (`BudgetSnapshot`)
    - `budget:warn` (`BudgetSnapshot`)
  - **Streaming and messages:**
    - `delta` (`{ content, event }`)
    - `event` (raw `SDKMessage`)
    - `message` (`{ content, event }`)
  - **Run lifecycle:**
    - `error:run` (`{ error, prompt }`)
    - `preflight` (`RunAnalysis`)
    - `run:end` (`ChatResult` | done chunk)
    - `run:start` (`{ prompt, sessionId }`)
    - `started` (`{}`)
    - `stopped` (`{ errors }`)
  - **Sessions:**
    - `session:created` (`{ sessionId }`)
    - `session:replayed` (`{ from, sessionId, messages, turns }`)
    - `session:resumed` (`{ sessionId, mode: 'resume'|'continue'|'fork', restored }`)
  - **Structured output:**
    - `structured:invalid` (`{ attempt, errors }`)
    - `structured:ok` (`{ attempts }`)
  - **Subagents:**
    - `subagent:activity` (`{ parentToolUseId, content }`)
    - `subagent:start` (`{ parentToolUseId }`)
  - **Tools:**
    - `tool:call` (`{ tool, qualifiedName?, args, toolUseId }`)
    - `tool:denied` (`{ tool, qualifiedName, toolUseId, reason }`)
    - `tool:error` (`{ tool, qualifiedName?, error, durationMs, toolUseId }`)
    - `tool:result` (`{ tool, qualifiedName?, result, durationMs, toolUseId }`)
  - **Usage:**
    - `usage:tokens` (`UsageRecord` of kind `tokens`)
- **Dynamic / Namespaced Events:** None present in current codebase. All event names are string literals.

**Lifecycle Hooks Semantics** (`HookManager.run`). Errors from hooks whose name starts with `on` or `after` are swallowed into the result list as `{ hookError }`. Errors from every other hook propagate.

| Hook Name | `canVeto` | `errorSemantics` | Upstream Mapping / Trigger Point |
| :--- | :--- | :--- | :--- |
| `afterRun` | `false` | `swallowed` | `chat()`/`stream()` after `ingestResult`, budget reconcile, and store write, before `run:end` |
| `afterToolCall` | `false` | `swallowed` | Native `PostToolUse` (non-error output), or the handler wrapper when the call is not bridged |
| `beforeRun` | `true` | `propagates` | After `preflight()`, before the budget gate and dispatch. Throwing aborts the run |
| `beforeToolCall` | `true` | `propagates` | Native `PreToolUse` and `canUseTool`, evaluated once per `toolUseId` per run (`permissions.deny` is checked first). `{ deny, reason }` blocks; `{ updatedInput }` or an in-place mutation of the args rewrites the input |
| `onBudgetExceeded` | `false` | `swallowed` | Budget gate in `block` mode (awaited, before the throw); post-run reconcile `exceeded` (fire-and-forget) |
| `onBudgetWarning` | `false` | `swallowed` | Post-run reconcile `warn` transition (fire-and-forget, fires once per budget) |
| `onError` | `false` | `swallowed` | `chat`/`stream` catch block, `phase: 'chat' \| 'stream'` |
| `onPromptSubmit` | `false` | `swallowed` | Native `UserPromptSubmit` |
| `onSessionEnd` | `false` | `swallowed` | Native `SessionEnd`; `harness.stop()` when a session ran |
| `onSessionStart` | `false` | `swallowed` | Native `SessionStart` |
| `onToolFailure` | `false` | `swallowed` | Native `PostToolUse` (error output or handler error), or the handler wrapper when not bridged |

**Verdict collapse** (`HookManager.toolCallVerdict`): the first `{ deny: true }` wins, and its `reason` defaults to `'denied by beforeToolCall hook'`. Otherwise the last `{ updatedInput }` wins. The result is `{ deny: false }` or `{ deny: false, updatedInput }`.

## 11. Building Block Classes & Pure Functions

**Building Block Classes**
- **`HookManager` (`src/hooks.mjs`)**
  - *Constructor:* `new HookManager(initial = {})`. Seeds an empty list for each of `HOOK_NAMES`, then registers `initial` entries (`fn | fn[]`).
  - *Fields:* `_hooks: Map<HookName, Function[]>`
  - *Methods:*
    - `register(name, fn)` -> `() => void`: returns an unsubscribe function. Throws `Error` for an unknown name and `TypeError` for a handler that is not a function.
    - `count(name)` -> `number`
    - `async run(name, payload)` -> `unknown[]`
    - `async toolCallVerdict(payload)` -> `ToolVerdict`
- **`ContextStore` (`src/store.mjs`)**
  - *Constructor:* `new ContextStore({ directory })`. Throws without `directory`, and `path.resolve`s it.
  - *Fields:* `directory`
  - *Methods:*
    - `saveExchange(sessionId, { request, response, usage?, meta? })` -> `ExchangeRecord`: appends a `.jsonl` line and rewrites `.meta.json`.
    - `load(sessionId)` -> `ExchangeRecord[]`
    - `meta(sessionId)` -> `SessionMeta | null`
    - `list()` -> `SessionMeta[]`, sorted by `updatedAt` descending.
    - `latestSessionId()` -> `string | null`
    - `asContextMessages(sessionId)` -> `ContextMessage[]`
    - `remove(sessionId)` -> `void`
    - Private: `_ensureDir()`, `_file(sessionId, ext)`
- **`Observability` (`src/observability.mjs`)**
  - *Constructor:* `new Observability(obsConfig = {}, deps = {})`, where `deps` is `{ api?, providerName? }`.
  - *Fields:* `config`, `enabled`, `_api`, `_tracer`, `_instruments`, `_budgetSnapshot`, `_contextSnapshot`, `_defaultProvider`
  - *Getters:*
    - `providerName`: `config.providerName ?? _defaultProvider`
    - `captureContent`: `config.captureContent === true`
  - *Methods:*
    - `async init()` -> `this`
    - `startSpan(name, attributes = {}, opts = {})` -> `Span`
    - `async withSpan(name, attributes, fn, opts = {})`
    - `invokeAgentSpan(info, fn)`, `chatSpan(info, fn)`, `toolSpan(info, fn)`
    - `startInvokeAgentSpan(info)`, `startChatSpan(info)`, `startToolSpan(info)`
    - `endSpan(span, error)`
    - `setGenAiUsage(span, usage = {}, { responseModel, ttftMs } = {})`
    - `recordContent(span, { input, output } = {})`
    - `recordRequestStart(attrs = {})`
    - `recordRequestEnd({ durationMs, ttftMs, model } = {})`
    - `recordTokens({ inputTokens, outputTokens, reasoningTokens, cacheReadTokens, cacheWriteTokens, model } = {})`
    - `recordToolCall({ tool, outcome, durationMs } = {})`
    - `recordError(kind, attrs = {})`
    - `observeBudget(snapshot)`, `observeContextWindow(usageInfo)`
    - `ingest(record, raw = {})`
    - Private: `_invokeAgentSpec(info)`, `_chatSpec(info)`, `_toolSpec(info)`
- **`TokenBudget` (`src/tokens.mjs`)**
  - *Constructor:* `new TokenBudget({ maxTokens = null, warnAtPercent = 80, enforcement = 'block' } = {})`
  - *Fields:* `maxTokens`, `warnAtPercent`, `enforcement`, `used`, `_warned`
  - *Getters:*
    - `remaining`: `Infinity` when unlimited
    - `utilizationPercent`: capped at 100
  - *Methods:*
    - `record(tokens)` -> `'ok' | 'warn' | 'exceeded'`
    - `wouldExceed(estimate)` -> `boolean`
    - `checkOrThrow(estimate, context = {})` -> `boolean`: throws `TokenBudgetExceededError` in `block` mode.
    - `snapshot()` -> `BudgetSnapshot`
- **`UsageTracker` (`src/usage.mjs`)**
  - *Constructor:* `new UsageTracker()`, which calls `reset()`.
  - *Fields:* `tokens`, `lastRunTokens`, `_completed`, `apiCalls`, `cost`, `numTurns`, `models`, `tools`, `subagents`, `errors`, `latency`, `contextWindow`, `_seenMessageIds`, `_seenSubagentMessageIds`, `_interim`
  - *Static (private):* `_emptyTokens()`, `_usageFields(u = {})`, `_stats(values)`
  - *Methods:*
    - `reset()`
    - `ingestStepUsage(assistantMessage)` -> `UsageRecord | null`: de-duplicated by `message.id`.
    - `ingestResult(result, meta = {})` -> `UsageRecord`: authoritative for the run. Supersedes interim counts and folds in `modelUsage` and `permission_denials`.
    - `ingestSubagent({ parentToolUseId, usage, messageId } = {})`
    - `ingestToolCall({ name, success, durationMs, denied } = {})`
    - `ingestError({ status, message } = {})`
    - `ingestSessionError(message)`
    - `ingestContextWindow(info)`
    - `summary()` -> `UsageSummary`
    - `report()` -> `string`
    - Private: `_syncLiveTotals()`, `_model(name)`, `_tool(name)`, `_subagent(key)`, `_recomputeTotal()`

**Pure Transformation, Estimation & Validation Functions**
- `config`: `mergeConfig(base, ...layers) -> object`
- `config`: `validateConfig(config) -> HarnessConfig`. Pure except for a `fs.existsSync(systemPromptFile)` check.
- `harness`:
  - `assertUserMessage(message, method = 'chat') -> void`
  - `extractContent(content = []) -> ExtractedContent`
  - `formatSSE(item = {}) -> string`
  - `normalizeToolName(name) -> string`
  - `renderContextPreamble(messages = []) -> string`
  - `resolveAnswerContent(content = [], fallback = undefined) -> string`
- `observability`:
  - `genAiAttributes(attrs = {}) -> object`: drops `null`, `undefined`, and `''` values.
  - `telemetryConfigFor(obsConfig) -> TelemetryConfig | undefined`
- `runtime`:
  - `fallbackCreateSdkMcpServer({ name = 'harness', version = '0.1.0', tools = [] } = {}) -> SdkMcpServerConfig`
  - `fallbackTool(name, description, inputSchema, handler) -> SdkMcpToolDefinition`
  - `jsonSchemaToZod(z, node = {}) -> ZodType`
  - `jsonSchemaToZodShape(z, schema = {}) -> Record<string, ZodType>`
  - `nativeBinaryLocations(opts = {}) -> BinaryLocation[]`: pure, with no existence checks.
- `structured`:
  - `buildRepairPrompt({ errors, schema }) -> string`
  - `buildStrictOutputDirective(schema) -> string`
  - `buildStructuredPrompt({ task, input, schema, label }) -> string`
  - `extractJson(text) -> { value } | { error }`: tries a fenced block, then the whole string, then the first balanced `{…}` or `[…]`.
  - `parseStructuredResponse(text, schema) -> { ok: true, value } | { ok: false, errors }`
  - `renderStructuredInput(input, label = 'input') -> string`
  - `validateSchema(value, schema, pathPrefix = '$') -> { valid, errors }`: covers a draft-07 subset (`type`, `properties`, `required`, `items`, `enum`, `const`, `additionalProperties: false`, `min*`/`max*`, `pattern`).
- `tokens`:
  - `analyzeRun(input, budget) -> RunAnalysis`
  - `analyzeRunAccurate(clientOrInput, inputOrBudget, maybeBudget) -> RunAnalysis`: delegates to the heuristic, and accepts and ignores a `client` argument.
  - `estimateMessagesTokens(messages = []) -> number`: adds 4 tokens of framing per message.
  - `estimateTokens(text) -> number`: `max(ceil(len / 4), ceil(words * 4 / 3))`.

**Filesystem / Resolution / Runtime I/O Helpers**
- `config`:
  - `loadConfig({ configFile, overrides, env } = {}) -> HarnessConfig`
  - `loadConfigFile(file) -> object`
  - `resolveSystemPrompt(config) -> SystemPromptValue | null`
- `observability`:
  - `async loadOtelApi() -> OtelApi | null`: cached after the first call.
  - `_setOtelApiForTests(api) -> void`
- `runtime`:
  - `async *dispatchQuery({ prompt, options, queryImpl, env, fromDir } = {}) -> AsyncGenerator<SDKMessage>`
  - `async loadSdkTooling() -> { tool, createSdkMcpServer, zod }`
  - `createQuery(config, { queryImpl, env, abortController, fromDir } = {}) -> RunFn`
  - `findClaude(opts = {}) -> (ModuleHit & { pathToClaudeCodeExecutable }) | null`
  - `findClaudeBinary(opts = {}) -> ClaudeInstallHit | null`: throws on an unknown `order` kind.
  - `findClosestModuleDir(moduleName, opts = {}) -> string | null`
  - `findCopilot(opts = {}) -> ModuleHit | null`
  - `findModule(candidates, opts = {}) -> ModuleHit | null`
  - `findNativeBinary(opts = {}) -> NativeBinaryHit | null`
  - `inspectBinary(p, opts = {}) -> BinaryInfo | null`
  - `packageRootFromEntry(moduleName, entry, opts = {}) -> string | null`
  - `readManifestEntry(dir) -> string | null`
  - `resolveAuth(env = process.env, { required = true } = {}) -> { mode }`
  - `resolveBinInfo(moduleName, dir) -> { binDir, bin }`
  - `resolveClaudeCodeExecutable(moduleName, dir) -> string | null`
  - `resolveExecutablePath({ config, env, fromDir, required = true } = {}) -> string | null`
  - `resolveModuleEntry(moduleName, opts = {}) -> string | null`
  - Internal: `isDir`, `isFile`, `isExecutableFile`, `loadRealQuery`

## 12. Error Types, Exceptions & Exported Constants

**Custom Error Classes**
1. **`ConfigError` (`./config` / `src/config.mjs`):** `extends Error`, `name = 'ConfigError'`, `inRootBarrel: true`. Thrown by `validateConfig` when it finds problems in `effort`, `permissionMode`, `model`, `baseURL`, `maxTurns`, `allowedTools`, `disallowedTools`, `settingSources`, `tokenBudget.*`, `systemPromptMode`, `systemPromptFile` (missing file), `mcpServers`, `agents`, or `permissions`. The message is `Invalid harness config:\n  - …`.
2. **`EmptyPromptError` (root barrel only / `src/harness.mjs`):** `extends Error`, `name = 'EmptyPromptError'`, field `method`, `inRootBarrel: true`. Thrown by `assertUserMessage` (from `chat`, `stream`, and `structured`) when the prompt is not a string or is empty or whitespace.
3. **`StructuredOutputError` (`./structured` / `src/structured.mjs`):** `extends Error`, `name = 'StructuredOutputError'`, fields `errors` and `attempts` (assigned from details), `inRootBarrel: true`. Thrown by `harness.structured()` after the repair attempts run out (`1 + maxRepairAttempts`), or after the single native-mode validation fails.
4. **`TokenBudgetExceededError` (`./tokens` / `src/tokens.mjs`):** `extends Error`, `name = 'TokenBudgetExceededError'`, fields `used`, `estimate`, `maxTokens` (plus context), `inRootBarrel: true`. Thrown by `TokenBudget.checkOrThrow` in `block` mode when `used + estimate > maxTokens`, through `harness._gateOnBudget`.

**Uncategorized `Error` / `TypeError` throws**
- `ContextStore` constructor: `ContextStore requires a directory`.
- `HookManager.register`: unknown hook (`Error`), or a handler that is not a function (`TypeError`).
- `registerTool`: `TypeError` (`registerTool requires { name, handler }`).
- `_jsonSchemaToZod`: zod missing while using the real SDK.
- `loadConfigFile`: read or JSON parse failure.
- `resolveExecutablePath`:
  - an explicit or env path that is not a file;
  - not found while `required`.
- `resolveAuth`: no auth found while `required`.
- `findClaudeBinary`: unknown `order` kind.
- `chat`/`stream`:
  - `Runtime ended without a result message …`
  - `Run did not succeed (subtype: …)`
- `resolveModuleEntry`: rethrows resolver errors whose code is not in `NOT_RESOLVABLE`.

**Exported Constants**
- **`COPILOT_DEFAULT_CANDIDATES` (`./runtime`):** `['@github/copilot', '@github/copilot-sdk', '@github/copilot-language-server']`
- **`DEFAULT_BINARY_NAMES` (`./runtime`):** `['claude']`
- **`DEFAULT_CANDIDATES` (`./runtime`):** `['@anthropic-ai/claude-code', '@anthropic-ai/claude-agent-sdk']`
- **`DEFAULT_ORDER` (`./runtime`):** `['node-module', 'native-binary']`
- **`DEFAULT_SYSTEM_DIRS` (`./runtime`):** `['/usr/local/bin', '/opt/homebrew/bin']`
- **`EFFORT` (`./config`):** `['low', 'medium', 'high', 'xhigh', 'max']`
- **`HOOK_NAMES` (`./hooks`):** `['beforeRun', 'afterRun', 'beforeToolCall', 'afterToolCall', 'onToolFailure', 'onPromptSubmit', 'onSessionStart', 'onSessionEnd', 'onError', 'onBudgetWarning', 'onBudgetExceeded']`
- **`PERMISSION_MODES` (`./config`):** `['default', 'acceptEdits', 'plan', 'bypassPermissions']`
- **`REASONING_EFFORTS` (`./config`):** `EFFORT` (the same array reference)
- **`THINKING_TYPES` (`./config`):** `['adaptive', 'disabled']` (inert; kept for interchange parity)

**Interior (unexported) constants:**
- `CHARS_PER_TOKEN = 4` (`tokens`)
- `CLI_RELATIVE_CANDIDATES = ['cli.js', 'vendor/claude-code/cli.js']` (`runtime`)
- `NOT_RESOLVABLE = Set{'MODULE_NOT_FOUND','ERR_MODULE_NOT_FOUND','ERR_PACKAGE_PATH_NOT_EXPORTED','ERR_UNSUPPORTED_DIR_IMPORT'}` (`runtime`)
- `VERSIONISH = /^\d+\.\d+\.\d+/` (`runtime`)
- `NOOP_SPAN` (`observability`)

## 13. All Primitive Data Shapes (Interior & Public Schemas)

Shapes are derived from source. Types marked **opaque** come from external packages and are not resolved here.

```ts
// ---------- opaque external contracts ----------
type SDKMessage = /* opaque: @anthropic-ai/claude-agent-sdk */ any;
type SdkOptions = /* opaque: @anthropic-ai/claude-agent-sdk Options */ Record<string, unknown>;
type McpServerConfig = /* opaque (validated: stdio{command} | http/sse{url} | sdk) */ Record<string, unknown>;
type HookCallbackMatcher = /* opaque */ { matcher?: string; hooks: Function[]; timeout?: number | null };
type ZodType = /* opaque: zod */ any;
type Span = /* opaque: @opentelemetry/api Span | NOOP_SPAN */ any;

// ---------- 1. configuration ----------
type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';

interface AgentDefinition {          // keys restricted by validateAgents
  description: string;
  prompt: string;
  tools?: string[];
  model?: string;
  effort?: Effort;
  permissionMode?: PermissionMode;
  maxTurns?: number;
}

interface HarnessConfig {
  model: string;
  effort: Effort;
  permissionMode: PermissionMode;
  allowedTools: string[];
  disallowedTools: string[];
  maxTurns: number;
  cwd: string | null;
  env: Record<string, string> | null;
  settingSources: string[];
  mcpServers: Record<string, McpServerConfig>;
  pathToClaudeCodeExecutable: string | null;
  baseURL: string | null;
  agents: Record<string, AgentDefinition>;
  permissions: { allow: string[]; deny: string[] };
  autoAllowMcp: boolean;
  nativeHooks: Record<string, HookCallbackMatcher[]>;
  hookTimeoutMs: number | null;
  systemPrompt: string | null;
  systemPromptFile: string | null;
  systemPromptMode: 'append' | 'replace';
  systemPromptPreset: string;
  tokenBudget: { maxTokens: number | null; warnAtPercent: number; enforcement: 'block' | 'warn' };
  contextStore: { enabled: boolean; directory: string };
  observability: {
    enabled: boolean; serviceName: string; otlpEndpoint: string | null;
    exporterType: string | null; filePath: string | null; captureContent: boolean;
    providerName?: string; sourceName?: string;     // read, not defaulted
  };
  structured: { maxRepairAttempts: number; native: boolean };
  requestDefaults: Partial<SdkOptions>;
  // read but not defaulted:
  agentName?: string;
  reasoningEffort?: string;   // alias → effort
  maxTokens?: number;         // inert parity key (LLM_SDK_MAX_TOKENS)
}

type SystemPromptValue = string | { type: 'preset'; preset: string; append: string };

interface TelemetryConfig {
  otlpEndpoint?: string; filePath?: string;
  exporterType?: string;          // 'otlp-http' | 'file' | custom
  sourceName?: string; captureContent?: boolean;
}

interface HarnessOptions {
  configFile?: string;
  config?: Partial<HarnessConfig>;
  hooks?: Partial<Record<HookName, Function | Function[]>>;
}
interface HarnessDeps {
  queryImpl?: (args: { prompt: string; options: SdkOptions }) => AsyncIterable<SDKMessage>;
  tool?: Function; createSdkMcpServer?: Function; zod?: unknown; env?: NodeJS.ProcessEnv;
}

// ---------- 2. discovery / resolution ----------
interface FinderOpts { candidates?: string | string[]; fromDir?: string; strategy?: 'auto' | 'native' | 'manual' }
interface ModuleHit {
  name: string; dir: string | null; entry: string | null; binDir: string | null;
  bin: Record<string, string>; strategy: 'native' | 'manual'; fromDir: string;
}
interface ClaudeModuleHit extends ModuleHit { pathToClaudeCodeExecutable: string | null }
interface BinaryLocation { source: 'home-local-bin' | 'claude-local' | 'system' | 'PATH'; path: string }
interface BinaryInfo { path: string; realpath: string; dir: string; version: string | null; isSymlink: boolean }
interface NativeBinaryHit extends BinaryInfo {
  kind: 'native-binary'; name: string; source: BinaryLocation['source']; executable: string;
}
type ClaudeInstallHit = (ClaudeModuleHit & { kind: 'node-module'; executable: string }) | NativeBinaryHit;
interface AuthResolution { mode: 'api-key' | 'oauth-token' | 'bedrock' | 'vertex' | 'cli-login' | null }
type RunFn = ((prompt: string) => AsyncIterable<SDKMessage>) & { abortController: AbortController; options: SdkOptions };

// ---------- 3. execution, streaming, tools ----------
interface CallOpts {
  model?: string; effort?: Effort; permissionMode?: PermissionMode; maxTurns?: number;
  systemPrompt?: SystemPromptValue; systemPromptOverride?: SystemPromptValue | null;
  abortController?: AbortController;
  context?: ContextMessage[]; attachments?: string[]; expectedOutputTokens?: number;
}
interface RunUsage {
  inputTokens: number; outputTokens: number; totalTokens: number;
  cacheReadTokens: number; cacheWriteTokens: number;
  durationMs: number; ttftMs: number | null;
}
interface ChatResult {
  content: string; usage: RunUsage; sessionId: string | null;
  costUsd: number | null; numTurns: number | null; result: SDKMessage;
}
type StreamChunk =
  | { type: 'delta'; content: string }
  | { type: 'done'; content: string; usage: RunUsage; sessionId: string | null; costUsd: number | null; numTurns: number | null };

interface ExtractedContent { text: string; thinking: string[]; toolUses: object[] }

interface RegisteredTool {
  name: string; description?: string;
  parameters?: object;                    // JSON Schema (object)
  handler: (input: unknown, ctx: { sessionId: string | null; toolUseId?: string }) => unknown | Promise<unknown>;
}
interface CallToolResult { content: Array<{ type: 'text'; text: string }>; isError?: true }
interface SdkMcpToolDefinition { name: string; description: string; inputSchema: unknown; handler: Function } // fallbackTool
interface SdkMcpServerConfig {                                                                            // fallbackCreateSdkMcpServer
  type: 'sdk'; name: string; version: string; mcp_server: { name: string; version: string; tools: SdkMcpToolDefinition[] };
}
interface FallbackZodDescriptor {                   // offline _jsonSchemaToZod
  __jsonSchema: object;
  safeParse(input: unknown): { success: true; data: unknown } | { success: false; error: { issues: string[] } };
  parse(input: unknown): unknown;
}

// ---------- 4. structured output ----------
interface StructuredOpts extends CallOpts { input?: unknown; inputLabel?: string }
interface StructuredResult {
  value: unknown; content: string; attempts: number;
  usage: RunUsage | { inputTokens: number; outputTokens: number; totalTokens: number }; // repair mode sums 3 fields
}
interface SchemaValidation { valid: boolean; errors: string[] }
type JsonExtraction = { value: unknown } | { error: string };
type ParsedStructured = { ok: true; value: unknown } | { ok: false; errors: string[] };

// ---------- 5. hooks ----------
type HookName =
  | 'beforeRun' | 'afterRun' | 'beforeToolCall' | 'afterToolCall' | 'onToolFailure'
  | 'onPromptSubmit' | 'onSessionStart' | 'onSessionEnd' | 'onError'
  | 'onBudgetWarning' | 'onBudgetExceeded';

interface BeforeRunPayload { prompt: string; sessionId: string | null; analysis: RunAnalysis }
interface AfterRunPayload { prompt: string; response: string; usage: RunUsage; sessionId: string | null }
interface ToolHookPayload {
  toolName: string; bareToolName: string; args: unknown; sessionId: string | null;
  toolUseId?: string; toolUseID?: string;      // both spellings
}
interface AfterToolCallPayload extends ToolHookPayload { result: unknown; durationMs: number }
interface ToolFailurePayload extends ToolHookPayload { error: unknown }
interface PromptSubmitPayload { prompt: string; sessionId: string | null }
interface SessionPayload { sessionId: string | null; reason?: string }
interface ErrorPayload { error: unknown; phase: 'chat' | 'stream'; sessionId: string | null }
interface BudgetWarningPayload { budget: BudgetSnapshot }
interface BudgetExceededPayload { budget: BudgetSnapshot; estimate?: number }

type BeforeToolCallReturn = { deny?: boolean; reason?: string; updatedInput?: unknown } | void;
type ToolVerdict =
  | { deny: true; reason: string; policy?: true }
  | { deny: false; updatedInput?: unknown };
type HookRunResult = unknown | { hookError: unknown };   // observe-only hooks swallow errors

// native bridge I/O
interface PreToolUseOutput {
  hookSpecificOutput: { hookEventName: 'PreToolUse'; permissionDecision: 'deny' | 'allow';
    permissionDecisionReason?: string; updatedInput?: unknown };
}
type CanUseToolResult =
  | { behavior: 'deny'; message: string; interrupt: false }
  | { behavior: 'allow'; updatedInput: unknown };

// ---------- 6. interior state records ----------
interface ContextMessage { role: 'user' | 'assistant' | string; content: string }

interface ExchangeRecord {                 // <dir>/<sessionId>.jsonl line
  timestamp: string;                       // ISO-8601
  request: { prompt: string } | null;
  response: { content: string } | null;
  usage: RunUsage | null;
  meta: { model?: string } | null;
}
interface SessionMeta {                    // <dir>/<sessionId>.meta.json
  sessionId: string; createdAt: string; updatedAt: string; exchanges: number; model?: string;
}

interface BudgetSnapshot {
  maxTokens: number | null; used: number; remaining: number | null;
  utilizationPercent: number;              // 1 decimal
  enforcement: 'block' | 'warn';
}
interface RunAnalysisInput {
  prompt: string; systemPrompt?: string | null; context?: ContextMessage[];
  attachments?: string[]; expectedOutputTokens?: number;
}
interface RunAnalysis {
  breakdown: { promptTokens: number; systemTokens: number; contextTokens: number; attachmentTokens: number; expectedOutputTokens: number };
  estimatedInputTokens: number; estimatedTotalTokens: number;
  budget: BudgetSnapshot | null; fitsWithinBudget: boolean;
  recommendation: string;                  // 'ok' | 'blocked: …' | 'over budget: …'
}

interface TokenTotals { input: number; output: number; reasoning: number; cacheRead: number; cacheWrite: number; total: number }
type UsageRecord =                         // UsageTracker.ingest* → Observability.ingest
  | { kind: 'tokens'; inputTokens: number; outputTokens: number; model: string }
  | { kind: 'subagent'; parentToolUseId: string }
  | { kind: 'tool:end'; tool: string; success: boolean; durationMs: number; denied: boolean }
  | { kind: 'provider:error'; status: number | null; message: string }
  | { kind: 'session:error'; message: string }
  | ({ kind: 'context' } & ContextWindowInfo);
interface ContextWindowInfo { currentTokens?: number; tokenLimit?: number; messagesLength?: number }
interface ModelStats { calls: number; inputTokens: number; outputTokens: number; totalDurationMs: number }
interface ToolStats { calls: number; succeeded: number; failed: number; denied: number; totalDurationMs: number }
interface SubagentStats { inputTokens: number; outputTokens: number; turns: number; messages: number }
interface LatencyStats { count: number; avg: number; p50: number; p95: number; max: number }
interface UsageSummary {
  tokens: TokenTotals; lastRunTokens: TokenTotals; apiCalls: number;
  cost: number | null;                     // client-side estimate (total_cost_usd), not billing
  numTurns: number | null;
  models: Record<string, ModelStats>;
  tools: Record<string, ToolStats & { avgDurationMs: number }>;
  subagents: Record<string, SubagentStats>;   // keyed by parent_tool_use_id
  errors: { providerFailures: number; rateLimited: number; sessionErrors: number };
  latency: { ttftMs: LatencyStats | null; callDurationMs: LatencyStats | null };
  contextWindow: ContextWindowInfo | null;
}
// UsageTracker private: _completed: TokenTotals; _interim: { input; output; cacheRead; cacheWrite };
//                       _seenMessageIds: Set<string>; _seenSubagentMessageIds: Set<string>

interface PendingToolCall {                // harness._pendingToolCalls value
  name: string; bareName: string; toolUseId: string; args: unknown; sanitized: boolean;
  startedAt: number; claimed: boolean; span: Span; error?: unknown;
}
interface MessageDispatchState {           // _onSdkMessage state
  answer: string; result: SDKMessage | null; subagentSeen: Set<string>; mcpServers?: unknown[];
}
interface PartialStreamState { emittedText: string; emittedThinking?: string }

interface OtelInstruments {                // Observability._instruments
  requests: Counter; tokens: Counter; errors: Counter;
  duration: Histogram; ttft: Histogram; toolCalls: Counter; toolDuration: Histogram;
}
type Counter = /* opaque OTel */ any; type Histogram = /* opaque OTel */ any;
interface SpanSpec { name: string; attributes: Record<string, unknown>; opts: { kind: 'client' | 'internal' } }
```
