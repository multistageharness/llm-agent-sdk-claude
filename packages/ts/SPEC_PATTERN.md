# SPEC_PATTERN — `llm-sdk-claude-agent` (claude-agent-sdk/v100)

The pattern catalog for this harness. It lists every supported way of using
`@anthropic-ai/claude-agent-sdk` through `ClaudeAgentHarness`, what each pattern
composes with, and which example demonstrates it.

- **Scope:** `claude-agent-sdk/v100` (`src/`, `examples/`; this file lives at the package root),
  `@anthropic-ai/claude-agent-sdk ^0.1.0`, Node ≥ 20.6, ESM.
- **Grounding:** each claim here is checked against `src/harness.mjs`, `src/config.mjs`,
  `src/runtime.mjs`, `src/hooks.mjs`, `src/usage.mjs`, `src/tokens.mjs`, `src/structured.mjs`,
  `src/store.mjs`, the tests, and the 25 examples. When an example's comments and the source
  disagree, this file follows the source and records the difference in
  [§7 Caveats](#7-caveats--known-gaps). These claims come from reading the source; they were not
  run against a live runtime.
- **Research input:** *@anthropic-ai/claude-agent-sdk: Primitives and Use Cases* (2026-10-27). It
  covers `query()`, messages, built-in and custom tools, in-process and external MCP, sessions,
  subagents, permissions, hooks, structured output, and skills/plugins.
- **Sibling:** [`claude-sdk/v100/SPEC_PATTERN.md`](../../claude-sdk/v100/SPEC_PATTERN.md) (Messages
  API harness). Pattern IDs are kept aligned so that a pattern means the same thing in both files.
  Where behavior differs, the entry says so.

---

## 0. Capability status tags

Every §4 pattern heading and every §5 row carries one tag. The tags are shared with
[`claude-sdk/v100`](../../claude-sdk/v100/SPEC_PATTERN.md) and
[`github-sdk/v300`](../../github-copilot-sdk/SPEC_PATTERN.md), so a tag means the same contract in
all three files.

| Tag | Definition & governance guarantee |
|---|---|
| **[HARNESS]** | Wrapped by a dedicated harness method, unit-tested against deterministic mocks, and shown in a runnable example. The budget gate, hooks, OTel, and context store all apply. |
| **[PASSTHROUGH]** | Reached through `requestDefaults`, `nativeHooks`, `settingSources`, or other config passthrough, without a dedicated method. Most lifecycle hooks still apply unless a core field is overwritten. Used in more than one place → promote to `[HARNESS]`. |
| **[SDK-NATIVE]** | A raw vendor primitive reached by dropping below the harness (`dispatchQuery()` from `src/runtime.mjs`). Bypasses the budget, hooks, events, usage, OTel, and store; call `harness.tracker.ingestResult(resultMsg)` yourself. |

### 0.2 Cross-SDK tag matrix

The same capability can sit at a different tier in each sibling. Where a cell is not
`[HARNESS]`, `HARNESS_MODULE` portability and governance coverage are reduced for that capability.

| Capability (pattern IDs) | `claude-sdk/v100` | `claude-agent-sdk/v100` | `github-sdk/v300` |
|---|---|---|---|
| Chat, stream, SSE (A1–A3 / P-10–P-21) | `[HARNESS]` | `[HARNESS]` | `[HARNESS]` |
| Prompt + repair structured output, RAG, judge, batch (B1–B4 / P-34–P-37) | `[HARNESS]` | `[HARNESS]` | `[HARNESS]` |
| API-native JSON Schema output (`outputFormat`) | `[HARNESS]` (`structured.native: true` → `output_config.format`) | `[PASSTHROUGH]` (`requestDefaults: { outputFormat }`; `structured.native` only appends a directive) | unsupported (local validator + repair) |
| Built-in workspace tools (C0 / P-33) | unsupported (no local runtime) | `[HARNESS]` (`allowedTools`/`disallowedTools`/`tools`) | `[HARNESS]` (`availableTools`/`excludedTools`) |
| Custom tools, policy veto, HITL, stream + tools (C1–C3 / P-30–P-32, P-22) | `[HARNESS]` | `[HARNESS]` | `[HARNESS]` |
| Policy-gated investigator (C5-B1 / P-25) | `[HARNESS]` | `[HARNESS]` | `[HARNESS]` |
| External MCP servers (C4 / P-33) | `[PASSTHROUGH]` (`betas` + `requestDefaults.mcp_servers`; invisible to hooks) | `[HARNESS]` (`mcpServers` + `autoAllowMcp`; visible to hooks) | `[HARNESS]` (`mcpServers`; visible to hooks) |
| Subagents (C4) | unsupported (multi-harness app code) | `[HARNESS]` (`agents` + `subagent:*` events) | `[PASSTHROUGH]` / `[SDK-NATIVE]` (custom agents via `sessionDefaults`; Fleet via RPC) |
| Local directory plugins (C6) | unsupported | `[HARNESS]` (`plugins` → `options.plugins`) | `[HARNESS]` (`pluginDirectories`, `skillDirectories`, `disabledSkills`) |
| Ambient skills / plugins / CLAUDE.md from disk | unsupported | `[PASSTHROUGH]` (`settingSources`) | `[PASSTHROUGH]` (`sessionDefaults`) |
| Tool-input rewriting via hook | unsupported (redact in handler) | `[PASSTHROUGH]` (`nativeHooks.PreToolUse` → `updatedInput`) | unsupported (redact in handler) |
| Exact token counting (`countTokens`) | `[HARNESS]` (`analyzeRunAccurate()`) | unsupported (heuristic) | unsupported (heuristic) |

**Promotion rule (all three packages).** `[SDK-NATIVE]` is for one-off experiments: pin SDK/CLI
versions and reconcile usage by hand. `[PASSTHROUGH]` is for a single service, and the entry must
say which guarantees it bypasses. Once an escape hatch is used in more than one place, promote it
to `[HARNESS]`, which needs four deliverables: a wrapper in `src/`, a deterministic mock plus unit
tests, a portable `examples/NN-name.mjs` that imports only `./_shared.mjs`, and moving the entry
from §5 into §4 with the `[HARNESS]` tag.

---

## 1. Layer model

There are three layers. Use the harness by default. Drop to `options` passthrough or a raw
`query()` only when a primitive is not wrapped (see [§5](#5-escape-hatch-raw-sdk-primitives)).

```
application ─► ClaudeAgentHarness  (chat · stream · structured · registerTool · preflight · sessions · hooks · events)
                   │  budget gate → beforeRun → _buildOptions() → drain SDKMessage stream → usage/OTel → store → afterRun
                   ▼
               query({ prompt, options })     ← @anthropic-ai/claude-agent-sdk (dispatchQuery in runtime.mjs)
                   │  options.hooks (PreToolUse/PostToolUse/…) and options.canUseTool call back into the harness
                   ▼
               Claude Code CLI subprocess  (agent loop · built-in tools · MCP · subagents · sessions on disk)
                   ▼
               Anthropic API / Bedrock / Vertex
```

The key difference from the Messages API sibling is that **the runtime owns the agent loop**.
`chat()` does not re-call the model on each tool turn. It drains a single `SDKMessage` generator
until the terminal `result` message. Tools, sessions, and permission checks all run inside the
subprocess, and the harness *bridges* to them.

### 1.1 SDK primitive → harness surface

| SDK primitive (research) | Harness surface | Notes |
|---|---|---|
| `query()` | `harness.chat()` / `harness.stream()` → `dispatchQuery()` | Each call is **one** `query()` with **fresh options**. A new runtime session is created unless a resume is pending (D2). |
| Messages (`system`/`assistant`/`stream_event`/`result`) | `harness.on('event', msg)` (raw); the result carries `result` (raw `result` msg) | `system:init` gives the session id. `assistant` gives text and usage. `result` gives authoritative usage, `total_cost_usd`, `num_turns`, and `permission_denials`. |
| Built-in tools (Read/Grep/Bash/Edit/WebSearch…) | config `allowedTools`, `disallowedTools`, `permissionMode`, `cwd` | No harness wrapper is needed, because the runtime runs them. Hooks and `canUseTool` see them (C0). |
| Custom tools `tool()` | `harness.registerTool({ name, description, parameters, handler })` | `parameters` is JSON Schema. It is converted to a zod-like `safeParse` descriptor. |
| In-process MCP `createSdkMcpServer()` | Built automatically as server **`harness`**. Tools are exposed as `mcp__harness__<name>` and auto-added to `allowedTools` | Only one in-process server is supported. More can be added through `mcpServers` with `{ type: 'sdk', … }`. |
| External MCP servers | config `mcpServers` (stdio `command` / `http` / `sse` `url`) + `autoAllowMcp` | Validated in `validateMcpServers()`. |
| Sessions (resume/fork) | `resumeSession(id)`, `forkSession(id)`, `continueFrom(id)` | These are **one-shot**: they apply to the next run only (`test/session.test.mjs:56`). |
| Subagents | config `agents: { name: AgentDefinition }` | Events: `subagent:start`, `subagent:activity`. `usageSummary().subagents` gives tokens per parent tool-use id. |
| Permissions | `permissionMode`, `permissions.deny`, `beforeToolCall` → `canUseTool` + `PreToolUse` | See C2 and caveats 6–8. |
| Hooks | harness hooks bridged to native `options.hooks`; raw matchers through `nativeHooks` | `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `SessionStart`, `SessionEnd`, `Stop`. |
| Structured output (`outputFormat` / `structured_output`) | `harness.structured()` (prompt + validate + repair, or a directive with `structured.native`) | **Not** the SDK's native `outputFormat`. That is only reachable through `requestDefaults` (§5). |
| Plugins (`options.plugins`) | config `plugins` (path or `{ type: 'local', path }`) | Resolved to absolute paths and checked to exist in `validateConfig()`. Event: `plugins:loaded`. See C6. |
| Ambient skills / settings | `settingSources` (default `[]` = load nothing from disk) | Not wrapped. Opting in loads CLAUDE.md, skills, and settings from disk (§5). |
| Token counting | `harness.preflight()` (heuristic) | `analyzeRunAccurate()` is **heuristic-only** here. The Agent SDK has no `countTokens`. |
| V2 session API (`unstable_v2_*`, `session.send/stream`) | **Not used** | The harness uses only `query()` plus `options.resume`, which is the documented path that remains after V2 was removed. |

---

## 2. Base pattern (P0): example scaffolding

Every example uses the same scaffolding. New examples must do the same.

```js
import { createHarness } from './_shared.mjs';
import { parseCommonArgs, requirePrompt, baseConfig, runExample, printResult } from './_shared.mjs';

const args = parseCommonArgs();   // --model --effort --max-turns --permission-mode --base-url --token-budget --budget-warn --budget-enforcement
const prompt = requirePrompt(args, 'node examples/NN-x.mjs "<prompt>"'); // exits 2 BEFORE the harness exists → 0 turns spent
const harness = await createHarness({ config: baseConfig(args, { /* example-specific config */ }) });

await runExample(harness, async () => {   // try/finally + SIGINT/SIGTERM → harness.stop()
  printResult(await harness.chat(prompt));   // prints sessionId + numTurns + content
});
```

Rules:

1. **Import the SDK only through `./_shared.mjs`** ([`examples/_shared.mjs`](examples/_shared.mjs)).
   Setting `HARNESS_MODULE` (`github-sdk/v300` | `claude-sdk/v100` | `claude-agent-sdk/v100`) points
   every example at a different harness without code changes. `resolveAuth` is specific to this
   package and is `undefined` on the other targets.
2. **Never hard-code a fallback prompt.** `requirePrompt()` exits before the harness exists, and
   the harness throws `EmptyPromptError` for empty or whitespace-only input. Examples 03 (`?q=`),
   15 (built-in item list), and 23 (stdin) are the documented exceptions.
3. **Write the model's answer to stdout and diagnostics to stderr.** Events, hooks, and usage lines
   go to `console.error`.
4. **`baseConfig()` defaults:** model `claude-opus-4-8`, effort `low`, `maxTurns` 8, and budget
   `{ maxTokens: 200_000, warnAtPercent: 80, enforcement: 'warn' }`. The example's own
   `tokenBudget` is merged over this default, and CLI flags are merged over that.
5. **Stop every harness you create.** `stop()` fires `onSessionEnd`. Servers (03) and REPLs (23)
   stop on SIGINT or `close`.
6. **The response ceiling is turns, not tokens.** Use `--max-turns` / `maxTurns`. The canonical
   `maxTokens` key is accepted for parity but has no effect.

---

## 3. Configuration pattern

Precedence: **defaults < config file (`configFile`) < env < `config` overrides**
(`loadConfig()`). `validateConfig()` throws `ConfigError` and lists every problem.
See [`harness.config.example.json`](harness.config.example.json).

| Concern | Key(s) (env) | Per-call override (`opts`) |
|---|---|---|
| Model | `model` (`CLAUDE_AGENT_MODEL`, `LLM_SDK_MODEL`) | `opts.model` |
| Effort | `effort` (`low`…`max`); `reasoningEffort` is accepted as an alias (`CLAUDE_AGENT_EFFORT`) | `opts.effort` |
| Agent-loop cap | `maxTurns` (10; examples use 8) | `opts.maxTurns` |
| Permission mode | `permissionMode`: `default \| acceptEdits \| plan \| bypassPermissions` (`CLAUDE_AGENT_PERMISSION_MODE`) | `opts.permissionMode` |
| Built-in tool gating | `allowedTools`, `disallowedTools` | — |
| Tool policy | `permissions.deny` (exact names or `prefix*`); `permissions.allow` is validated but **unused** | — |
| MCP | `mcpServers`, `autoAllowMcp` | — |
| Subagents | `agents` (`description`, `prompt` required; `tools`, `model`, `effort`, `permissionMode`, `maxTurns`) | — |
| System prompt | `systemPrompt` (takes precedence) or `systemPromptFile`; `systemPromptMode` `append` (default) \| `replace`; `systemPromptPreset` (`claude_code`) | `opts.systemPrompt` (raw SDK value) |
| Working dir / env | `cwd`, `env` (subprocess env), `settingSources` (`[]`) | — |
| Executable | `pathToClaudeCodeExecutable` (`CLAUDE_AGENT_EXECUTABLE`) | — |
| Native hooks | `nativeHooks: { PreToolUse: [matcher…] }`, `hookTimeoutMs` | — |
| Budget | `tokenBudget { maxTokens, warnAtPercent, enforcement }` (`CLAUDE_AGENT_TOKEN_BUDGET`) | — |
| Store | `contextStore { enabled, directory }` (`CLAUDE_AGENT_STORE_DIR`) | — |
| OTel | `observability { enabled, serviceName, otlpEndpoint, captureContent }` (`OTEL_EXPORTER_OTLP_ENDPOINT`) | — |
| Structured | `structured { maxRepairAttempts: 2, native: false }` | — |
| Any other `Options` field | `requestDefaults` (spread over the built options; see §5 for which fields win) | — |
| Cancellation | — | `opts.abortController` |

Auth is **not** a config key. `resolveAuth()` requires `ANTHROPIC_API_KEY`,
`CLAUDE_CODE_USE_BEDROCK`, or `CLAUDE_CODE_USE_VERTEX` in the environment and throws before
spawning otherwise.

**Pattern:** keep model and behavior settings in config, and use `opts` for deliberate per-call
deviations (`chat(p, { model, effort, maxTurns, permissionMode })`). Prefer per-call `opts` to
changing `harness.config` at runtime.

---

## 4. Pattern catalog

Each pattern lists its **intent**, **recipe**, **composes with**, **does not compose with**, and
**examples**. Pattern IDs are stable; cite them in reviews.

### A. Core I/O

#### A1 · Buffered chat (one agent run) **[HARNESS]**
- **Intent:** a single task. This can be a one-shot answer or a multi-step agent run that uses
  tools.
- **Recipe:** `const { content, usage, sessionId, costUsd, numTurns, result } = await harness.chat(prompt, opts)`.
- **Result shape:** `content` is the text of the **last** assistant message that contained text.
  `usage` is `{inputTokens, outputTokens, totalTokens, cacheReadTokens, cacheWriteTokens, durationMs}`
  from `result.usage`. `costUsd` is `result.total_cost_usd` (a client-side estimate, not billing).
  `numTurns` is the number of agent turns. `result` is the raw `result` SDKMessage.
- **Failure:** a `result.subtype` other than `success` (for example `error_max_turns`) **throws**
  `Run did not succeed (subtype: …)`. `onError` and `error:run` fire.
- **Composes with:** everything.
- **Examples:** 01, 24.

#### A2 · Streaming **[HARNESS]**
- **Intent:** show output as it is generated.
- **Recipe:**
  ```js
  for await (const item of harness.stream(prompt, opts)) {
    if (item.type === 'delta') process.stdout.write(item.content);
    else if (item.type === 'done') /* item.content, item.usage, item.sessionId */;
  }
  ```
- **Behavior:** sets `includePartialMessages: true` and maps `content_block_delta` → `text_delta`
  events to `{type:'delta'}`. Thinking deltas are dropped. The full `assistant` message fills in
  any trailing text that was not streamed. One `{type:'done'}` is yielded at the end.
- **Difference from the sibling:** the runtime still runs the **full agent loop**, so tools *do*
  execute during `stream()` (see C3).
- **Composes with:** A1 (resume between them), C1, C3, D1–D3, E*, F1–F2.
- **Does not compose with:** B1 (no streamed structured output).
- **Examples:** 02, 16.

#### A3 · SSE relay over HTTP **[HARNESS]**
- **Intent:** stream to a browser or other client using Server-Sent Events.
- **Recipe:** `res.write(formatSSE(item))` for each `stream()` item. The event name comes from
  `item.type` (`delta` / `done` / `error`). Catch errors and write
  `formatSSE({ type: 'error', error })`, then call `res.end()` in `finally`.
- **Hardening:** create an `AbortController` per request, pass it as
  `stream(q, { abortController })`, and call `abort()` on `req.on('close')` so a disconnected client
  stops the subprocess. Example 03 does not do this.
- **Concurrency:** each request is a separate runtime session, so conversations do **not**
  interleave as they do in the sibling. The harness-level `sessionId`, usage tracker, and budget
  are still shared, so `harness.sessionId` is "whichever finished last". Create a harness per
  tenant if per-tenant accounting matters.
- **Examples:** 03.

### B. Structured data

#### B1 · Schema-validated output **[HARNESS]**
- **Intent:** a response that software consumes.
- **Recipe:** `const { value, content, attempts, usage } = await harness.structured(task, SCHEMA, { input, inputLabel, ...chatOpts })`.
- **Modes:**
  - *Default (prompt + repair):* embeds the schema, extracts JSON from fences or prose, and
    validates it locally. On failure it calls `chat(buildRepairPrompt(...))`. Total attempts are
    `1 + structured.maxRepairAttempts`. Throws `StructuredOutputError { errors, attempts }`.
    Each repair attempt **resumes the failed attempt's session**, so the model still sees the
    task, the input, and its own invalid output (caveat 3, resolved).
  - *Native* (`structured.native: true`): one `chat()` with a strict-output directive appended to
    the system prompt (`{ type:'preset', preset:'default', append }`). The result is validated
    locally and is never repaired. This is **not** the SDK's `outputFormat`; for that, see §5.
- **Schema subset validated locally:** `type`, `properties`, `required`, `items`, `enum`, `const`,
  `nullable`, `additionalProperties:false`, `min*/max*`, and `pattern`. Keep schemas within this
  subset.
- **Events:** `structured:invalid { attempt, errors }` and `structured:ok { attempts }`.
- **Composes with:** C0/C1 (structured runs through `chat()`, so the agent can use tools before
  answering), D1, E*, F*.
- **Examples:** 04.

#### B2 · RAG grounding **[HARNESS]**
- **Intent:** answer only from retrieved passages.
- **Recipe (as in example 13):** put the passages and an "answer ONLY from these" rule into
  `systemPrompt` with `systemPromptMode: 'append'`, then call `chat(question)`.
- **Hardening:** use B1 with `input: passages` and a schema that requires
  `citations: string[]` (`minItems: 1`). Then check that each citation is one of the supplied
  ids, because the schema cannot enforce that. Restrict built-in tools (`disallowedTools` or a
  `Read`-only allowlist) so the agent cannot ground itself in the filesystem or web instead.
- **Examples:** 13 *(demo-grade: requires a live runtime)*.

#### B3 · LLM-as-judge **[HARNESS]**
- **Intent:** grade a candidate answer against a rubric.
- **Recipe:** B1 with `input: { candidate }` and a rubric schema (`accuracy`/`clarity` integers
  1–5, `verdict` enum, `rationale`). Use a higher `effort` (`high`) for the judge.
- **Hardening:** compute `verdict` from the scores in code rather than trusting the model's value.
  Use a separate harness for the judge so its usage is reported apart from the system under test.
- **Examples:** 14 *(demo-grade)*.

#### B4 · Batch classification **[HARNESS]**
- **Intent:** label many inputs with an enum schema.
- **Recipe:** loop B1 over the inputs on one harness. Each item is automatically an
  **independent** session; no `createSession()` is needed (and none exists).
- **Caveat:** `usageSummary().tokens` holds only the **last** run (caveat 1). Sum
  `result.usage` from each item yourself, or use `usageSummary().cost` (cumulative).
- **Examples:** 15.

### C. Tools

#### C0 · Built-in tools (agentic file/shell/web work) **[HARNESS]**
- **Intent:** let the agent investigate or change a workspace: read and search a repo, run
  tests, edit files, or search the web.
- **Recipe:**
  ```js
  createHarness({ config: {
    cwd: '/path/to/repo',
    allowedTools: ['Read', 'Glob', 'Grep'],        // pre-approved (no permission prompt)
    disallowedTools: ['Bash', 'Write', 'Edit'],    // hard-removed
    // or restrict availability outright (Pattern A, least privilege):
    // tools: ['Read', 'Glob', 'Grep'],             // only these built-ins exist
    permissionMode: 'default',                     // or 'plan' (read-only), 'acceptEdits'
    maxTurns: 20,
  }});
  ```
- **Gating:** tools in `allowedTools` run without `canUseTool`. Other tools go through
  `canUseTool` (`permissions.deny`, then `beforeToolCall`). `PreToolUse` → `beforeToolCall` fires
  for **every** tool, including pre-approved and MCP tools.
- **Research note:** the SDK's `tools` option (restricts which built-ins *exist*) is not mapped.
  Pass it through `requestDefaults: { tools: [...] }` and check that the installed SDK version
  supports it.
- **Examples:** none dedicated. 17 and 22 gate built-ins.

#### C1 · Custom tools (in-process SDK MCP) **[HARNESS]**
- **Intent:** let the model call application functions.
- **Recipe:**
  ```js
  harness.registerTool({ name, description, parameters /* JSON Schema */, handler: async (args, { sessionId, toolUseId }) => result });
  const { content } = await harness.chat(prompt);
  ```
- **Wiring:** every registered tool joins one in-process server named `harness`. The model sees
  `mcp__harness__<name>`, which is auto-added to `allowedTools`. Register tools **before** the run;
  the options are rebuilt on every call.
- **Handler contract:** return a string. Objects are JSON-stringified, and `{ textResultForLlm }`
  is honored. When a handler throws, the result is `isError: true` (the run continues), and
  `tool:error` and `onToolFailure` fire.
- **Lifecycle:** `PreToolUse` → `beforeToolCall` (may deny) → `tool:call` → handler →
  `PostToolUse` → `tool:result` + `afterToolCall` | `tool:error` + `onToolFailure`.
  The native bridge owns every event, hook, and stat for a call, keyed by `toolUseId`, so each
  fires **once per call**. Events carry the bare name in `tool` and the runtime name in
  `qualifiedName`; usage stats are keyed by the bare name (caveat 7, resolved). A handler invoked
  outside the bridge (a direct call in a test) accounts for itself.
- **Composes with:** A1, A2 (tools run while streaming), B1, C2, D*, E*, F*.
- **Examples:** 05, 16, 18.

#### C2 · Human-in-the-loop / tool policy **[HARNESS]**
- **Intent:** require approval before side-effecting tools run.
- **Recipe:** a `beforeToolCall` hook that returns `{ deny: true, reason }` to block. A denial in
  `PreToolUse` becomes `permissionDecision: 'deny'`, and the model sees the reason and can adapt.
  `tool:denied` fires, and the runtime lists the denial in `result.permission_denials`.
- **Qualified vs bare names:** `toolName` is what the runtime reports, such as
  `mcp__harness__get_weather`, `Bash`, or `mcp__fs__read`. The payload also carries
  `bareToolName` (`normalizeToolName(toolName)`, e.g. `get_weather`) and `toolUseId`, so a policy
  can match bare names portably across all three harnesses (caveat 8, resolved).
- **Static policy:** `permissions.deny: ['Bash', 'mcp__fs__*']` is enforced only through
  `canUseTool`, which **does not run for pre-approved tools** or in `bypassPermissions`. For a
  hard block, use `disallowedTools`.
- **Once per call:** for tools that are not pre-approved, both `PreToolUse` and `canUseTool`
  fire. The harness caches the `beforeToolCall` verdict per run by `toolUseId`, so the hook (and
  an interactive operator prompt) runs **once**.
- **Examples:** 17, 09, 25.

#### C3 · Streaming + tools **[HARNESS]**
- **Intent:** use tools and still show a streamed answer.
- **Recipe:** register the tools and call `stream()`. Text deltas from **every** assistant turn
  (before and after tool calls) are concatenated into one `delta` sequence. `done.content` is
  only the last assistant text.
- **Hardening:** listen to `tool:call` to print turn separators (example 16 does this). If you
  need only the final answer streamed, use the sibling's split: `chat()` for the tool work, then
  `resumeSession(id)` + `stream()`.
- **Examples:** 16.

#### C4 · External MCP servers + subagents **[HARNESS]**
- **Intent:** connect external tools/data and delegate focused work to specialist agents.
- **Recipe:**
  ```js
  config: {
    mcpServers: { fs: { command: 'my-mcp-fs', args: ['--stdio'] }, docs: { type: 'http', url } },
    autoAllowMcp: true,     // adds mcp__fs__*, mcp__docs__* to allowedTools
    agents: { researcher: { description, prompt, tools: ['Read', 'Grep', 'mcp__fs__*'], model, effort, maxTurns } },
  }
  ```
- **Observing:** `subagent:start { parentToolUseId }` and `subagent:activity` (emitted only from
  `chat()`, not `stream()`). `usageSummary().subagents[parentToolUseId]` gives
  `{inputTokens, outputTokens, turns, messages}`.
- **Difference from the sibling:** MCP tools run in the runtime, and hooks **do** see them
  (`PreToolUse` fires), so C2 gates them too.
- **Examples:** 22 *(demo-grade; needs the MCP binary on PATH)*.

#### C5-B1 · Policy-gated investigator (verified structured synthesis) **[HARNESS]**
- **Intent:** an agent investigates through approved read-only tools, side-effecting tools are
  denied by policy, and the final report is schema-validated and then verified in code before
  anything downstream trusts it.
- **Recipe:** `requirePrompt()` before `createHarness()`; redact the prompt in app code; a
  `beforeRun` hook that throws on residual secrets; `beforeToolCall` that matches
  `normalizeToolName(toolName)` against an allowlist and returns `{ deny, reason }` for everything
  else; tool handlers that redact their own output; `structured(task, SCHEMA, { input })`; then a
  deterministic check that every citation id exists and that derived fields are recomputed.
- **Guarantees:** the denied tool's handler never runs; the policy hook runs once per
  `toolUseId`; the model never sees raw PII from a tool; a hallucinated citation fails the run
  (exit 1) before any report reaches stdout; stdout carries only the verified JSON.
- **Composes with:** C1, C2, E3, B1, B2, B3, E4, F2.
- **Does not compose with:** `bypassPermissions` + `nativeHooks` that skip the bridge (the policy
  would not run).
- **Portability:** the example file is byte-identical in all three packages and runs under any
  `HARNESS_MODULE` target.
- **Examples:** 25.

#### C6 · Local directory plugins (+ built-in scoping) **[HARNESS]**
- **Intent:** ship skills, subagents, hooks, and bundled MCP servers inside the application repo
  and inject them per session, without touching the host's user-level Claude config.
- **Recipe:**
  ```js
  config: {
    plugins: ['./plugins/repo-auditor'],          // or { type: 'local', path, skipMcpDiscovery: true }
    tools: ['Read', 'Glob', 'Grep', 'Skill'],      // Pattern A: no Bash/Write/Edit at all
  }
  harness.on('plugins:loaded', ({ plugins, skills, errors }) => …);
  ```
- **Layout:** `<plugin>/.claude-plugin/plugin.json`, `skills/<name>/SKILL.md`, `agents/<name>.md`,
  optional `.mcp.json`. See `examples/plugins/repo-auditor`.
- **Guarantees:** paths are resolved to absolute before reaching the subprocess, so a different
  `cwd` does not break discovery; a missing directory or a non-`local` type is a `ConfigError`, not
  a silent skip. `settingSources` stays `[]`, so plugins enabled in user/project settings files do
  not load alongside.
- **Not isolated in CLI-login mode (the default):** the installed `claude` binary also loads the
  logged-in account's built-in and synced plugins and skills, and neither `settingSources: []` nor
  `--safe-mode` switches them off (`--safe-mode` drops the configured plugin and MCP servers
  instead). The SDK-bundled `cli.js` loads only the configured plugins, even with the same login.
  For a strictly isolated set, set `CLAUDE_AGENT_USE_CLI_LOGIN=0` with an API key, or pin
  `CLAUDE_AGENT_EXECUTABLE` to the bundled `cli.js`.
- **Diagnostics:** `plugins:loaded` carries the init message's `plugins`, `skills`, and
  `plugin_errors` (a malformed `SKILL.md` or manifest shows up there, not as an exception), plus
  `ambient`: loaded plugins whose path is not in `config.plugins`.
- **Version:** `options.plugins` and `options.tools` need an SDK release that has them; see the
  §5 version check.
- **Examples:** 26 *(demo-grade)*.

### D. Context & sessions

#### D1 · System prompt / instruction document **[HARNESS]**
- **Intent:** set the agent's behavior.
- **Recipe:** `systemPrompt: '...'` inline, or `systemPromptFile: 'path.md'` (inline takes
  precedence).
  - `append` (default) → `{ type:'preset', preset: systemPromptPreset ('claude_code'), append: text }`.
    Claude Code's own system prompt, tool instructions included, is kept, and your text is layered on top.
  - `replace` → your raw string becomes the **entire** system prompt. Built-in tool guidance is
    lost, so use this only for tool-free tasks.
  - No text configured → the option is omitted and the SDK default applies.
- **Per call:** `opts.systemPrompt` is passed **raw**: a string means replace, and a preset
  object means append.
- **`settingSources: []`** (the default) means no CLAUDE.md, skills, or settings are loaded from disk.
  Results do not depend on the machine they run on.
- **Examples:** 10, 13.

#### D2 · Multi-turn **[HARNESS]**
- **Default: every call is a new session.** Consecutive `chat()`/`stream()` calls do **not**
  share context. `harness.sessionId` tracks the most recent session.
- **Continue a conversation:** call `harness.resumeSession(prev.sessionId)` **before each**
  follow-up call. It applies only to the next run.
  ```js
  const first = await harness.chat(q1);
  harness.resumeSession(first.sessionId);
  const second = await harness.chat(q2);
  ```
- **Branch:** `harness.forkSession(id)` sends `resume` + `forkSession: true`. The fork gets a new
  session id, and the source session is unchanged.
- **Seed history:** `harness.attachContext([{role, content}, ...])` sends the turns as a
  **streaming-input iterable** of `type:'user'` messages before the prompt. `preflight()` counts
  them. Prefer resume. If you must seed, put the history inline instead:
  `chat(renderContextPreamble(msgs) + prompt)` (caveat 5).
- **Examples:** 11, 12, 23.

#### D3 · Persistence + resume across processes **[HARNESS]**
- **Intent:** keep a conversation across process restarts.
- **Two mechanisms:**
  1. **Native resume (preferred):** save `sessionId`. Later, in any process, call
     `resumeSession(id)` (or `continueFrom(id, { resume: true })`). The runtime keeps the full
     session (tool calls included) on disk.
  2. **Harness store (fallback):** `contextStore: { enabled: true, directory }` appends each
     exchange to `<dir>/<sessionId>.jsonl` plus `.meta.json`. Calling `continueFrom(id)` when the
     store has records **replays** them through `attachContext()` and emits `session:replayed`.
     This works even when the runtime session is gone.
- **Store contents:** the store keeps **text only** (prompt and final answer). Tool turns and
  thinking are lost on replay. Records are keyed by the session id of the run, so without
  resume each `chat()` writes to a **different** file.
- **Lookup:** `harness.store.latestSessionId()`, `.list()`, `.load(id)`, `.remove(id)`.
- **Examples:** 07, 12.

#### D4 · Interactive REPL **[HARNESS]**
- **Recipe:** a `readline` loop. Before each line, call `if (harness.sessionId) harness.resumeSession(harness.sessionId)`,
  then call `chat(text)`. Catch errors per turn, and call `harness.stop()` on `close`.
- **Examples:** 23.

### E. Governance & cost

#### E1 · Preflight analysis **[HARNESS]**
- **Recipe:** `harness.preflight(prompt, { expectedOutputTokens, context, attachments })`
  returns `{ breakdown, estimatedTotalTokens, budget, fitsWithinBudget, recommendation }` and
  emits `preflight`. It is a heuristic and sends nothing.
- **Limits:** it counts the prompt, the system-prompt **text you configured**, attached
  context, and attachments. It does **not** count the Claude Code preset system prompt, tool
  definitions, file reads, or the extra turns of an agent loop. Real spend for an agent run can
  be many times the estimate. `chat()` also runs `preflight()` itself, so the event fires twice
  if you call it first.
- **Examples:** 06, 06a, 06b.

#### E2 · Budget enforcement **[HARNESS]**
- **Recipe:** `tokenBudget: { maxTokens, warnAtPercent, enforcement }`.
  - `block`: when the **estimate** would exceed the budget, the run is stopped before dispatch
    (`TokenBudgetExceededError`), and `onBudgetExceeded` and `budget:exceeded` fire.
  - `warn`: the run proceeds and `budget:exceeded` is emitted.
- **After the run:** actual spend is reconciled, and `budget:warn` (once) or `budget:exceeded`
  fires along with the matching hook.
- **Reconciliation:** each run's authoritative `result.usage` total is recorded once, so the
  budget is accurate across runs of any size (caveat 1, resolved). Budget enforcement is still
  token-based, not a cost ceiling: for a hard per-run ceiling use `maxTurns`; for cost, read
  `cost` from E4.
- **Examples:** 06, 06a, 06b, 20.

#### E3 · Pre-send redaction / policy veto **[HARNESS] · `updatedInput` rewrite [PASSTHROUGH]**
- **Prompt:** redact in application code **before** `chat()`. Use `beforeRun` (it receives the
  prompt and `analysis`) as a check that **throws to abort**. Hooks cannot rewrite the prompt.
- **Tool input:** mutating `args` inside `beforeToolCall` does **not** reliably change what the
  tool receives (caveat 9). Redact inside the tool **handler**, or register a raw `PreToolUse`
  matcher through `nativeHooks` that returns
  `hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput }` (verify support in the
  installed SDK).
- **Examples:** 09 (observe), 18 (tool-input redaction; see caveat 9).

#### E4 · Usage & cost reporting **[HARNESS]**
- **Recipe:** `harness.usageSummary()` returns `tokens{input,output,total,cacheRead,cacheWrite,reasoning}`,
  `apiCalls`, `cost`, `numTurns`, `models`, `tools{calls,succeeded,failed,denied,avgDurationMs}`,
  `subagents`, `errors`, `latency{ttftMs,callDurationMs}`, `contextWindow`, and `budget`.
  `usageReport()` returns the same as readable text.
- **What is cumulative:** `tokens` (lifetime totals across runs), `cost` (the sum of
  `total_cost_usd`, an **estimate, not billing**), `apiCalls`, `models`, `tools`, `subagents`, and
  `errors`. `lastRunTokens` holds the most recent run's breakdown, and `numTurns` the most recent
  run's turn count. `chat()`/`stream()` results report per-run `usage`.
- **Examples:** 21, 01, 17, 20, 25.

### F. Operations

#### F1 · Events & hooks **[HARNESS]**
- **Events** (fire-and-forget; `harness.on`): `started`, `stopped`, `event` (every raw
  SDKMessage), `session:created`, `session:resumed {mode: resume|continue|fork}`,
  `session:replayed`, `run:start`, `run:end`, `message`, `delta`, `preflight`, `budget:warn`,
  `budget:exceeded`, `tool:call`, `tool:result`, `tool:error`, `tool:denied`, `usage:tokens`,
  `subagent:start`, `subagent:activity`, `structured:ok`, `structured:invalid`, `error:run`.
  (There is no `tool:start`, unlike the sibling.)
- **Hooks** (awaited in registration order; pass them in `createHarness({ hooks })` or call
  `harness.hooks.register(name, fn)`, which returns an unsubscribe function):
  `beforeRun` (throw to abort), `afterRun`, `beforeToolCall` (return `{deny, reason}`),
  `afterToolCall`, `onToolFailure`, `onPromptSubmit`, `onSessionStart`, `onSessionEnd`, `onError`,
  `onBudgetWarning`, `onBudgetExceeded`. Errors thrown in `on*`/`after*` hooks are swallowed.
  Errors thrown in `before*` hooks propagate. Tool hooks receive
  `{ toolName, bareToolName, args, sessionId, toolUseId }` (`toolUseID` is kept as a legacy alias).
- **Native bridge:** `PreToolUse` → `beforeToolCall`, `PostToolUse` → `afterToolCall`/`onToolFailure`,
  `UserPromptSubmit` → `onPromptSubmit`, `SessionStart`/`SessionEnd` → `onSessionStart`/`onSessionEnd`.
  Additional raw matchers in `nativeHooks` are appended after the bridge, so both fire.
- **Rule:** use **hooks to intercept or veto** and **events to observe**. Never put enforcement
  logic in an event listener.
- **Examples:** 09, 05, 17.

#### F2 · OpenTelemetry golden signals **[HARNESS]**
- **Recipe:** `observability: { enabled: true, serviceName, otlpEndpoint, captureContent: false }`.
  When `@opentelemetry/api` is absent (it is an optional peer dependency), this does nothing.
- **Signals:** `claude_agent_harness.requests`, `.tokens`, `.errors`, `.request.duration_ms`,
  `.request.ttft_ms`, `.tool.calls`, `.tool.duration_ms`, `.budget.utilization`,
  `.context_window.utilization`.
- **Spans (OTel GenAI semantic conventions v1.42+):** `chat()`, `stream()`, and `structured()`
  open a root `invoke_agent {agentName}` span (CLIENT; `gen_ai.operation.name`,
  `gen_ai.provider.name` = `anthropic` | `aws.bedrock` | `gcp.vertex_ai`, `gen_ai.agent.name` =
  `config.agentName ?? 'harness'`, `gen_ai.conversation.id`, `gen_ai.request.model`,
  `gen_ai.usage.input_tokens`/`output_tokens`). A nested `structured → chat` shares the root. Each
  run adds a `chat {model}` child (`gen_ai.response.model`, usage, and
  `gen_ai.response.time_to_first_chunk` in seconds for streams). Each `PreToolUse`/`PostToolUse`
  pair adds `execute_tool {bareToolName}` (INTERNAL; `gen_ai.tool.name`, `gen_ai.tool.call.id`,
  `gen_ai.tool.type` = `custom` | `builtin` | `mcp`). The `claude_agent_harness.*` metrics are kept
  for backward compatibility. `stream()` TTFT is a duration (caveat 10, resolved).
- **Content capture:** `captureContent` defaults to `false`. Prompts, completions, and tool
  arguments are never written to span attributes. With `captureContent: true`, the `chat` span
  gets a `gen_ai.client.inference.operation.details` event carrying `gen_ai.input.messages` and
  `gen_ai.output.messages`.
- **Rule:** keep `captureContent: false` in production.
- **Examples:** 08.

#### F3 · Resilience: retry, backoff, fallback **[HARNESS composition]**
- **Recipe:** retry `chat()` with exponential backoff, and switch to a fallback model on the last
  attempt through `chat(p, { model: fallback })`.
- **Simpler than the sibling:** each attempt is a new session, so a failed attempt leaves no
  duplicate message in the next one.
- **Hardening:** do not retry errors that cannot succeed on retry: `TokenBudgetExceededError`,
  `EmptyPromptError`, `ConfigError`, a missing executable or auth, and a `beforeRun` veto. An
  `error_max_turns` result means "raise `maxTurns`", not "retry".
- **Examples:** 19.

#### F4 · Enterprise endpoint / headless auth / executable pinning **[HARNESS] · `--base-url` env [PASSTHROUGH]**
- **Auth:** `ANTHROPIC_API_KEY` → `api-key`, `CLAUDE_CODE_USE_BEDROCK=1` → `bedrock`,
  `CLAUDE_CODE_USE_VERTEX=1` → `vertex`. `resolveAuth(env, { required: false })` checks which
  one applies without throwing. Never hard-code credentials.
- **Endpoint:** `--base-url` → `requestDefaults.env = { ...process.env, ANTHROPIC_BASE_URL }`, so
  `PATH` and `ANTHROPIC_API_KEY` survive (caveat 11, resolved).
- **Executable:** resolution order is `pathToClaudeCodeExecutable` → `CLAUDE_AGENT_EXECUTABLE` →
  the CLI bundled in the SDK package → `claude` on `PATH`. Explicit paths must point to existing
  files.
- **Examples:** 24.

---

## 5. Escape hatch: raw SDK primitives

There is no `harness.client`. Primitives the harness does not wrap are reached in three ways.
Each one bypasses part of the harness, so account for that.

| Need | Tag | Mechanism | What it bypasses |
|---|---|---|---|
| Native structured output (`outputFormat: { type:'json_schema', schema }`) | `[PASSTHROUGH]` | A dedicated harness with `requestDefaults: { outputFormat }`. Read `(await h.chat(p)).result.structured_output`. | Nothing in the harness, but it applies to **every** call on that harness. A validation failure surfaces as a non-`success` subtype, which `chat()` throws. |
| Skills / plugins / CLAUDE.md | `[PASSTHROUGH]` | `settingSources: ['project']` (or `'user'`, `'local'`) | Reproducibility: behavior then depends on files on disk. |
| Raw native hooks (`updatedInput`, other events) | `[PASSTHROUGH]` | `nativeHooks: { PreToolUse: [{ matcher, hooks: [fn] }] }` | Harness hook semantics (these are not awaited through `HookManager`). |
| Raw SDKMessage stream (init, tool_use blocks, compaction, …) | `[HARNESS]` (observe only) | `harness.on('event', msg => …)` | — (observe only) |
| Fully custom run | `[SDK-NATIVE]` | `import { dispatchQuery } from '…/runtime'` → `for await (const m of dispatchQuery({ prompt, options }))` | **Everything**: the budget, hooks, events, usage, OTel, and store. Call `harness.tracker.ingestResult(resultMsg)` yourself if needed. |

**What `requestDefaults` cannot override:** `buildQueryOptions()` spreads `requestDefaults`
last, but `_buildOptions()` then sets `maxTurns`, `canUseTool`, `hooks`, and `abortController`
unconditionally. It also sets `mcpServers`, `allowedTools`, `disallowedTools`, and `agents` when
they are non-empty, and `resume` when one is pending. Use the dedicated config keys for those
fields.

**Version check:** `package.json` pins `^0.1.0`, and the caret on a 0.x version pins the
minor version, so this resolves to 0.1.x. The research describes later SDK releases
(`outputFormat`, `tools`, and the V2 removal in 0.3.142). Confirm that any passthrough field
exists in the installed version before relying on it.

Rule: if you use an escape hatch in more than one place, wrap it in a harness method, so it gets
the budget gate, hooks, and usage tracking.

---

## 6. Compatibility matrix

✅ composes · ⚠️ composes with a caveat · ❌ not supported

|            | A1 chat | A2 stream | B1 structured | C1 tools | D2 resume | D3 persist | E2 budget | F1 hooks |
|------------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **A2 stream**     | ✅ | — | ❌ | ✅ (deltas concatenate) | ✅ | ✅ | ✅ | ✅ (no `subagent:*`) |
| **B1 structured** | ✅ | ❌ | — | ✅ | ✅ repair resumes | ✅ | ✅ | ✅ |
| **C1 tools**      | ✅ | ✅ | ✅ | — | ✅ | ⚠️ text only | ⚠️ preflight blind to tool I/O | ✅ once per `toolUseId` |
| **C0 built-ins**  | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ text only | ⚠️ preflight blind to tool I/O | ✅ |
| **C4 MCP/subagents** | ✅ | ⚠️ no subagent events | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ hooks see MCP tools |
| **D3 persist**    | ✅ | ✅ | ✅ | ⚠️ | ✅ (resume preferred) | — | ✅ | ✅ |
| **A3 SSE**        | — | ✅ | ❌ | ✅ | ⚠️ shared `sessionId` | ✅ | ⚠️ shared | ✅ |
| **Native structured** | ✅ | ❌ | (mode of B1) | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 7. Caveats & known gaps

These are verified by reading the source. Fix them in `src/` and update this list, rather than
working around them silently in examples. Entries marked **Resolved** are kept for traceability;
each names the fix and its regression test (`test/caveat-fixes.test.mjs`,
`test/caveats-remediation.test.mjs`, `test/spec25-investigator.test.mjs`).

1. **Resolved — token totals are cumulative.** `UsageTracker.ingestResult()` now adds each run's
   `result.usage` to lifetime `tokens` (and keeps the run in `lastRunTokens`), and
   `_reconcileBudget(runTotal)` records exactly that run's total. *Previously:* **Token totals were not cumulative.** `UsageTracker.ingestResult()` *replaces* `tokens` with
   the last `result.usage` (`src/usage.mjs:119-130`). `_reconcileBudget()` records
   `max(0, total − lastReconciled)` (`src/harness.mjs:588-593`), so when a run is smaller than
   the previous one, its spend is dropped. Effect: `usageSummary().tokens` shows only the last
   run (example 21's "total tokens" is wrong after 3 runs), and the budget undercounts.
   `cost`, `apiCalls`, and `models` *are* cumulative.
2. **Resolved (example 07) — by design, every `chat()`/`stream()` starts a new session** unless
   `resumeSession`/`forkSession`/`continueFrom` is called right before it (one-shot). Example 07
   now calls `harness.resumeSession(harness.sessionId)` before its follow-up, so "Now summarize
   that…" has context and both exchanges land in one store file. *Previously:* example 07 sent
   the follow-up **without context** into a second session.
3. **Resolved — structured repair resumes the failed attempt's session** (`resumeSession(lastSessionId)`
   before each repair `chat()`). *Previously:* **The structured repair loop lost context.** Repair attempts call `chat()` without resume,
   so the model receives "Your previous response was not valid…" in a new session that has no
   task, no input, and no previous output (`src/harness.mjs:901-916`). Fix: resume the attempt's
   `sessionId` before repairing, or resend `basePrompt` with the errors.
4. **Resolved — native structured uses `systemPromptPreset`** (default `claude_code`), like every
   other path. *Previously:* it hard-coded `preset: 'default'`.
5. **Resolved — `attachContext()` renders a `<conversation-context>` preamble** into the prompt
   string via `renderContextPreamble()` (the same format as `claude-sdk`). Role structure is
   flattened into one user message; prefer native resume when the runtime session still exists.
   *Previously:* history went out as separate streaming-input messages, with assistant turns
   wrapped as `type:'user'`, which the runtime could treat as extra turns.
6. **Resolved (deny) — `permissions.deny` is evaluated in `PreToolUse`**, before
   `beforeToolCall`. It matches the qualified or the bare name (exact or `prefix*`), so it also
   covers `allowedTools`, `mcp__harness__*`, and `autoAllowMcp` tools that skip `canUseTool`.
   The verdict is cached per `toolUseId`, so `canUseTool` neither re-runs it nor emits a second
   `tool:denied`. *Still open:* **`permissions.allow` is unused.** *Previously:* `deny` was
   checked only in `canUseTool`.
7. **Resolved — tool events, hooks, and stats fire once per `toolUseId`.** The native bridge owns
   them; `_wrapHandler` only runs the handler when the bridge opened the call; `canUseTool` reuses
   the `PreToolUse` verdict. *Previously:* **Custom-tool events and stats were doubled.** `PreToolUse` emits `tool:call` with
   `mcp__harness__x`, and `_wrapHandler` emits `tool:call` with `x`. Tool stats are recorded
   under both names (`src/harness.mjs:325-330, 422, 451-455`). `beforeToolCall` can also run
   twice for tools that are not pre-approved (PreToolUse, then canUseTool).
8. **Resolved — hooks receive `bareToolName`, and example 17 uses it.** Example 17 registers
   `get_weather`/`get_time` and matches `bareToolName ?? toolName.replace(/^mcp__[^_]+__/, '')`,
   so its allowlist works on every harness. *Previously:* **tool names in hooks were fully
   qualified only**, and example 17 registered no tools, so it denied **every** tool.
9. **Resolved — `beforeToolCall` can rewrite tool input.** Hooks receive a clone of the input.
   An in-place mutation, or a returned `{ updatedInput }`, becomes the call's sanitized input:
   `PreToolUse` returns it as `hookSpecificOutput.updatedInput` (with `permissionDecision:
   'allow'`, since the harness policy has already run), `canUseTool` returns it, and the harness
   tool wrapper hands it to the handler even if the runtime forwards the original. Example 18
   redacts the prompt before `chat()` and again inside the handler, and uses `beforeRun` /
   `beforeToolCall` as veto gates. *Previously:* in-place mutation did not reach pre-approved
   harness tools, so example 18 could store unredacted text. **Verified live** (SDK 0.1.77,
   `.ci/integration/tool-rewrite.test.mjs`): the runtime applies `updatedInput` to built-in
   tools too (a rewritten Bash command is what runs).
10. **Resolved — `chat()`/`stream()` parity.** Both record TTFT as a duration (first
    assistant/partial message, or first text delta, minus start) and emit gen_ai spans (F2).
    `stream()` throws on a non-`success` result subtype (with `error:run` / `onError`), emits
    `message` and `subagent:*` through the same dispatcher as `chat()`, and returns `done.usage`
    with `cacheReadTokens`/`cacheWriteTokens` plus `done.costUsd`/`done.numTurns`.
    *Previously:* TTFT was an epoch timestamp, `chat()` recorded none, and `stream()` lacked these.
11. **Resolved — `--base-url` merges into `process.env`.** *Previously:* **`--base-url` set
    `options.env = { ANTHROPIC_BASE_URL }`** (`examples/_shared.mjs`). If
    the installed SDK treats `options.env` as the complete subprocess environment, `PATH` and
    `ANTHROPIC_API_KEY` are dropped. Use `env: { ...process.env, ANTHROPIC_BASE_URL }` (the
    `env` config key). An example's own `requestDefaults` also replaces this one.
12. **Auth is narrower than the CLI's.** `resolveAuth()` accepts only the three environment
    modes. An `ANTHROPIC_AUTH_TOKEN` or a logged-in CLI session is rejected before spawning.
13. **The default model `claude-opus-4-8`** and example 19's fallback `claude-haiku-4-5` are repo
    defaults. Confirm that both are available to your account. Pin a model with
    `CLAUDE_AGENT_MODEL` or `--model`. Example 19's fallback can be overridden with
    `FALLBACK_MODEL`.
14. **Resolved — the runtime is the Claude Code CLI, and an empty run fails.** Found by the live
    integration suite. `resolveExecutablePath()` now prefers the SDK's bundled `cli.js`, and an
    explicit `fromDir` is authoritative. `chat()`/`stream()` throw when the runtime ends without
    a `result` message. *Previously:* with the SDK installed, the resolver returned the package
    `main` (`sdk.mjs`, the library). The subprocess exited silently, and `chat()` returned
    `content: ''` with 0 tokens as if it had succeeded.
15. **Resolved — custom tools receive their arguments with the real SDK.** Found by the live
    integration suite. Registered tools are declared to the SDK's `tool()` with a real zod raw
    shape, converted from the tool's JSON Schema `parameters` by `jsonSchemaToZodShape()`. `zod`
    (the SDK's peer dependency) is now a package dependency, and registering a tool without it
    fails with an install hint. The wrapper correlates calls by the SDK's
    `_meta['claudecode/toolUseId']`. *Previously:* tools were declared with a non-zod descriptor,
    so the MCP layer called every handler with only its request context. Arguments were lost
    (`city=undefined`) unless a `beforeToolCall` rewrite supplied them. The offline mocks never
    noticed, because they use the dependency-free fallback `tool()`.

---

## 8. Anti-patterns

| Don't | Do |
|---|---|
| Fall back to a default prompt when input is missing | `requirePrompt()` / let `EmptyPromptError` throw |
| Import `../src/index.mjs` from an example | Import from `./_shared.mjs` (keeps `HARNESS_MODULE` swappable) |
| Assume consecutive `chat()` calls share context | `resumeSession(prev.sessionId)` before each follow-up (D2) |
| Enforce policy in `harness.on(...)` | Use a hook (`beforeRun` throws, `beforeToolCall` denies) |
| Match bare names against `toolName` | Match `bareToolName` (or `normalizeToolName(toolName)`) for portable policy, or the qualified `toolName` for server-specific policy (C2) |
| Rely on `permissions.deny` for a hard block | `disallowedTools` |
| Redact by mutating `args` in `beforeToolCall` | Redact in the handler or with a native `PreToolUse` `updatedInput` (E3) |
| Treat `tokenBudget` as a cost ceiling | `maxTurns` per run + sum `costUsd` yourself (E2) |
| Read `usageSummary().tokens` as the last run | It is the lifetime total; use `lastRunTokens` or per-run `usage` (E4) |
| Use `systemPromptMode: 'replace'` with tools | `append` (keeps Claude Code's tool instructions) (D1) |
| Opt into `settingSources` in CI or services without intent | Keep `[]` so behavior doesn't depend on disk (§5) |
| Leave an SSE stream running after the client leaves | `abortController` per request, abort on `close` (A3) |
| Use V2 `unstable_v2_*` / `session.send()` | `query()` + `resume`, which the harness already does (§1.1) |
| Forget `stop()` | `runExample()` or `try/finally { await h.stop() }` |
| Hard-code keys | Environment variables only (F4) |
| Trust model-computed derived fields (`verdict`, citations) | Recompute or verify them in code (B2, B3) |

---

## 9. Example → pattern index

| # | File | Patterns | Note |
|---|---|---|---|
| 01 | [`01-chat.mjs`](examples/01-chat.mjs) | P0, A1, E4 | |
| 02 | [`02-streaming.mjs`](examples/02-streaming.mjs) | A2 | |
| 03 | [`03-sse-server.mjs`](examples/03-sse-server.mjs) | A2, A3 | no abort on disconnect |
| 04 | [`04-structured-output.mjs`](examples/04-structured-output.mjs) | B1 | |
| 05 | [`05-tool-calling.mjs`](examples/05-tool-calling.mjs) | C1, F1 | |
| 06 | [`06-token-budget.mjs`](examples/06-token-budget.mjs) | E1, E2 (warn) | |
| 06a | [`06a-token-budget-within.mjs`](examples/06a-token-budget-within.mjs) | E1, E2 (block) | |
| 06b | [`06b-token-budget-exceeded.mjs`](examples/06b-token-budget-exceeded.mjs) | E1, E2 (block) | 0 turns spent |
| 07 | [`07-session-persistence.mjs`](examples/07-session-persistence.mjs) | D3 | caveat 2 |
| 08 | [`08-observability.mjs`](examples/08-observability.mjs) | F2 | |
| 09 | [`09-hooks-and-events.mjs`](examples/09-hooks-and-events.mjs) | F1, E3, C2 | |
| 10 | [`10-system-prompt.mjs`](examples/10-system-prompt.mjs) | D1 (append) | |
| 11 | [`11-multi-turn-chat.mjs`](examples/11-multi-turn-chat.mjs) | D2 (resume) | |
| 12 | [`12-resume-session.mjs`](examples/12-resume-session.mjs) | D2, D3 (native resume) | |
| 13 | [`13-rag-grounding.mjs`](examples/13-rag-grounding.mjs) | B2, D1 | demo-grade |
| 14 | [`14-llm-as-judge.mjs`](examples/14-llm-as-judge.mjs) | B1, B3 | demo-grade |
| 15 | [`15-classification-pipeline.mjs`](examples/15-classification-pipeline.mjs) | B1, B4 | |
| 16 | [`16-streaming-with-tools.mjs`](examples/16-streaming-with-tools.mjs) | A2, C1, C3 | |
| 17 | [`17-human-in-the-loop.mjs`](examples/17-human-in-the-loop.mjs) | C0, C2, E4 | caveat 8 |
| 18 | [`18-pii-redaction.mjs`](examples/18-pii-redaction.mjs) | C1, E3 | caveat 9 |
| 19 | [`19-resilience-retry.mjs`](examples/19-resilience-retry.mjs) | F3 | |
| 20 | [`20-budget-warn-mode.mjs`](examples/20-budget-warn-mode.mjs) | E2 (warn), E4 | |
| 21 | [`21-cost-report.mjs`](examples/21-cost-report.mjs) | E4 | |
| 22 | [`22-mcp-and-subagents.mjs`](examples/22-mcp-and-subagents.mjs) | C4, C0 | demo-grade |
| 23 | [`23-repl-chatbot.mjs`](examples/23-repl-chatbot.mjs) | D2, D4 | |
| 24 | [`24-enterprise-proxy.mjs`](examples/24-enterprise-proxy.mjs) | F4 | |
| 25 | [`25-policy-gated-investigator.mjs`](examples/25-policy-gated-investigator.mjs) | C1, C2, E3, B1, B2, B3, E4 (C5-B1) | identical in all 3 packages |
| 26 | [`26-plugins.mjs`](examples/26-plugins.mjs) | C6, C0 | demo-grade |

### Choosing a pattern

The use cases are taken from the research. They are design starting points, not guarantees
that a task will succeed.

| Application need | Start with |
|---|---|
| One transformation (summarize, rewrite, answer) | A1. For a single request with no tools, the `claude-sdk/v100` sibling is simpler and cheaper. |
| Coding automation (investigate, edit, run tests) | C0 (`cwd`, `acceptEdits`, `maxTurns`) + C2 + F1 |
| Research assistant | C0 (web/search) + C4 subagents + D2 |
| Data analysis over local files | C0 (Read/Bash) + B1 for the final report |
| Operations assistant (logs, service state, approved actions) | C1/C4 + C2 (approval) + F1 + F2 |
| Support workflow (account/order lookup → resolution) | C1 + D2/D3 + B1 |
| Embedded agent UI (progress, approvals, continuation) | A2 → A3 + C2 + D3 (native resume) |
| Output consumed by software | B1, or native `outputFormat` (§5) |
| Operations investigation with approved actions only | C5-B1 (example 25) |
| Hard cost ceiling | `maxTurns` + E1 `block`; E2 is token-based, not a cost ceiling |
| Production operation | F1 + F2 + F3 + E4 |

---

## 10. Adding a new pattern

1. Implement it as `examples/NN-name.mjs` following P0, and add it to `examples/README.md`.
2. Add a §4 entry (intent, recipe, composes/doesn't, examples) **with its status tag (§0)**, a §6 row if it changes
   compatibility, and a §9 row. If the sibling has the same pattern, keep the ID aligned with
   `claude-sdk/v100/SPEC_PATTERN.md`.
3. If it needs `requestDefaults`, `nativeHooks`, or a raw `dispatchQuery()`, document it in §5
   and say what it bypasses. Check the field against the installed SDK version.
4. If it exposes a gap in `src/`, add it to §7 with a `file:line` reference.
