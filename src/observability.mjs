/**
 * SRE observability for the harness, built on OpenTelemetry.
 *
 * Harness-side golden signals — emitted via `@opentelemetry/api` when it is
 * installed (optional peer dep); everything degrades to no-ops when it isn't, so
 * the harness has zero hard observability dependencies.
 *
 * DEVIATION: the Agent SDK runtime subprocess has its own native OTel exporter,
 * but the harness does not configure it — only the harness-side instruments below
 * exist. `config.observability.otlpEndpoint` is recorded for reference but wires
 * nothing on the runtime.
 *
 * Golden signals covered (prefix `claude_agent_harness.*`):
 *   - Latency:    request.duration_ms (histogram), request.ttft_ms (histogram)
 *   - Traffic:    tokens (counter, attr direction=input|output|reasoning|cache_*)
 *                 requests (counter)
 *   - Errors:     errors (counter, attr kind=provider|rate_limit|session|harness)
 *   - Saturation: budget.utilization (gauge), context_window.utilization (gauge)
 *   - Tools:      tool.calls (counter, attrs tool, outcome), tool.duration_ms (histogram)
 */

let otelApi = null;
let otelLoadAttempted = false;

/** Load @opentelemetry/api if present. Cached after first attempt. */
export async function loadOtelApi() {
  if (otelLoadAttempted) return otelApi;
  otelLoadAttempted = true;
  try {
    otelApi = await import('@opentelemetry/api');
  } catch {
    otelApi = null;
  }
  return otelApi;
}

/** test seam */
export function _setOtelApiForTests(api) {
  otelApi = api;
  otelLoadAttempted = true;
}

/**
 * Translate harness observability config into a runtime TelemetryConfig.
 * Ported from `github-sdk/v300/src/observability.mjs` for interchange parity:
 * same signature and return shape. The Agent SDK runtime manages its own
 * telemetry (nothing here is handed to the spawned CLI), so callers receive
 * the mapped config for their own exporter wiring / reference.
 */
export function telemetryConfigFor(obsConfig) {
  if (!obsConfig?.enabled) return undefined;
  const cfg = {};
  if (obsConfig.otlpEndpoint) {
    cfg.otlpEndpoint = obsConfig.otlpEndpoint;
    cfg.exporterType = obsConfig.exporterType ?? 'otlp-http';
  }
  if (obsConfig.filePath) {
    cfg.filePath = obsConfig.filePath;
    cfg.exporterType = obsConfig.exporterType ?? 'file';
  }
  if (obsConfig.sourceName ?? obsConfig.serviceName) {
    cfg.sourceName = obsConfig.sourceName ?? obsConfig.serviceName;
  }
  if (obsConfig.captureContent != null) cfg.captureContent = obsConfig.captureContent;
  return Object.keys(cfg).length ? cfg : undefined;
}

/** Drop null/undefined/empty values so spans only carry populated gen_ai.* keys. */
export function genAiAttributes(attrs = {}) {
  const out = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (v != null && v !== '') out[k] = v;
  }
  return out;
}

const noop = () => {};
const NOOP_SPAN = {
  setAttribute: noop,
  setAttributes: noop,
  addEvent: noop,
  recordException: noop,
  setStatus: noop,
  end: noop,
};

export class Observability {
  /**
   * @param {object} obsConfig harness `config.observability`
   * @param {object} [deps] injected for tests: { api }; `providerName` default for gen_ai.provider.name
   */
  constructor(obsConfig = {}, deps = {}) {
    this.config = obsConfig;
    this.enabled = !!obsConfig.enabled;
    this._api = deps.api ?? null;
    this._tracer = null;
    this._instruments = null;
    this._budgetSnapshot = null;
    this._contextSnapshot = null;
    this._defaultProvider = deps.providerName ?? 'anthropic';
  }

  /** Initialize tracer/meter. Safe to call when OTel is absent. */
  async init() {
    if (!this.enabled) return this;
    const api = this._api ?? await loadOtelApi();
    if (!api) return this; // enabled but no OTel API installed → no-op metrics
    this._api = api;
    const name = this.config.serviceName ?? 'claude-agent-sdk-harness';
    this._tracer = api.trace.getTracer(name);
    const meter = api.metrics.getMeter(name);
    this._instruments = {
      requests: meter.createCounter('claude_agent_harness.requests', {
        description: 'Claude agent harness requests started',
      }),
      tokens: meter.createCounter('claude_agent_harness.tokens', {
        description: 'Tokens consumed, attr direction=input|output|reasoning|cache_read|cache_write',
      }),
      errors: meter.createCounter('claude_agent_harness.errors', {
        description: 'Errors, attr kind=provider|rate_limit|session|harness',
      }),
      duration: meter.createHistogram('claude_agent_harness.request.duration_ms', {
        description: 'Total request latency in ms',
        unit: 'ms',
      }),
      ttft: meter.createHistogram('claude_agent_harness.request.ttft_ms', {
        description: 'Time to first token in ms',
        unit: 'ms',
      }),
      toolCalls: meter.createCounter('claude_agent_harness.tool.calls', {
        description: 'Tool executions, attrs tool, outcome=success|failure|denied',
      }),
      toolDuration: meter.createHistogram('claude_agent_harness.tool.duration_ms', {
        description: 'Tool execution latency in ms',
        unit: 'ms',
      }),
    };
    meter.createObservableGauge('claude_agent_harness.budget.utilization', {
      description: 'Token budget utilization percent',
    }).addCallback((observable) => {
      if (this._budgetSnapshot?.maxTokens != null) {
        observable.observe(this._budgetSnapshot.utilizationPercent);
      }
    });
    meter.createObservableGauge('claude_agent_harness.context_window.utilization', {
      description: 'Context window utilization percent',
    }).addCallback((observable) => {
      const cw = this._contextSnapshot;
      if (cw?.tokenLimit) observable.observe((cw.currentTokens / cw.tokenLimit) * 100);
    });
    return this;
  }

  /**
   * Start a span (no-op span when tracing is unavailable).
   * @param {object} [opts] { kind: 'client' | 'internal' | 'server' | 'producer' | 'consumer' }
   */
  startSpan(name, attributes = {}, opts = {}) {
    if (!this._tracer) return NOOP_SPAN;
    const kind = opts.kind ? this._api?.SpanKind?.[String(opts.kind).toUpperCase()] : undefined;
    return this._tracer.startSpan(name, kind == null ? { attributes } : { kind, attributes });
  }

  /** Run `fn` inside a span, recording exceptions and ending it. */
  async withSpan(name, attributes, fn, opts = {}) {
    const span = this.startSpan(name, attributes, opts);
    if (!this._api || span === NOOP_SPAN) {
      try {
        return await fn(span);
      } finally {
        span.end();
      }
    }
    const api = this._api;
    const ctx = api.trace.setSpan(api.context.active(), span);
    try {
      return await api.context.with(ctx, () => fn(span));
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: api.SpanStatusCode.ERROR, message: String(err?.message ?? err) });
      throw err;
    } finally {
      span.end();
    }
  }

  /* ---------------------------------------------------------- *
   * OpenTelemetry GenAI semantic conventions (gen_ai.*, v1.42+)
   * ---------------------------------------------------------- */

  /** `gen_ai.provider.name` for spans; `observability.providerName` overrides. */
  get providerName() {
    return this.config.providerName ?? this._defaultProvider;
  }

  /** Whether prompt/completion content may be attached (span events only). */
  get captureContent() {
    return this.config.captureContent === true;
  }

  /**
   * Root agent span: `invoke_agent {agentName}` (CLIENT). Usage attributes are
   * set by the caller via `setGenAiUsage(span, usage)` once known.
   */
  invokeAgentSpan(info, fn) {
    const { name, attributes, opts } = this._invokeAgentSpec(info);
    return this.withSpan(name, attributes, fn, opts);
  }

  /** Model inference child span: `chat {model}` (CLIENT). */
  chatSpan(info, fn) {
    const { name, attributes, opts } = this._chatSpec(info);
    return this.withSpan(name, attributes, fn, opts);
  }

  /** Tool execution child span: `execute_tool {bareToolName}` (INTERNAL). */
  toolSpan(info, fn) {
    const { name, attributes, opts } = this._toolSpec(info);
    return this.withSpan(name, attributes, fn, opts);
  }

  /**
   * Manually-ended variants for spans that cannot wrap a single callback (async
   * generators, native pre/post hook pairs). Close them with `endSpan()`.
   */
  startInvokeAgentSpan(info) {
    const { name, attributes, opts } = this._invokeAgentSpec(info);
    return this.startSpan(name, attributes, opts);
  }

  startChatSpan(info) {
    const { name, attributes, opts } = this._chatSpec(info);
    return this.startSpan(name, attributes, opts);
  }

  startToolSpan(info) {
    const { name, attributes, opts } = this._toolSpec(info);
    return this.startSpan(name, attributes, opts);
  }

  /** End a manually-started span, marking it errored when `error` is given. */
  endSpan(span, error) {
    if (!span) return;
    if (error) {
      span.recordException?.(error);
      const code = this._api?.SpanStatusCode?.ERROR;
      if (code != null) span.setStatus?.({ code, message: String(error?.message ?? error) });
    }
    span.end?.();
  }

  _invokeAgentSpec({ agentName, sessionId, model } = {}) {
    const name = agentName || 'harness';
    return {
      name: `invoke_agent ${name}`,
      attributes: genAiAttributes({
        'gen_ai.operation.name': 'invoke_agent',
        'gen_ai.provider.name': this.providerName,
        'gen_ai.agent.name': name,
        'gen_ai.conversation.id': sessionId,
        'gen_ai.request.model': model,
      }),
      opts: { kind: 'client' },
    };
  }

  _chatSpec({ model, sessionId } = {}) {
    return {
      name: `chat ${model ?? 'unknown'}`,
      attributes: genAiAttributes({
        'gen_ai.operation.name': 'chat',
        'gen_ai.provider.name': this.providerName,
        'gen_ai.request.model': model,
        'gen_ai.conversation.id': sessionId,
      }),
      opts: { kind: 'client' },
    };
  }

  _toolSpec({ toolName, toolUseId, toolType = 'custom' } = {}) {
    return {
      name: `execute_tool ${toolName}`,
      attributes: genAiAttributes({
        'gen_ai.operation.name': 'execute_tool',
        'gen_ai.tool.name': toolName,
        'gen_ai.tool.call.id': toolUseId,
        'gen_ai.tool.type': toolType,
      }),
      opts: { kind: 'internal' },
    };
  }

  /**
   * Set `gen_ai.usage.*` / response attributes on a span. `ttftMs` is converted
   * to seconds for `gen_ai.response.time_to_first_chunk`.
   */
  setGenAiUsage(span, usage = {}, { responseModel, ttftMs } = {}) {
    span?.setAttributes?.(genAiAttributes({
      'gen_ai.response.model': responseModel,
      'gen_ai.usage.input_tokens': usage.inputTokens,
      'gen_ai.usage.output_tokens': usage.outputTokens,
      'gen_ai.usage.reasoning.output_tokens': usage.reasoningTokens,
      'gen_ai.response.time_to_first_chunk': ttftMs != null ? ttftMs / 1000 : undefined,
    }));
  }

  /**
   * Content capture (opt-in, `observability.captureContent: true`). Content is
   * never written to indexed span attributes — only to this span event.
   */
  recordContent(span, { input, output } = {}) {
    if (!this.captureContent) return;
    span?.addEvent?.('gen_ai.client.inference.operation.details', genAiAttributes({
      'gen_ai.input.messages': input != null ? JSON.stringify(input) : undefined,
      'gen_ai.output.messages': output != null ? JSON.stringify(output) : undefined,
    }));
  }

  recordRequestStart(attrs = {}) {
    this._instruments?.requests.add(1, attrs);
  }

  recordRequestEnd({ durationMs, ttftMs, model } = {}) {
    if (!this._instruments) return;
    const attrs = model ? { model } : {};
    if (durationMs != null) this._instruments.duration.record(durationMs, attrs);
    if (ttftMs != null) this._instruments.ttft.record(ttftMs, attrs);
  }

  recordTokens({ inputTokens = 0, outputTokens = 0, reasoningTokens = 0, cacheReadTokens = 0, cacheWriteTokens = 0, model } = {}) {
    if (!this._instruments) return;
    const base = model ? { model } : {};
    const add = (n, direction) => {
      if (n > 0) this._instruments.tokens.add(n, { ...base, direction });
    };
    add(inputTokens, 'input');
    add(outputTokens, 'output');
    add(reasoningTokens, 'reasoning');
    add(cacheReadTokens, 'cache_read');
    add(cacheWriteTokens, 'cache_write');
  }

  recordToolCall({ tool, outcome, durationMs } = {}) {
    if (!this._instruments) return;
    this._instruments.toolCalls.add(1, { tool, outcome });
    if (durationMs != null) this._instruments.toolDuration.record(durationMs, { tool });
  }

  recordError(kind, attrs = {}) {
    this._instruments?.errors.add(1, { kind, ...attrs });
  }

  /** Keep gauges fresh. */
  observeBudget(snapshot) {
    this._budgetSnapshot = snapshot;
  }

  observeContextWindow(usageInfo) {
    this._contextSnapshot = usageInfo;
  }

  /**
   * Ingest a normalized usage record (output of UsageTracker.ingest*) so golden
   * signals stay in sync with the harness's own accounting.
   *
   * @param {object} record normalized record (kind: tokens|tool:end|provider:error|session:error|context)
   * @param {object} [raw]  extra context (e.g. the full usage + latency)
   */
  ingest(record, raw = {}) {
    if (!record) return;
    switch (record.kind) {
      case 'tokens': {
        const u = raw.usage ?? {};
        this.recordTokens({
          inputTokens: record.inputTokens,
          outputTokens: record.outputTokens,
          reasoningTokens: raw.reasoningTokens ?? 0,
          cacheReadTokens: u.cache_read_input_tokens ?? u.cacheReadInputTokens ?? 0,
          cacheWriteTokens: u.cache_creation_input_tokens ?? u.cacheCreationInputTokens ?? 0,
          model: record.model,
        });
        this.recordRequestEnd({ durationMs: raw.durationMs, ttftMs: raw.ttftMs, model: record.model });
        break;
      }
      case 'tool:end':
        this.recordToolCall({
          tool: record.tool,
          outcome: record.denied ? 'denied' : (record.success ? 'success' : 'failure'),
          durationMs: record.durationMs,
        });
        break;
      case 'provider:error':
        this.recordError(record.status === 429 ? 'rate_limit' : 'provider', {
          status: record.status ?? 'unknown',
        });
        break;
      case 'session:error':
        this.recordError('session');
        break;
      case 'context':
        this.observeContextWindow(raw ?? record);
        break;
      default:
        break;
    }
  }
}
