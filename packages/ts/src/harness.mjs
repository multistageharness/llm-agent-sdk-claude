/**
 * ClaudeAgentHarness — orchestration over the Claude Agent SDK `query()` runtime
 * (which spawns the Claude Code CLI as a subprocess).
 *
 * Structurally the "runtime" sibling of the Messages API harness
 * (`claude-sdk/v100`): where that port re-homed sessions, tool execution, hooks,
 * and telemetry client-side, the Agent SDK exposes them natively, so this harness
 * thins the re-homing and bridges to the SDK lifecycle instead:
 *   - `chat()` drains a single `SDKMessage` generator (the runtime runs the tool
 *     loop internally — no client-side per-turn re-call).
 *   - `stream()` enables `includePartialMessages` and maps partial-assistant
 *     deltas into a clean delta/done sequence.
 *   - `structured()` runs a validate/extract/repair loop through `chat()` (or a
 *     single strict-output native call).
 *   - `registerTool()` declares in-process SDK MCP tools to the runtime.
 *   - native sessions via `resume`/`forkSession`; a durable context store mirrors
 *     conversations for replay.
 *   - token budget + preflight; usage/cost accounting from the `result` message.
 *   - an EventEmitter surface plus awaitable hooks bridged to native
 *     `options.hooks` (PreToolUse/PostToolUse/…), permission modes, and a
 *     `canUseTool` policy.
 *
 * The `query()` impl is injected (`deps.queryImpl`) for tests, so the suite runs
 * offline against a mock stream — never a real subprocess.
 */

import { EventEmitter } from 'node:events';

import { loadConfig, resolveSystemPrompt, buildQueryOptions } from './config.mjs';
import { dispatchQuery, loadSdkTooling, fallbackTool, fallbackCreateSdkMcpServer, jsonSchemaToZodShape } from './runtime.mjs';
import { TokenBudget, analyzeRun } from './tokens.mjs';
import { UsageTracker } from './usage.mjs';
import { HookManager } from './hooks.mjs';
import { ContextStore } from './store.mjs';
import { Observability } from './observability.mjs';
import {
  StructuredOutputError,
  validateSchema,
  buildStructuredPrompt,
  buildRepairPrompt,
  buildStrictOutputDirective,
  parseStructuredResponse,
} from './structured.mjs';

/**
 * Format one Server-Sent-Events frame from a `stream()` item. The event name is
 * derived from `item.type`: `delta` → `event: delta`, `done` → `event: done`,
 * anything error-ish → `event: error`. Pure and side-effect-free.
 */
export function formatSSE(item = {}) {
  const type = item.type ?? 'message';
  const event = type === 'delta' ? 'delta'
    : type === 'done' ? 'done'
    : (type === 'error' || item.error) ? 'error'
    : type;
  const lines = [`event: ${event}`];
  const payload = JSON.stringify(item ?? null);
  for (const line of payload.split('\n')) lines.push(`data: ${line}`);
  return `${lines.join('\n')}\n\n`;
}

/** Thrown when chat/stream/structured is called without an actual user message. */
export class EmptyPromptError extends Error {
  constructor(method = 'chat') {
    super(
      `${method}() requires a non-empty user message; `
      + 'built-in scaffolding alone will not be sent to the model.',
    );
    this.name = 'EmptyPromptError';
    this.method = method;
  }
}

/** Reject a missing/empty/whitespace-only user message before any runtime call. */
export function assertUserMessage(message, method = 'chat') {
  if (typeof message !== 'string' || message.trim() === '') {
    throw new EmptyPromptError(method);
  }
}

/** Render attached conversation history into a prompt preamble. Ported from
 * `claude-sdk/v100/src/harness.mjs` (interchange contract) — same format, so a
 * stored context replays identically across harnesses. */
export function renderContextPreamble(messages = []) {
  if (!messages.length) return '';
  const body = messages
    .map((m) => `${(m.role ?? 'user').toUpperCase()}: ${m.content}`)
    .join('\n');
  return [
    '<conversation-context>',
    'Prior conversation to continue from:',
    body,
    '</conversation-context>',
    '',
  ].join('\n');
}

/**
 * Split an assistant message's `content` block array into the user-facing answer
 * text, the ordered extended-thinking blocks, and any tool-use blocks (already
 * executed by the runtime — the answer ignores them).
 */
export function extractContent(content = []) {
  let text = '';
  const thinking = [];
  const toolUses = [];
  for (const block of content) {
    if (!block) continue;
    if (block.type === 'text') text += block.text ?? '';
    else if (block.type === 'thinking') { if (block.thinking) thinking.push(block.thinking); }
    else if (block.type === 'tool_use') toolUses.push(block);
  }
  return { text, thinking, toolUses };
}

/**
 * Resolve the user-facing answer from an assistant `content` block array.
 * Ported from `claude-sdk/v100/src/harness.mjs` (interchange contract): prefer
 * concatenated `text` blocks (never the `thinking` chain-of-thought); fall
 * back to `fallback.content` when the blocks carry no text.
 *
 * @param {Array<object>} content
 * @param {object} [fallback]
 * @returns {string}
 */
export function resolveAnswerContent(content = [], fallback = undefined) {
  const { text } = extractContent(content);
  if (text) return text;
  if (typeof fallback?.content === 'string') return fallback.content;
  return '';
}

/** Normalize a usage object's token fields (snake_case with camelCase fallback). */
function usageFields(u = {}) {
  return {
    input: u.input_tokens ?? u.inputTokens ?? 0,
    output: u.output_tokens ?? u.outputTokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? u.cacheReadInputTokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? u.cacheCreationInputTokens ?? 0,
  };
}

/** Render a tool handler's return value into `CallToolResult` text. */
function toToolResultText(result) {
  if (result == null) return '';
  if (typeof result === 'string') return result;
  if (typeof result?.textResultForLlm === 'string') return result.textResultForLlm;
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

/**
 * Strip an MCP qualifier (`mcp__<server>__<tool>` → `<tool>`). Harness tools reach
 * the runtime as `mcp__harness__<name>`; hooks and usage stats key on the bare name.
 */
export function normalizeToolName(name) {
  return String(name).replace(/^mcp__[^_]+__/, '');
}

/** `gen_ai.tool.type` for a runtime tool name. */
function toolTypeFor(toolName) {
  if (String(toolName).startsWith('mcp__harness__')) return 'custom';
  if (String(toolName).startsWith('mcp__')) return 'mcp';
  return 'builtin';
}

/** `gen_ai.provider.name` for the runtime's backend (Bedrock / Vertex / Anthropic). */
function providerNameFor(env = {}) {
  if (env.CLAUDE_CODE_USE_BEDROCK && env.CLAUDE_CODE_USE_BEDROCK !== '0') return 'aws.bedrock';
  if (env.CLAUDE_CODE_USE_VERTEX && env.CLAUDE_CODE_USE_VERTEX !== '0') return 'gcp.vertex_ai';
  return 'anthropic';
}

/** Deep-copy tool input so hooks can mutate it without touching the runtime's copy. */
function cloneArgs(args) {
  try {
    return structuredClone(args ?? {});
  } catch {
    return args;
  }
}

/** True when a hook mutated its (cloned) args in place. */
function argsChanged(before, after) {
  if (before === after) return false;
  try {
    return JSON.stringify(before ?? {}) !== JSON.stringify(after ?? {});
  } catch {
    return false;
  }
}

/** Match a tool name against a pattern (exact, or `prefix*` wildcard). */
function matchesPattern(name, pattern) {
  if (pattern === name) return true;
  if (pattern.endsWith('*')) return name.startsWith(pattern.slice(0, -1));
  return false;
}

export class ClaudeAgentHarness extends EventEmitter {
  /**
   * @param {object} [options]
   * @param {string} [options.configFile] JSON config file
   * @param {object} [options.config]     programmatic config overrides
   * @param {object} [options.hooks]      initial hook handlers {name: fn|fn[]}
   * @param {object} [deps] test seams: { queryImpl, tool, createSdkMcpServer, env }
   */
  constructor(options = {}, deps = {}) {
    super();
    this.config = loadConfig({
      configFile: options.configFile,
      overrides: options.config,
      env: deps.env ?? process.env,
    });
    this.hooks = new HookManager(options.hooks);
    this.budget = new TokenBudget(this.config.tokenBudget);
    this.tracker = new UsageTracker();
    this.usage = this.tracker; // alias — some call sites read `.usage`
    this.store = this.config.contextStore?.enabled
      ? new ContextStore({ directory: this.config.contextStore.directory })
      : null;
    this.obs = new Observability(this.config.observability, {
      providerName: providerNameFor(deps.env ?? process.env),
    });

    this._deps = deps;
    this._env = deps.env ?? process.env;
    this._queryImpl = deps.queryImpl ?? null;
    this._sdkTool = deps.tool ?? fallbackTool;
    this._createSdkMcpServer = deps.createSdkMcpServer ?? fallbackCreateSdkMcpServer;
    this._zod = deps.zod ?? null;

    this._tools = [];
    this._pendingResume = null;
    this._pendingFork = false;
    this._pendingContext = [];
    this._pendingToolCalls = new Map();
    /** per-run `beforeToolCall` verdicts keyed by toolUseId (PreToolUse → canUseTool reuse) */
    this._toolVerdicts = new Map();
    this._agentSpan = null;
    this._sessionId = null;
    this._started = false;
  }

  /* ------------------------------------------------------------ *
   * lifecycle
   * ------------------------------------------------------------ */

  /** Initialize observability + resolve SDK tooling. Idempotent. */
  async start() {
    if (this._started) return this;
    await this.obs.init();
    if (!this._deps.tool || !this._deps.createSdkMcpServer) {
      const t = await loadSdkTooling();
      this._sdkTool = this._deps.tool ?? t.tool;
      this._createSdkMcpServer = this._deps.createSdkMcpServer ?? t.createSdkMcpServer;
      this._zod = this._deps.zod ?? t.zod;
    }
    this._started = true;
    this.emit('started', {});
    return this;
  }

  get sessionId() {
    return this._sessionId;
  }

  /** Release harness state. Fires the `onSessionEnd` hook when a session ran. */
  async stop() {
    const errors = [];
    if (this._sessionId) {
      await this.hooks.run('onSessionEnd', { sessionId: this._sessionId })
        .catch((err) => errors.push(err));
    }
    this._started = false;
    this.emit('stopped', { errors });
    return errors;
  }

  /* ------------------------------------------------------------ *
   * sessions (native resume / continue / fork + store replay)
   * ------------------------------------------------------------ */

  /** Re-enter the exact prior runtime session on the next run. */
  resumeSession(id, opts = {}) {
    this._pendingResume = id;
    this._pendingFork = false;
    this.emit('session:resumed', { sessionId: id, mode: 'resume', restored: 0 });
    return this;
  }

  /**
   * Continue the given or most-recent session. When a context store holds records
   * for the resolved id, replay them into a fresh run (the runtime session may be
   * gone); otherwise thread `resume`.
   */
  continueFrom(id, opts = {}) {
    const resolved = id ?? this._sessionId ?? this.store?.latestSessionId() ?? null;
    if (this.store && resolved && this.store.load(resolved).length && opts.resume !== true) {
      const messages = this.store.asContextMessages(resolved);
      this.attachContext(messages);
      this.emit('session:replayed', { from: resolved, sessionId: resolved, messages: messages.length, turns: messages.length });
      return this;
    }
    this._pendingResume = resolved;
    this._pendingFork = false;
    this.emit('session:resumed', { sessionId: resolved, mode: 'continue', restored: 0 });
    return this;
  }

  /** Branch into a new, divergent session from `id` without mutating the source. */
  forkSession(id, opts = {}) {
    this._pendingResume = id;
    this._pendingFork = true;
    this.emit('session:resumed', { sessionId: id, mode: 'fork', restored: 0 });
    return this;
  }

  /** Attach prior {role, content} turns; folded into the next run as a replay prompt. */
  attachContext(messages = []) {
    this._pendingContext.push(...messages);
    return this;
  }

  /* ------------------------------------------------------------ *
   * tools (in-process SDK MCP server)
   * ------------------------------------------------------------ */

  /**
   * Register a custom tool exposed to the model via the in-process SDK MCP server.
   * @param {{ name: string, description?: string, parameters?: object, handler: Function }} tool
   */
  registerTool(tool) {
    if (!tool?.name || typeof tool.handler !== 'function') {
      throw new TypeError('registerTool requires { name, handler }');
    }
    this._tools.push(tool);
    return this;
  }

  /**
   * Convert a JSON-schema `parameters` object into the schema the SDK `tool()`
   * factory accepts. The real SDK needs a zod raw shape: without one the MCP
   * layer calls the handler with only its request context, so every argument is
   * lost (found by the live integration suite). Offline (fallback `tool()`) we
   * produce a dependency-free descriptor whose `safeParse` reuses the harness's
   * JSON Schema validator so accept/reject is testable.
   */
  _jsonSchemaToZod(parameters = { type: 'object', properties: {} }) {
    if (this._sdkTool !== fallbackTool) {
      if (!this._zod) {
        throw new Error(
          'Custom tools need zod (a peer dependency of @anthropic-ai/claude-agent-sdk): npm install zod',
        );
      }
      return jsonSchemaToZodShape(this._zod, parameters);
    }
    return {
      __jsonSchema: parameters,
      safeParse(input) {
        const { valid, errors } = validateSchema(input, parameters);
        return valid ? { success: true, data: input } : { success: false, error: { issues: errors } };
      },
      parse(input) {
        const { valid, errors } = validateSchema(input, parameters);
        if (!valid) throw new Error(`Invalid tool input: ${errors.join('; ')}`);
        return input;
      },
    };
  }

  /**
   * Find the native-bridge record (opened by PreToolUse) for a harness tool
   * invocation: by toolUseId when the runtime passes one, else the oldest
   * unclaimed pending call whose bare name matches. Claims it so the wrapper and
   * the bridge never both account the same call.
   */
  _claimBridgedCall(bareName, toolUseId) {
    if (toolUseId != null && this._pendingToolCalls.has(toolUseId)) {
      const rec = this._pendingToolCalls.get(toolUseId);
      rec.claimed = true;
      return rec;
    }
    for (const rec of this._pendingToolCalls.values()) {
      if (!rec.claimed && rec.bareName === bareName) {
        rec.claimed = true;
        return rec;
      }
    }
    return null;
  }

  /**
   * Wrap a registered handler with timing, lifecycle hooks, events, and error
   * containment, returning a `CallToolResult` for the in-process MCP server.
   *
   * When the native PreToolUse bridge already opened a record for this call, the
   * bridge owns `tool:call`/`tool:result`, `afterToolCall`, and usage accounting
   * (emitted once per toolUseId); the wrapper only runs the handler. Invoked
   * outside the bridge (direct calls, tests), the wrapper accounts it itself.
   */
  _wrapHandler(tool) {
    return async (args, extra = {}) => {
      const startedAt = Date.now();
      // the real SDK passes the call id in the MCP request _meta
      const runtimeId = extra?.toolUseId ?? extra?._meta?.['claudecode/toolUseId'];
      const bridged = this._claimBridgedCall(tool.name, runtimeId);
      const toolUseId = runtimeId ?? bridged?.toolUseId;
      if (!bridged) this.emit('tool:call', { tool: tool.name, args, toolUseId });
      // a beforeToolCall rewrite (redaction) wins over whatever the runtime forwarded
      const input = bridged?.sanitized ? bridged.args : args;
      try {
        const result = await tool.handler(input, { sessionId: this._sessionId, toolUseId });
        if (!bridged) {
          const durationMs = Date.now() - startedAt;
          this.emit('tool:result', { tool: tool.name, result, durationMs, toolUseId });
          this.obs.ingest(this.tracker.ingestToolCall({ name: tool.name, success: true, durationMs }));
          await this.hooks.run('afterToolCall', {
            toolName: tool.name, bareToolName: tool.name, args, result, durationMs,
            sessionId: this._sessionId, toolUseId, toolUseID: toolUseId,
          });
        }
        return { content: [{ type: 'text', text: toToolResultText(result) }] };
      } catch (error) {
        if (bridged) {
          bridged.error = error; // PostToolUse reports the failure once
        } else {
          const durationMs = Date.now() - startedAt;
          this.emit('tool:error', { tool: tool.name, error, durationMs, toolUseId });
          this.obs.ingest(this.tracker.ingestToolCall({ name: tool.name, success: false, durationMs }));
          await this.hooks.run('onToolFailure', {
            toolName: tool.name, bareToolName: tool.name, args, error, sessionId: this._sessionId, toolUseId,
          });
        }
        return {
          content: [{ type: 'text', text: `Tool "${tool.name}" failed: ${error?.message ?? error}` }],
          isError: true,
        };
      }
    };
  }

  /** Map a registered tool onto the SDK `tool()` shape. */
  _toSdkTool(tool) {
    return this._sdkTool(
      tool.name,
      tool.description ?? '',
      this._jsonSchemaToZod(tool.parameters),
      this._wrapHandler(tool),
    );
  }

  /** Merge external MCP servers (config) with the in-process harness server. */
  _buildMcpServers() {
    const merged = { ...(this.config.mcpServers ?? {}) };
    if (this._tools.length) {
      merged.harness = this._createSdkMcpServer({
        name: 'harness',
        version: '0.1.0',
        tools: this._tools.map((t) => this._toSdkTool(t)),
      });
    }
    return merged;
  }

  /** Compose the `allowedTools` allowlist (config + harness-tool names + wildcards). */
  _buildAllowedTools() {
    const allowed = [...(this.config.allowedTools ?? [])];
    for (const t of this._tools) {
      const name = `mcp__harness__${t.name}`;
      if (!allowed.includes(name)) allowed.push(name);
    }
    if (this.config.autoAllowMcp) {
      for (const name of Object.keys(this.config.mcpServers ?? {})) {
        const wildcard = `mcp__${name}__*`;
        if (!allowed.includes(wildcard)) allowed.push(wildcard);
      }
    }
    return allowed;
  }

  /* ------------------------------------------------------------ *
   * permission policy (canUseTool)
   * ------------------------------------------------------------ */

  /** `permissions.deny` match against the qualified or the bare tool name. */
  _matchesDeny(toolName) {
    const bare = normalizeToolName(toolName);
    return (this.config.permissions?.deny ?? [])
      .some((p) => matchesPattern(toolName, p) || matchesPattern(bare, p));
  }

  /** `beforeToolCall` payload: qualified + bare name, both toolUseId spellings. */
  _toolHookPayload(toolName, args, toolUseId) {
    return {
      toolName,
      bareToolName: normalizeToolName(toolName),
      args,
      sessionId: this._sessionId,
      toolUseId,
      toolUseID: toolUseId, // legacy spelling (native hook field name)
    };
  }

  /**
   * Evaluate `beforeToolCall` at most once per toolUseId per run: PreToolUse and
   * canUseTool can both fire for one call, and the second reuses the cached
   * verdict instead of re-running the hooks. Returns `{ verdict, cached }`.
   *
   * `permissions.deny` is checked first, so it also covers pre-approved tools
   * (`allowedTools`, `mcp__harness__*`, `autoAllowMcp`) that skip canUseTool.
   * Hooks see a clone of the input; an in-place mutation or a returned
   * `{ updatedInput }` becomes `verdict.updatedInput` (redaction path, E3).
   */
  async _toolVerdictOnce(toolName, args, toolUseId) {
    if (toolUseId != null && this._toolVerdicts.has(toolUseId)) {
      return { verdict: this._toolVerdicts.get(toolUseId), cached: true };
    }
    let verdict;
    if (this._matchesDeny(toolName)) {
      verdict = { deny: true, reason: 'denied by policy', policy: true };
    } else {
      const hookArgs = cloneArgs(args);
      verdict = await this.hooks.toolCallVerdict(this._toolHookPayload(toolName, hookArgs, toolUseId));
      if (!verdict.deny && verdict.updatedInput === undefined && argsChanged(args, hookArgs)) {
        verdict = { ...verdict, updatedInput: hookArgs };
      }
    }
    if (toolUseId != null) this._toolVerdicts.set(toolUseId, verdict);
    return { verdict, cached: false };
  }

  /** Build the `options.canUseTool` policy callback. */
  _buildCanUseTool() {
    return async (toolName, input, ctx = {}) => {
      const toolUseId = ctx.toolUseID ?? ctx.toolUseId;
      const { verdict, cached } = await this._toolVerdictOnce(toolName, input, toolUseId);
      if (verdict.deny) {
        // PreToolUse already emitted tool:denied for a cached verdict
        if (!cached) this.emit('tool:denied', { tool: normalizeToolName(toolName), qualifiedName: toolName, toolUseId, reason: verdict.reason });
        return { behavior: 'deny', message: verdict.reason, interrupt: false };
      }
      return { behavior: 'allow', updatedInput: verdict.updatedInput ?? input };
    };
  }

  /* ------------------------------------------------------------ *
   * native hook bridge (options.hooks)
   * ------------------------------------------------------------ */

  /**
   * PreToolUse bridge: harness `beforeToolCall` veto → native permission decision.
   * Opens the per-toolUseId record that owns this call's events and accounting.
   */
  async _preToolHook(input = {}) {
    const toolName = input.tool_name;
    const bareName = normalizeToolName(toolName);
    const args = input.tool_input;
    const toolUseId = input.tool_use_id;
    const { verdict } = await this._toolVerdictOnce(toolName, args, toolUseId);
    if (verdict.deny) {
      this.emit('tool:denied', { tool: bareName, qualifiedName: toolName, toolUseId, reason: verdict.reason });
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: verdict.reason,
        },
      };
    }
    const sanitized = verdict.updatedInput !== undefined;
    const callArgs = sanitized ? verdict.updatedInput : args;
    this._pendingToolCalls.set(toolUseId, {
      name: toolName,
      bareName,
      toolUseId,
      args: callArgs,
      sanitized,
      startedAt: Date.now(),
      claimed: false,
      span: this.obs.startToolSpan({ toolName: bareName, toolUseId, toolType: toolTypeFor(toolName) }),
    });
    this.emit('tool:call', { tool: bareName, qualifiedName: toolName, args: callArgs, toolUseId });
    if (!sanitized) return undefined;
    // the SDK applies updatedInput only alongside an explicit allow; the harness
    // policy (permissions.deny + beforeToolCall) has already run, and canUseTool
    // would only replay this cached verdict
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        updatedInput: callArgs,
      },
    };
  }

  /** PostToolUse bridge: forward tool output to `afterToolCall`, correlate by id. */
  async _postToolHook(input = {}) {
    const toolName = input.tool_name;
    const bareName = normalizeToolName(toolName);
    const toolUseId = input.tool_use_id;
    const output = input.tool_output ?? input.tool_response;
    const pending = this._pendingToolCalls.get(toolUseId) ?? {};
    const durationMs = pending.startedAt ? Date.now() - pending.startedAt : 0;
    const error = pending.error ?? ((input.is_error || output?.is_error || output?.isError) ? output : null);
    const payload = {
      toolName, bareToolName: bareName, args: pending.args, sessionId: this._sessionId, toolUseId, toolUseID: toolUseId,
    };
    this._pendingToolCalls.delete(toolUseId);
    this.obs.endSpan(pending.span, error);
    if (error) {
      this.emit('tool:error', { tool: bareName, qualifiedName: toolName, error, durationMs, toolUseId });
      this.obs.ingest(this.tracker.ingestToolCall({ name: bareName, success: false, durationMs }));
      await this.hooks.run('onToolFailure', { ...payload, error });
    } else {
      this.emit('tool:result', { tool: bareName, qualifiedName: toolName, result: output, durationMs, toolUseId });
      this.obs.ingest(this.tracker.ingestToolCall({ name: bareName, success: true, durationMs }));
      await this.hooks.run('afterToolCall', { ...payload, result: output, durationMs });
    }
    return undefined;
  }

  /** Build the native `options.hooks` object bridging harness hooks/events. */
  _buildNativeHooks() {
    const native = {
      PreToolUse: [{ hooks: [(input) => this._preToolHook(input)], timeout: this.config.hookTimeoutMs }],
      PostToolUse: [{ hooks: [(input) => this._postToolHook(input)], timeout: this.config.hookTimeoutMs }],
      UserPromptSubmit: [{ hooks: [async (input) => {
        await this.hooks.run('onPromptSubmit', { prompt: input.prompt, sessionId: this._sessionId });
        return undefined;
      }] }],
      SessionStart: [{ hooks: [async (input) => {
        await this.hooks.run('onSessionStart', { sessionId: input.session_id ?? this._sessionId });
        return undefined;
      }] }],
      SessionEnd: [{ hooks: [async (input) => {
        await this.hooks.run('onSessionEnd', { sessionId: input.session_id ?? this._sessionId, reason: input.reason });
        return undefined;
      }] }],
      Stop: [{ hooks: [async () => undefined] }],
    };
    // concat any user-supplied native matchers so both fire
    const extra = this.config.nativeHooks ?? {};
    for (const [event, matchers] of Object.entries(extra)) {
      native[event] = [...(native[event] ?? []), ...matchers];
    }
    return native;
  }

  /* ------------------------------------------------------------ *
   * options assembly
   * ------------------------------------------------------------ */

  _resolveSystemPromptText() {
    const sp = resolveSystemPrompt(this.config);
    if (sp == null) return null;
    if (typeof sp === 'string') return sp;
    return sp.append ?? null;
  }

  /** Assemble the full `Options` object handed to the runtime. */
  _buildOptions(opts = {}, { streaming = false, systemPromptOverride } = {}) {
    const options = buildQueryOptions(this.config);

    if (opts.model) options.model = opts.model;
    if (opts.effort) options.effort = opts.effort;
    if (opts.permissionMode) options.permissionMode = opts.permissionMode;
    options.maxTurns = opts.maxTurns ?? this.config.maxTurns;
    if (systemPromptOverride !== undefined) {
      if (systemPromptOverride == null) delete options.systemPrompt;
      else options.systemPrompt = systemPromptOverride;
    } else if (opts.systemPrompt) {
      options.systemPrompt = opts.systemPrompt;
    }

    const mcpServers = this._buildMcpServers();
    if (Object.keys(mcpServers).length) options.mcpServers = mcpServers;

    const allowed = this._buildAllowedTools();
    if (allowed.length) options.allowedTools = allowed;
    const disallowed = this.config.disallowedTools ?? [];
    if (disallowed.length) options.disallowedTools = disallowed;

    if (this.config.agents && Object.keys(this.config.agents).length) {
      options.agents = this.config.agents;
    }

    this._toolVerdicts.clear(); // verdict cache is per run
    options.canUseTool = this._buildCanUseTool();
    options.hooks = this._buildNativeHooks();

    if (streaming) options.includePartialMessages = true;

    if (this._pendingResume != null) {
      options.resume = this._pendingResume;
      if (this._pendingFork) options.forkSession = true;
      this._pendingResume = null;
      this._pendingFork = false;
    }

    options.abortController = opts.abortController ?? new AbortController();
    return options;
  }

  /**
   * Compose the prompt string. Attached context is rendered as a
   * `<conversation-context>` preamble (same format as `claude-sdk`), not as
   * separate streaming-input messages the runtime would treat as extra turns.
   */
  _composePrompt(prompt) {
    const ctx = this._pendingContext;
    this._pendingContext = [];
    if (!ctx.length) return prompt;
    return `${renderContextPreamble(ctx)}${prompt}`;
  }

  /* ------------------------------------------------------------ *
   * preflight / budget
   * ------------------------------------------------------------ */

  /** Pre-run token analysis without dispatching anything. Emits `preflight`. */
  preflight(prompt, opts = {}) {
    const report = analyzeRun({
      prompt,
      systemPrompt: this._resolveSystemPromptText(),
      context: [...this._pendingContext, ...(opts.context ?? [])],
      attachments: opts.attachments,
      expectedOutputTokens: opts.expectedOutputTokens,
    }, this.budget);
    this.emit('preflight', report);
    return report;
  }

  async _gateOnBudget(report) {
    if (!this.budget.wouldExceed(report.estimatedTotalTokens)) return;
    if (this.budget.enforcement === 'block') {
      await this.hooks.run('onBudgetExceeded', {
        budget: this.budget.snapshot(),
        estimate: report.estimatedTotalTokens,
      });
      this.obs.recordError('harness', { reason: 'budget_blocked' });
      this.emit('budget:exceeded', this.budget.snapshot());
      this.budget.checkOrThrow(report.estimatedTotalTokens); // throws in block mode
    } else {
      this.emit('budget:exceeded', this.budget.snapshot());
    }
  }

  /**
   * Fold one run's actual spend into the budget + emit transitions. `record()`
   * accumulates, so it is fed exactly this run's authoritative total.
   */
  _reconcileBudget(runTotalTokens) {
    const state = this.budget.record(Math.max(0, runTotalTokens || 0));
    this.obs.observeBudget(this.budget.snapshot());
    if (state === 'warn') {
      this.emit('budget:warn', this.budget.snapshot());
      this.hooks.run('onBudgetWarning', { budget: this.budget.snapshot() }).catch(() => {});
    } else if (state === 'exceeded') {
      this.emit('budget:exceeded', this.budget.snapshot());
      this.hooks.run('onBudgetExceeded', { budget: this.budget.snapshot() }).catch(() => {});
    }
  }

  /* ------------------------------------------------------------ *
   * per-message dispatch
   * ------------------------------------------------------------ */

  /** Observe one raw SDKMessage: emit `event`, capture session, fold usage. */
  _onSdkMessage(msg, state) {
    this.emit('event', msg);
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'system' && msg.subtype === 'init') {
      this._captureSession(msg.session_id);
      state.mcpServers = msg.mcp_servers ?? [];
      return;
    }

    if (msg.type === 'assistant') {
      const { text } = extractContent(msg.message?.content ?? []);
      const rec = this.tracker.ingestStepUsage(msg);
      if (rec) {
        this.emit('usage:tokens', rec);
        this.obs.ingest(rec, { usage: msg.message?.usage });
      }
      if (msg.parent_tool_use_id != null) {
        if (!state.subagentSeen.has(msg.parent_tool_use_id)) {
          state.subagentSeen.add(msg.parent_tool_use_id);
          this.emit('subagent:start', { parentToolUseId: msg.parent_tool_use_id });
        }
        this.tracker.ingestSubagent({
          parentToolUseId: msg.parent_tool_use_id,
          usage: msg.message?.usage,
          messageId: msg.message?.id,
        });
        this.emit('subagent:activity', { parentToolUseId: msg.parent_tool_use_id, content: text });
      }
      if (text) {
        state.answer = text;
        this.emit('message', { content: text, event: msg });
      }
      return;
    }

    if (msg.type === 'result') {
      this._captureSession(msg.session_id);
      state.result = msg;
    }
  }

  _captureSession(sessionId) {
    if (sessionId == null) return;
    if (this._sessionId == null) {
      this._sessionId = sessionId;
      this.emit('session:created', { sessionId });
    } else {
      this._sessionId = sessionId;
    }
  }

  /* ------------------------------------------------------------ *
   * chat
   * ------------------------------------------------------------ */

  /**
   * Send a prompt and await the complete response. The runtime runs the internal
   * tool loop, so this drains a single generator to the terminal `result`.
   *
   * @returns {{ content: string, usage: object, sessionId: string,
   *   costUsd: number, numTurns: number, result: object }}
   */
  async chat(prompt, opts = {}) {
    assertUserMessage(prompt, 'chat');
    return this._withAgentSpan((agentSpan) => this._chat(prompt, opts, agentSpan));
  }

  /**
   * Run `fn` inside the root `invoke_agent` span. Nested harness calls
   * (structured → chat) reuse the outer span rather than opening another root.
   */
  async _withAgentSpan(fn) {
    if (this._agentSpan) return fn(this._agentSpan);
    await this.start(); // the tracer exists only after obs.init()
    return this.obs.invokeAgentSpan({
      agentName: this.config.agentName,
      sessionId: this._sessionId,
      model: this.config.model,
    }, async (span) => {
      this._agentSpan = span;
      try {
        return await fn(span);
      } finally {
        this._agentSpan = null;
      }
    });
  }

  /** Response model reported by a `result` message (first modelUsage key). */
  _responseModel(resultMsg) {
    return Object.keys(resultMsg?.modelUsage ?? {})[0] ?? this.config.model;
  }

  async _chat(prompt, opts, agentSpan) {
    await this.start();

    const report = this.preflight(prompt, opts);
    await this.hooks.run('beforeRun', { prompt, sessionId: this._sessionId, analysis: report });
    await this._gateOnBudget(report);

    const options = this._buildOptions(opts, { streaming: false, systemPromptOverride: opts.systemPromptOverride });
    const composed = this._composePrompt(prompt);

    this.obs.recordRequestStart({ model: this.config.model });
    this.emit('run:start', { prompt, sessionId: this._sessionId });
    const startedAt = Date.now();
    const state = { answer: '', result: null, subagentSeen: new Set() };
    let firstTokenAt = null;

    try {
      const resultMsg = await this.obs.chatSpan({ model: this.config.model, sessionId: this._sessionId }, async (span) => {
        const stream = dispatchQuery({ prompt: composed, options, queryImpl: this._queryImpl, env: this._env });
        for await (const msg of stream) {
          if (firstTokenAt == null && (msg?.type === 'assistant' || msg?.type === 'stream_event')) firstTokenAt = Date.now();
          this._onSdkMessage(msg, state);
        }
        const r = state.result;
        const rf = usageFields(r?.usage);
        this.obs.setGenAiUsage(span, { inputTokens: rf.input, outputTokens: rf.output }, {
          responseModel: this._responseModel(r),
        });
        this.obs.recordContent(span, {
          input: [{ role: 'user', content: prompt }],
          output: [{ role: 'assistant', content: state.answer }],
        });
        return r;
      });

      if (!resultMsg) {
        // a runtime that exits without a result (e.g. a non-CLI executable) is a failure
        throw new Error('Runtime ended without a result message (is pathToClaudeCodeExecutable the Claude Code CLI?)');
      }
      if (resultMsg.subtype && resultMsg.subtype !== 'success') {
        throw new Error(`Run did not succeed (subtype: ${resultMsg.subtype})`);
      }
      const durationMs = Date.now() - startedAt;
      const ttftMs = firstTokenAt != null ? firstTokenAt - startedAt : null;
      this.tracker.ingestResult(resultMsg ?? {}, { model: this.config.model, durationMs, ttftMs });
      const f = usageFields(resultMsg?.usage);
      this._reconcileBudget(f.input + f.output);

      const usage = {
        inputTokens: f.input,
        outputTokens: f.output,
        totalTokens: f.input + f.output,
        cacheReadTokens: f.cacheRead,
        cacheWriteTokens: f.cacheWrite,
        durationMs,
        ttftMs,
      };
      const result = {
        content: state.answer,
        usage,
        sessionId: this._sessionId,
        costUsd: resultMsg?.total_cost_usd ?? null,
        numTurns: resultMsg?.num_turns ?? null,
        result: resultMsg,
      };
      this.obs.setGenAiUsage(agentSpan, usage);

      this.store?.saveExchange(this._sessionId, {
        request: { prompt },
        response: { content: state.answer },
        usage,
        meta: { model: this.config.model },
      });

      await this.hooks.run('afterRun', { prompt, response: state.answer, usage, sessionId: this._sessionId });
      this.emit('run:end', result);
      return result;
    } catch (error) {
      this.obs.recordError('harness', { reason: 'chat_failed' });
      this.tracker.ingestSessionError(String(error?.message ?? error));
      await this.hooks.run('onError', { error, phase: 'chat', sessionId: this._sessionId });
      this.emit('error:run', { error, prompt });
      throw error;
    }
  }

  /* ------------------------------------------------------------ *
   * streaming
   * ------------------------------------------------------------ */

  /** Map a partial-assistant `SDKMessage` to an incremental answer-delta string. */
  _mapPartial(msg, state) {
    const ev = msg?.event ?? {};
    if (ev.type !== 'content_block_delta') return null;
    const d = ev.delta ?? {};
    if (d.type === 'thinking_delta') {
      state.emittedThinking = (state.emittedThinking ?? '') + (d.thinking ?? '');
      return null;
    }
    if (d.type !== 'text_delta') return null;
    const t = d.text ?? '';
    if (!t) return null;
    // cumulative snapshot (text repeats the prior emitted text + more)
    if (state.emittedText.length > 0 && t.length >= state.emittedText.length && t.startsWith(state.emittedText)) {
      const suffix = t.slice(state.emittedText.length);
      state.emittedText = t;
      return suffix || null;
    }
    // incremental chunk
    state.emittedText += t;
    return t;
  }

  /**
   * Streaming chat: async generator yielding `{ type:'delta', content }` for each
   * streamed text chunk, then one `{ type:'done', usage }`. Single logical turn;
   * pipe to an HTTP response with `formatSSE()`.
   */
  async *stream(prompt, opts = {}) {
    assertUserMessage(prompt, 'stream');
    // async generators cannot run inside withSpan's callback: spans are manual here
    await this.start(); // the tracer exists only after obs.init()
    const agentSpan = this.obs.startInvokeAgentSpan({
      agentName: this.config.agentName,
      sessionId: this._sessionId,
      model: this.config.model,
    });
    let chatSpan = null;
    let failure = null;
    try {
      yield* this._stream(prompt, opts, agentSpan, (span) => { chatSpan = span; });
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      this.obs.endSpan(chatSpan, failure);
      this.obs.endSpan(agentSpan, failure);
    }
  }

  async *_stream(prompt, opts, agentSpan, onChatSpan) {
    await this.start();

    const report = this.preflight(prompt, opts);
    await this.hooks.run('beforeRun', { prompt, sessionId: this._sessionId, analysis: report });
    await this._gateOnBudget(report);

    const options = this._buildOptions(opts, { streaming: true, systemPromptOverride: opts.systemPromptOverride });
    const composed = this._composePrompt(prompt);

    this.obs.recordRequestStart({ model: this.config.model });
    this.emit('run:start', { prompt, sessionId: this._sessionId });
    const startedAt = Date.now();
    const msgState = { answer: '', result: null, subagentSeen: new Set() };
    const state = { emittedText: '' };
    let firstDeltaAt = null;
    const chatSpan = this.obs.startChatSpan({ model: this.config.model, sessionId: this._sessionId });
    onChatSpan(chatSpan);

    try {
      const stream = dispatchQuery({ prompt: composed, options, queryImpl: this._queryImpl, env: this._env });
      for await (const msg of stream) {
        if (msg?.type === 'stream_event') {
          this.emit('event', msg);
          const delta = this._mapPartial(msg, state);
          if (delta) {
            if (firstDeltaAt == null) firstDeltaAt = Date.now();
            this.emit('delta', { content: delta, event: msg });
            yield { type: 'delta', content: delta };
          }
          continue;
        }
        // same dispatch as chat(): event, session capture, step usage,
        // subagent:* and message events, terminal result
        this._onSdkMessage(msg, msgState);
        if (msg?.type === 'assistant') {
          // reconcile trailing text the partial deltas did not cover
          const { text } = extractContent(msg.message?.content ?? []);
          if (text && text.length > state.emittedText.length && text.startsWith(state.emittedText)) {
            const suffix = text.slice(state.emittedText.length);
            state.emittedText = text;
            if (firstDeltaAt == null) firstDeltaAt = Date.now();
            this.emit('delta', { content: suffix, event: msg });
            yield { type: 'delta', content: suffix };
          }
        }
      }

      const resultMsg = msgState.result;
      if (!resultMsg) {
        throw new Error('Runtime ended without a result message (is pathToClaudeCodeExecutable the Claude Code CLI?)');
      }
      if (resultMsg.subtype && resultMsg.subtype !== 'success') {
        throw new Error(`Run did not succeed (subtype: ${resultMsg.subtype})`);
      }
      const durationMs = Date.now() - startedAt;
      const ttftMs = firstDeltaAt ? firstDeltaAt - startedAt : null;
      this.tracker.ingestResult(resultMsg ?? {}, { model: this.config.model, durationMs, ttftMs });
      const f = usageFields(resultMsg?.usage);
      this._reconcileBudget(f.input + f.output);

      const usage = {
        inputTokens: f.input,
        outputTokens: f.output,
        totalTokens: f.input + f.output,
        cacheReadTokens: f.cacheRead,
        cacheWriteTokens: f.cacheWrite,
        durationMs,
        ttftMs,
      };
      this.obs.setGenAiUsage(chatSpan, usage, { responseModel: this._responseModel(resultMsg), ttftMs });
      this.obs.recordContent(chatSpan, {
        input: [{ role: 'user', content: prompt }],
        output: [{ role: 'assistant', content: msgState.answer || state.emittedText }],
      });
      this.obs.setGenAiUsage(agentSpan, usage);

      this.store?.saveExchange(this._sessionId, {
        request: { prompt },
        response: { content: msgState.answer || state.emittedText },
        usage,
        meta: { model: this.config.model },
      });
      await this.hooks.run('afterRun', { prompt, response: msgState.answer || state.emittedText, usage, sessionId: this._sessionId });

      const done = {
        type: 'done',
        content: msgState.answer || state.emittedText,
        usage,
        sessionId: this._sessionId,
        costUsd: resultMsg?.total_cost_usd ?? null,
        numTurns: resultMsg?.num_turns ?? null,
      };
      this.emit('run:end', done);
      yield done;
    } catch (error) {
      this.obs.recordError('harness', { reason: 'stream_failed' });
      this.tracker.ingestSessionError(String(error?.message ?? error));
      await this.hooks.run('onError', { error, phase: 'stream', sessionId: this._sessionId });
      this.emit('error:run', { error, prompt });
      throw error;
    }
  }

  /* ------------------------------------------------------------ *
   * structured
   * ------------------------------------------------------------ */

  /**
   * Structured output: ask for JSON conforming to `schema`, validate, and
   * auto-repair up to `config.structured.maxRepairAttempts` times. When
   * `config.structured.native` is set, make a single strict-output call (a
   * directive appended to the system prompt) and validate locally — no repair.
   *
   * @returns {{ value: any, content: string, attempts: number, usage: object }}
   */
  async structured(task, schema, opts = {}) {
    assertUserMessage(task, 'structured');
    return this._withAgentSpan(async (agentSpan) => {
      const out = await this._structured(task, schema, opts);
      this.obs.setGenAiUsage(agentSpan, out.usage);
      return out;
    });
  }

  async _structured(task, schema, opts) {
    const basePrompt = buildStructuredPrompt({ task, input: opts.input, label: opts.inputLabel, schema });

    if (this.config.structured?.native) {
      const directive = buildStrictOutputDirective(schema);
      const base = this._resolveSystemPromptText();
      const append = base ? `${base}\n\n${directive}` : directive;
      const { content, usage } = await this.chat(basePrompt, {
        ...opts,
        systemPromptOverride: { type: 'preset', preset: this.config.systemPromptPreset ?? 'claude_code', append },
      });
      const parsed = parseStructuredResponse(content, schema);
      if (parsed.ok) {
        this.emit('structured:ok', { attempts: 1 });
        return { value: parsed.value, content, attempts: 1, usage };
      }
      throw new StructuredOutputError(
        `Structured output failed (native): ${parsed.errors.join('; ')}`,
        { errors: parsed.errors, attempts: 1 },
      );
    }

    const maxAttempts = 1 + (this.config.structured?.maxRepairAttempts ?? 2);
    let prompt = basePrompt;
    let lastErrors = [];
    let totalUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

    let lastSessionId = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      // Repair turns resume the failed attempt's session so the model still sees
      // the task, the input, and its own invalid output — not a blank session.
      if (attempt > 1 && lastSessionId) this.resumeSession(lastSessionId);
      const { content, usage, sessionId } = await this.chat(prompt, opts);
      lastSessionId = sessionId ?? lastSessionId;
      totalUsage = {
        inputTokens: totalUsage.inputTokens + (usage.inputTokens ?? 0),
        outputTokens: totalUsage.outputTokens + (usage.outputTokens ?? 0),
        totalTokens: totalUsage.totalTokens + (usage.totalTokens ?? 0),
      };
      const parsed = parseStructuredResponse(content, schema);
      if (parsed.ok) {
        this.emit('structured:ok', { attempts: attempt });
        return { value: parsed.value, content, attempts: attempt, usage: totalUsage };
      }
      lastErrors = parsed.errors;
      this.emit('structured:invalid', { attempt, errors: lastErrors });
      prompt = buildRepairPrompt({ errors: lastErrors, schema });
    }

    throw new StructuredOutputError(
      `Structured output failed after ${maxAttempts} attempt(s): ${lastErrors.join('; ')}`,
      { errors: lastErrors, attempts: maxAttempts },
    );
  }

  /* ------------------------------------------------------------ *
   * usage summaries
   * ------------------------------------------------------------ */

  /** Structured usage summary: tokens, models, tools, subagents, latency + budget. */
  usageSummary() {
    return {
      ...this.tracker.summary(),
      budget: this.budget ? this.budget.snapshot() : null,
    };
  }

  /** Human-readable usage report. */
  usageReport() {
    const lines = [this.tracker.report()];
    const b = this.budget.snapshot();
    if (b.maxTokens != null) {
      lines.push(`budget: ${b.used}/${b.maxTokens} tokens (${b.utilizationPercent}% used, ${b.enforcement})`);
    }
    return lines.join('\n');
  }
}

/** Convenience: construct + start in one call. */
export async function createHarness(options = {}, deps = {}) {
  const harness = new ClaudeAgentHarness(options, deps);
  await harness.start();
  return harness;
}
