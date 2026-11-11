/**
 * Usage aggregation: tokens, tools, models, subagents, errors, cost.
 *
 * Re-sourced from the Agent SDK `SDKMessage` stream:
 *   - `ingestResult(result, meta)` folds the terminal `result` message's
 *     authoritative `usage` (`input_tokens`/`output_tokens`/`cache_*`), its
 *     `total_cost_usd` (a client-side estimate, NOT authoritative billing), its
 *     `modelUsage` breakdown, and `num_turns`.
 *   - `ingestStepUsage(assistantMessage)` folds interim per-turn usage, de-duped
 *     by `message.id` (parallel tool calls in one turn share an id, so their usage
 *     must not be double-counted).
 *   - `ingestSubagent(...)` attributes work done under a `parent_tool_use_id`.
 *   - `ingestToolCall({ name, success, durationMs, denied })` is fed from the
 *     native PostToolUse bridge and from `result.permission_denials`.
 *
 * `ingestResult` supersedes the current run's interim per-step sums: once the
 * authoritative `result.usage` lands, that run's contribution is replaced by it
 * (so estimates and actuals never double-count) and folded into the cumulative
 * lifetime totals. `tokens` is always the lifetime total across runs;
 * `lastRunTokens` holds the most recent run's authoritative breakdown.
 */

export class UsageTracker {
  constructor() {
    this.reset();
  }

  static _emptyTokens() {
    return { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
  }

  reset() {
    /** cumulative lifetime totals (completed runs + the in-flight run's interim sums) */
    this.tokens = UsageTracker._emptyTokens();
    /** most recent completed run's authoritative token breakdown */
    this.lastRunTokens = UsageTracker._emptyTokens();
    /** lifetime totals of completed runs only (the base interim sums add onto) */
    this._completed = UsageTracker._emptyTokens();
    this.apiCalls = 0;
    this.cost = 0;
    this.numTurns = null;
    /** per-model: tokens + call counts + latency stats */
    this.models = new Map();
    /** per-tool: calls, success, failure, denied, durations */
    this.tools = new Map();
    /** per-subagent (keyed by parent_tool_use_id): tokens, turns, messages */
    this.subagents = new Map();
    this.errors = { providerFailures: 0, rateLimited: 0, sessionErrors: 0 };
    this.latency = { ttftMs: [], callDurationMs: [] };
    this.contextWindow = null;
    /** message.id de-dup for interim per-step usage */
    this._seenMessageIds = new Set();
    /** message.id de-dup for subagent attribution */
    this._seenSubagentMessageIds = new Set();
    /** in-flight run's interim per-step token sums, superseded by its result.usage */
    this._interim = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  }

  /** Live totals = completed runs + the in-flight run's interim sums. */
  _syncLiveTotals() {
    this.tokens.input = this._completed.input + this._interim.input;
    this.tokens.output = this._completed.output + this._interim.output;
    this.tokens.cacheRead = this._completed.cacheRead + this._interim.cacheRead;
    this.tokens.cacheWrite = this._completed.cacheWrite + this._interim.cacheWrite;
    this.tokens.reasoning = this._completed.reasoning;
    this._recomputeTotal();
  }

  _model(name) {
    if (!this.models.has(name)) {
      this.models.set(name, { calls: 0, inputTokens: 0, outputTokens: 0, totalDurationMs: 0 });
    }
    return this.models.get(name);
  }

  _tool(name) {
    if (!this.tools.has(name)) {
      this.tools.set(name, { calls: 0, succeeded: 0, failed: 0, denied: 0, totalDurationMs: 0 });
    }
    return this.tools.get(name);
  }

  _subagent(key) {
    if (!this.subagents.has(key)) {
      this.subagents.set(key, { inputTokens: 0, outputTokens: 0, turns: 0, messages: 0 });
    }
    return this.subagents.get(key);
  }

  static _usageFields(u = {}) {
    return {
      input: u.input_tokens ?? u.inputTokens ?? 0,
      output: u.output_tokens ?? u.outputTokens ?? 0,
      cacheRead: u.cache_read_input_tokens ?? u.cacheReadInputTokens ?? 0,
      cacheWrite: u.cache_creation_input_tokens ?? u.cacheCreationInputTokens ?? 0,
    };
  }

  _recomputeTotal() {
    this.tokens.total = this.tokens.input + this.tokens.output;
  }

  /**
   * Fold an interim `assistant` message's usage, de-duped by `message.id`. Used
   * for real-time totals mid-run; superseded by `ingestResult` at run end.
   */
  ingestStepUsage(assistantMessage) {
    const msg = assistantMessage?.message ?? {};
    const id = msg.id;
    if (id != null && this._seenMessageIds.has(id)) return null;
    if (id != null) this._seenMessageIds.add(id);

    const f = UsageTracker._usageFields(msg.usage);
    this._interim.input += f.input;
    this._interim.output += f.output;
    this._interim.cacheRead += f.cacheRead;
    this._interim.cacheWrite += f.cacheWrite;
    // reflect interim into the live totals until the authoritative result lands
    this._syncLiveTotals();

    return { kind: 'tokens', inputTokens: f.input, outputTokens: f.output, model: msg.model ?? 'unknown' };
  }

  /**
   * Fold the terminal `result` message. Authoritative for its run: replaces the
   * run's interim per-step sums with `result.usage` and accumulates it into the
   * lifetime totals, then adds cost, modelUsage, num_turns, and latency.
   */
  ingestResult(result, meta = {}) {
    const f = UsageTracker._usageFields(result?.usage);
    const reasoning = meta.reasoningTokens ?? 0;

    // this run's authoritative breakdown, kept separately for per-run reporting
    this.lastRunTokens = {
      input: f.input,
      output: f.output,
      reasoning,
      cacheRead: f.cacheRead,
      cacheWrite: f.cacheWrite,
      total: f.input + f.output,
    };
    // accumulate into lifetime totals; the run's interim sums are superseded
    this._completed.input += f.input;
    this._completed.output += f.output;
    this._completed.reasoning += reasoning;
    this._completed.cacheRead += f.cacheRead;
    this._completed.cacheWrite += f.cacheWrite;
    this._interim = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    this._syncLiveTotals();

    this.apiCalls += 1;
    if (typeof result?.total_cost_usd === 'number') this.cost += result.total_cost_usd;
    if (typeof result?.num_turns === 'number') this.numTurns = result.num_turns;
    if (typeof meta.ttftMs === 'number') this.latency.ttftMs.push(meta.ttftMs);
    if (typeof meta.durationMs === 'number') this.latency.callDurationMs.push(meta.durationMs);

    // fold the per-model breakdown
    const modelUsage = result?.modelUsage ?? {};
    for (const [name, mu] of Object.entries(modelUsage)) {
      const mf = UsageTracker._usageFields(mu);
      const m = this._model(name);
      m.calls += 1;
      m.inputTokens += mf.input;
      m.outputTokens += mf.output;
      m.totalDurationMs += mu.durationMs ?? mu.duration_ms ?? 0;
    }
    if (!Object.keys(modelUsage).length && meta.model) {
      const m = this._model(meta.model);
      m.calls += 1;
      m.inputTokens += f.input;
      m.outputTokens += f.output;
      m.totalDurationMs += meta.durationMs ?? 0;
    }

    // fold denials reported by the runtime
    for (const denial of result?.permission_denials ?? []) {
      this.ingestToolCall({ name: denial.tool_name ?? denial.toolName ?? 'unknown', success: false, denied: true });
    }

    return { kind: 'tokens', inputTokens: f.input, outputTokens: f.output, model: meta.model ?? 'unknown' };
  }

  /**
   * Attribute an `assistant` message carrying a `parent_tool_use_id` to its
   * owning subagent bucket, de-duped by `message.id`.
   */
  ingestSubagent({ parentToolUseId, usage, messageId } = {}) {
    if (parentToolUseId == null) return null;
    const bucket = this._subagent(parentToolUseId);
    bucket.messages += 1;
    if (messageId != null && this._seenSubagentMessageIds.has(messageId)) return { kind: 'subagent', parentToolUseId };
    if (messageId != null) this._seenSubagentMessageIds.add(messageId);
    const f = UsageTracker._usageFields(usage);
    bucket.inputTokens += f.input;
    bucket.outputTokens += f.output;
    bucket.turns += 1;
    return { kind: 'subagent', parentToolUseId };
  }

  /**
   * Record one tool execution (from the native PostToolUse bridge or a denial).
   * @param {{ name: string, success?: boolean, durationMs?: number, denied?: boolean }} call
   */
  ingestToolCall({ name = 'unknown', success = true, durationMs = 0, denied = false } = {}) {
    const t = this._tool(name);
    t.calls += 1;
    t.totalDurationMs += Math.max(0, durationMs || 0);
    if (denied) t.denied += 1;
    if (success) t.succeeded += 1;
    else t.failed += 1;
    return { kind: 'tool:end', tool: name, success: !!success, durationMs, denied };
  }

  /** Record a provider/rate-limit error (e.g. from a caught SDK exception). */
  ingestError({ status = null, message = '' } = {}) {
    this.errors.providerFailures += 1;
    if (status === 429 || /rate.?limit/i.test(String(message))) this.errors.rateLimited += 1;
    return { kind: 'provider:error', status, message: String(message) };
  }

  /** Record a session-level (harness) error. */
  ingestSessionError(message) {
    this.errors.sessionErrors += 1;
    return { kind: 'session:error', message };
  }

  /** Record context-window utilization info. */
  ingestContextWindow(info) {
    this.contextWindow = { ...info };
    return { kind: 'context', ...info };
  }

  static _stats(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
    return {
      count: sorted.length,
      avg: Number((sum / sorted.length).toFixed(1)),
      p50: pct(50),
      p95: pct(95),
      max: sorted[sorted.length - 1],
    };
  }

  /** Full usage summary: tokens, tools, models, subagents, errors, latency. */
  summary() {
    return {
      tokens: { ...this.tokens },
      lastRunTokens: { ...this.lastRunTokens },
      apiCalls: this.apiCalls,
      cost: this.cost || null,
      numTurns: this.numTurns ?? null,
      models: Object.fromEntries(this.models),
      tools: Object.fromEntries(
        [...this.tools].map(([name, t]) => [name, {
          ...t,
          avgDurationMs: t.calls ? Number((t.totalDurationMs / t.calls).toFixed(1)) : 0,
        }]),
      ),
      subagents: Object.fromEntries(this.subagents),
      errors: { ...this.errors },
      latency: {
        ttftMs: UsageTracker._stats(this.latency.ttftMs),
        callDurationMs: UsageTracker._stats(this.latency.callDurationMs),
      },
      contextWindow: this.contextWindow,
    };
  }

  /** Human-readable single-string report. */
  report() {
    const s = this.summary();
    const lines = [
      '=== Claude Agent Harness Usage Summary ===',
      `tokens: ${s.tokens.total} total (${s.tokens.input} in / ${s.tokens.output} out, ` +
        `${s.tokens.reasoning} reasoning, cache ${s.tokens.cacheRead}r/${s.tokens.cacheWrite}w) ` +
        `across ${s.apiCalls} API call(s)`,
    ];
    if (s.numTurns != null) lines.push(`num_turns: ${s.numTurns}`);
    if (s.cost != null) lines.push(`est. cost: $${s.cost} (client-side estimate, not authoritative billing)`);
    if (s.latency.ttftMs) {
      lines.push(`TTFT ms: avg ${s.latency.ttftMs.avg} p95 ${s.latency.ttftMs.p95}`);
    }
    if (s.latency.callDurationMs) {
      lines.push(`call duration ms: avg ${s.latency.callDurationMs.avg} p95 ${s.latency.callDurationMs.p95}`);
    }
    const toolNames = Object.keys(s.tools);
    lines.push(toolNames.length
      ? `tools: ${toolNames.map((n) => {
        const t = s.tools[n];
        return `${n} x${t.calls} (${t.succeeded} ok / ${t.failed} fail, avg ${t.avgDurationMs}ms)`;
      }).join(', ')}`
      : 'tools: none');
    const subKeys = Object.keys(s.subagents);
    if (subKeys.length) {
      lines.push(`subagents: ${subKeys.map((k) => {
        const a = s.subagents[k];
        return `${k} (${a.turns} turns, ${a.inputTokens}in/${a.outputTokens}out)`;
      }).join(', ')}`);
    }
    if (s.errors.providerFailures || s.errors.sessionErrors) {
      lines.push(`errors: ${s.errors.providerFailures} provider (${s.errors.rateLimited} rate-limited), ` +
        `${s.errors.sessionErrors} session`);
    }
    if (s.contextWindow) {
      lines.push(`context window: ${s.contextWindow.currentTokens}/${s.contextWindow.tokenLimit} tokens, ` +
        `${s.contextWindow.messagesLength} messages`);
    }
    return lines.join('\n');
  }
}
