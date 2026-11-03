/**
 * Harness configuration: defaults < config file < environment < overrides.
 *
 * Every knob the harness exposes lives here so callers have one place to reason
 * about precedence. `loadConfig()` is pure given its inputs (pass a custom `env`
 * for tests).
 *
 * Retargeted from the Anthropic Messages API harness (`claude-sdk/v100`) to the
 * **Claude Agent SDK**: the stateless-client knobs (apiKey/authToken/baseURL/
 * timeout/maxRetries/betas/maxTokens) are replaced by the Agent SDK `Options`
 * surface (model/effort/permissionMode/allowedTools/disallowedTools/maxTurns/
 * cwd/env/settingSources/mcpServers/pathToClaudeCodeExecutable/systemPrompt).
 * Auth is resolved from the environment by `runtime.mjs`, not folded in here.
 * See README "Mapping & deviations".
 */

import fs from 'node:fs';
import path from 'node:path';

/** Reasoning effort levels accepted by the Agent SDK. */
export const EFFORT = ['low', 'medium', 'high', 'xhigh', 'max'];

/**
 * Canonical constant name shared with the sibling harnesses (interchange
 * contract). Alias of `EFFORT` — same array, both stay exported.
 */
export const REASONING_EFFORTS = EFFORT;

/**
 * Thinking modes accepted by the Messages API sibling's `thinking` config.
 * Inert here (the Agent SDK runtime manages thinking itself) — exported for
 * interchange parity so a swapped config validates identically.
 */
export const THINKING_TYPES = ['adaptive', 'disabled'];

/** Permission modes accepted by the Agent SDK `permissionMode` option. */
export const PERMISSION_MODES = ['default', 'acceptEdits', 'plan', 'bypassPermissions'];

/**
 * @param {NodeJS.ProcessEnv} [env] environment consulted for default values
 * @returns {object} deep copy of the harness defaults
 */
export function defaultConfig(env = process.env) {
  return {
    // --- model behavior (Agent SDK Options) ---
    model: env.CLAUDE_AGENT_MODEL ?? 'claude-opus-4-8',
    effort: env.CLAUDE_AGENT_EFFORT ?? 'low',
    permissionMode: 'default',
    allowedTools: [],
    disallowedTools: [],
    maxTurns: 10,

    // --- runtime wiring ---
    cwd: null,
    env: null,                       // extra env for the SDK subprocess
    settingSources: [],              // [] means "load no filesystem settings"
    mcpServers: {},                  // { name: McpServerConfig } (stdio/http/sse)
    pathToClaudeCodeExecutable: null,

    // --- extensibility (Epic 04) ---
    agents: {},                      // { name: AgentDefinition } → options.agents
    permissions: { allow: [], deny: [] }, // canUseTool policy patterns
    autoAllowMcp: false,             // auto-allowlist mcp__<server>__* per configured server
    nativeHooks: {},                 // raw options.hooks matchers concatenated onto the bridge
    hookTimeoutMs: null,             // per-native-hook timeout

    // --- system prompt / instruction document ---
    systemPrompt: null,              // inline instruction text
    systemPromptFile: null,          // path to an instruction document
    systemPromptMode: 'append',      // 'append' (preset+append) | 'replace' (raw string)
    systemPromptPreset: 'claude_code', // preset layered under append-mode text

    // --- token budget ---
    tokenBudget: {
      maxTokens: null,               // total tokens (input+output) allowed across lifetime
      warnAtPercent: 80,
      enforcement: 'block',          // 'block' | 'warn'
    },

    // --- context window persistence ---
    contextStore: {
      enabled: false,
      directory: '.claude-agent-harness/context',
    },

    // --- SRE observability (harness-side OpenTelemetry) ---
    observability: {
      enabled: false,
      serviceName: 'claude-agent-sdk-harness',
      otlpEndpoint: null,
      exporterType: null,
      filePath: null,
      captureContent: false,
    },

    // --- structured output ---
    structured: {
      maxRepairAttempts: 2,          // re-ask the model this many times on invalid JSON
      native: false,                 // use an in-process structured-output tool instead of prompt+repair
    },

    // passthrough merged into the final `Options` object (escape hatch)
    requestDefaults: {},
  };
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Recursive merge: plain objects merge, everything else replaces. */
export function mergeConfig(base, ...layers) {
  const out = structuredClone(base);
  for (const layer of layers) {
    if (!layer) continue;
    for (const [key, value] of Object.entries(layer)) {
      if (value === undefined) continue;
      if (isPlainObject(value) && isPlainObject(out[key])) {
        out[key] = mergeConfig(out[key], value);
      } else {
        out[key] = structuredClone(value);
      }
    }
  }
  return out;
}

/** Map recognized environment variables onto a config layer. */
export function configFromEnv(env = process.env) {
  const layer = {};
  // Canonical cross-harness names (interchange contract §4) are read first so
  // the provider-prefixed names below keep precedence when both are set. The
  // canonical `reasoningEffort` maps onto this harness's native `effort`;
  // `maxTokens` is accepted for parity (the Agent SDK caps by turns, not
  // response tokens — the key is inert here).
  if (env.LLM_SDK_MODEL) layer.model = env.LLM_SDK_MODEL;
  if (env.LLM_SDK_REASONING_EFFORT) layer.effort = env.LLM_SDK_REASONING_EFFORT;
  if (env.LLM_SDK_MAX_TOKENS) layer.maxTokens = Number(env.LLM_SDK_MAX_TOKENS);
  if (env.LLM_SDK_SYSTEM_PROMPT_FILE) layer.systemPromptFile = env.LLM_SDK_SYSTEM_PROMPT_FILE;
  if (env.LLM_SDK_TOKEN_BUDGET) {
    layer.tokenBudget = { maxTokens: Number(env.LLM_SDK_TOKEN_BUDGET) };
  }
  if (env.LLM_SDK_STORE_DIR) {
    layer.contextStore = { enabled: true, directory: env.LLM_SDK_STORE_DIR };
  }
  if (env.CLAUDE_AGENT_MODEL) layer.model = env.CLAUDE_AGENT_MODEL;
  if (env.CLAUDE_AGENT_EFFORT) layer.effort = env.CLAUDE_AGENT_EFFORT;
  if (env.CLAUDE_AGENT_PERMISSION_MODE) layer.permissionMode = env.CLAUDE_AGENT_PERMISSION_MODE;
  if (env.CLAUDE_AGENT_SYSTEM_PROMPT_FILE) layer.systemPromptFile = env.CLAUDE_AGENT_SYSTEM_PROMPT_FILE;
  if (env.CLAUDE_AGENT_EXECUTABLE) layer.pathToClaudeCodeExecutable = env.CLAUDE_AGENT_EXECUTABLE;
  if (env.CLAUDE_AGENT_TOKEN_BUDGET) {
    layer.tokenBudget = { maxTokens: Number(env.CLAUDE_AGENT_TOKEN_BUDGET) };
  }
  if (env.CLAUDE_AGENT_STORE_DIR) {
    layer.contextStore = { enabled: true, directory: env.CLAUDE_AGENT_STORE_DIR };
  }
  if (env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    layer.observability = { otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT };
  }
  return layer;
}

/** Read a JSON config file. Returns {} when `file` is falsy. */
export function loadConfigFile(file) {
  if (!file) return {};
  const abs = path.resolve(file);
  let raw;
  try {
    raw = fs.readFileSync(abs, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read harness config file ${abs}: ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in harness config file ${abs}: ${err.message}`);
  }
}

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Throw a ConfigError when a config value is out of range. */
export function validateConfig(config) {
  const problems = [];
  if (config.effort && !EFFORT.includes(config.effort)) {
    problems.push(`effort must be one of ${EFFORT.join(', ')} (got "${config.effort}")`);
  }
  if (config.permissionMode && !PERMISSION_MODES.includes(config.permissionMode)) {
    problems.push(
      `permissionMode must be one of ${PERMISSION_MODES.join(', ')} (got "${config.permissionMode}")`,
    );
  }
  if (config.model != null && typeof config.model !== 'string') {
    problems.push('model must be a string');
  }
  if (config.maxTurns != null && (!Number.isFinite(config.maxTurns) || config.maxTurns <= 0)) {
    problems.push(`maxTurns must be a positive number (got ${config.maxTurns})`);
  }
  for (const key of ['allowedTools', 'disallowedTools', 'settingSources']) {
    if (config[key] != null && !Array.isArray(config[key])) {
      problems.push(`${key} must be an array`);
    }
  }
  const max = config.tokenBudget?.maxTokens;
  if (max != null && (!Number.isFinite(max) || max <= 0)) {
    problems.push(`tokenBudget.maxTokens must be a positive number (got ${max})`);
  }
  const warnAt = config.tokenBudget?.warnAtPercent;
  if (warnAt != null && (warnAt < 0 || warnAt > 100)) {
    problems.push(`tokenBudget.warnAtPercent must be 0-100 (got ${warnAt})`);
  }
  if (config.tokenBudget?.enforcement
      && !['block', 'warn'].includes(config.tokenBudget.enforcement)) {
    problems.push("tokenBudget.enforcement must be 'block' or 'warn'");
  }
  if (!['append', 'replace'].includes(config.systemPromptMode)) {
    problems.push("systemPromptMode must be 'append' or 'replace'");
  }
  if (config.systemPromptFile && !fs.existsSync(config.systemPromptFile)) {
    problems.push(`systemPromptFile does not exist: ${config.systemPromptFile}`);
  }
  validateMcpServers(config.mcpServers, problems);
  validateAgents(config.agents, problems);
  validatePermissions(config.permissions, problems);
  if (problems.length) {
    throw new ConfigError(`Invalid harness config:\n  - ${problems.join('\n  - ')}`);
  }
  return config;
}

/** Validate `config.mcpServers` as Record<name, McpServerConfig> (stdio/http/sse). */
function validateMcpServers(mcpServers, problems) {
  if (mcpServers == null) return;
  if (!isPlainObject(mcpServers)) { problems.push('mcpServers must be an object'); return; }
  for (const [name, srv] of Object.entries(mcpServers)) {
    if (!isPlainObject(srv)) { problems.push(`mcpServers.${name} must be an object`); continue; }
    if (srv.type === 'sdk' || srv.mcp_server || srv.instance) continue; // in-process, pass-through
    if (srv.type === 'http' || srv.type === 'sse') {
      if (typeof srv.url !== 'string') problems.push(`mcpServers.${name}: ${srv.type} server requires a string url`);
    } else if ('command' in srv || srv.type === 'stdio' || srv.type == null) {
      if (typeof srv.command !== 'string') problems.push(`mcpServers.${name}: stdio server requires a string command`);
    } else {
      problems.push(`mcpServers.${name}: unknown server type "${srv.type}"`);
    }
  }
}

/** Validate `config.agents` as Record<name, AgentDefinition>. */
function validateAgents(agents, problems) {
  if (agents == null) return;
  if (!isPlainObject(agents)) { problems.push('agents must be an object'); return; }
  const allowedKeys = new Set(['description', 'prompt', 'tools', 'model', 'effort', 'permissionMode', 'maxTurns']);
  for (const [name, agent] of Object.entries(agents)) {
    if (!isPlainObject(agent)) { problems.push(`agents.${name} must be an object`); continue; }
    if (typeof agent.description !== 'string') problems.push(`agents.${name}.description is required (string)`);
    if (typeof agent.prompt !== 'string') problems.push(`agents.${name}.prompt is required (string)`);
    if (agent.effort != null && !EFFORT.includes(agent.effort)) {
      problems.push(`agents.${name}.effort must be one of ${EFFORT.join(', ')}`);
    }
    if (agent.permissionMode != null && !PERMISSION_MODES.includes(agent.permissionMode)) {
      problems.push(`agents.${name}.permissionMode must be one of ${PERMISSION_MODES.join(', ')}`);
    }
    if (agent.tools != null && !Array.isArray(agent.tools)) problems.push(`agents.${name}.tools must be an array`);
    if (agent.maxTurns != null && (!Number.isFinite(agent.maxTurns) || agent.maxTurns <= 0)) {
      problems.push(`agents.${name}.maxTurns must be a positive number`);
    }
    for (const key of Object.keys(agent)) {
      if (!allowedKeys.has(key)) problems.push(`agents.${name}: unknown key "${key}"`);
    }
  }
}

/** Validate `config.permissions` as { allow: string[], deny: string[] }. */
function validatePermissions(permissions, problems) {
  if (permissions == null) return;
  if (!isPlainObject(permissions)) { problems.push('permissions must be an object'); return; }
  for (const key of ['allow', 'deny']) {
    if (permissions[key] != null && (!Array.isArray(permissions[key]) || permissions[key].some((p) => typeof p !== 'string'))) {
      problems.push(`permissions.${key} must be an array of strings`);
    }
  }
}

/**
 * Interchange-contract alias: the canonical config key is `reasoningEffort`
 * (the sibling harnesses' name); this harness's native key is `effort`. A
 * layer that sets `reasoningEffort` without an explicit `effort` gets the
 * value mirrored onto `effort` — layer-by-layer, so an explicit native
 * `effort` in the same layer always wins.
 */
function normalizeSharedKeys(layer) {
  if (!layer || layer.reasoningEffort == null || layer.effort != null) return layer;
  return { ...layer, effort: layer.reasoningEffort };
}

/**
 * Build the effective harness config.
 *
 * @param {object} [opts]
 * @param {string} [opts.configFile] JSON config file path
 * @param {object} [opts.overrides]  programmatic overrides (highest precedence)
 * @param {NodeJS.ProcessEnv} [opts.env] environment to consult
 */
export function loadConfig(opts = {}) {
  const { configFile, overrides, env = process.env } = opts;
  const config = mergeConfig(
    defaultConfig(env),
    normalizeSharedKeys(loadConfigFile(configFile)),
    configFromEnv(env),
    normalizeSharedKeys(overrides),
  );
  return validateConfig(config);
}

/**
 * Resolve the effective system-prompt value in the shape the Agent SDK expects.
 *
 * The Agent SDK accepts `systemPrompt` as a raw string (full replacement) OR as
 * `{ type: 'preset', preset: 'claude_code', append }` (layer harness text on top
 * of the Claude Code system prompt). Returns:
 *   - `null` when no prompt text is configured (SDK's default preset applies);
 *   - the raw string in `replace` mode;
 *   - the preset object in `append` mode.
 */
export function resolveSystemPrompt(config) {
  let text = null;
  if (config.systemPrompt) {
    text = config.systemPrompt;
  } else if (config.systemPromptFile) {
    text = fs.readFileSync(path.resolve(config.systemPromptFile), 'utf8');
  }
  if (text == null) return null;

  if (config.systemPromptMode === 'replace') return text;
  return {
    type: 'preset',
    preset: config.systemPromptPreset ?? 'claude_code',
    append: text,
  };
}

/**
 * Translate a validated harness config into the exact `Options` object the Agent
 * SDK's `query()` consumes. Only present values are set; harness-only knobs
 * (tokenBudget/contextStore/observability/structured/systemPromptFile/…) are NOT
 * forwarded. `requestDefaults` is spread last as a raw-Options escape hatch.
 */
export function buildQueryOptions(config) {
  const options = {};
  if (config.model != null) options.model = config.model;
  if (config.effort != null) options.effort = config.effort;
  if (config.maxTurns != null) options.maxTurns = config.maxTurns;
  if (config.permissionMode != null) options.permissionMode = config.permissionMode;
  if (Array.isArray(config.allowedTools) && config.allowedTools.length) {
    options.allowedTools = config.allowedTools;
  }
  if (Array.isArray(config.disallowedTools) && config.disallowedTools.length) {
    options.disallowedTools = config.disallowedTools;
  }
  if (config.cwd != null) options.cwd = config.cwd;
  if (config.env != null) options.env = config.env;
  // settingSources is always emitted — an empty array is meaningful ("load no
  // filesystem settings"), so it must reach the SDK even when empty.
  options.settingSources = config.settingSources ?? [];
  if (config.pathToClaudeCodeExecutable != null) {
    options.pathToClaudeCodeExecutable = config.pathToClaudeCodeExecutable;
  }
  if (config.mcpServers && Object.keys(config.mcpServers).length) {
    options.mcpServers = config.mcpServers;
  }
  const systemPrompt = resolveSystemPrompt(config);
  if (systemPrompt != null) options.systemPrompt = systemPrompt;

  return { ...options, ...(config.requestDefaults ?? {}) };
}
