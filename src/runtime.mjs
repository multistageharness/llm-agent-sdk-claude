/**
 * Runtime wiring for the Claude Agent SDK.
 *
 * The Agent SDK spawns the Claude Code CLI as a subprocess, so the harness must
 * (a) locate that executable deterministically, (b) confirm credentials exist in
 * the environment before spawning, and (c) hand callers a `query()` bound to the
 * mapped harness options — with a `queryImpl` seam so the whole test suite runs
 * offline against a mock stream, never a real subprocess.
 *
 * The module-resolution helpers are adapted from the Copilot harness
 * (`github-sdk/v300/src/cli-path.mjs`), retargeted to `@anthropic-ai/claude-agent-sdk`
 * (the CLI ships inside the SDK package).
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { buildQueryOptions } from './config.mjs';

/** Candidate package names, most specific first. */
export const DEFAULT_CANDIDATES = ['@anthropic-ai/claude-agent-sdk'];

/**
 * Error codes meaning "Node produced no entry path" — package absent, or
 * installed but its `exports` map blocks resolution. All degrade to the manual
 * walk instead of throwing.
 */
const NOT_RESOLVABLE = new Set([
  'MODULE_NOT_FOUND',
  'ERR_MODULE_NOT_FOUND',
  'ERR_PACKAGE_PATH_NOT_EXPORTED',
  'ERR_UNSUPPORTED_DIR_IMPORT',
]);

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Best-effort entry file for a package whose `exports` blocks native resolution:
 * read its package.json and probe main / module / bin / index.js.
 * @param {string} dir package root
 * @returns {string|null}
 */
export function readManifestEntry(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    const rels = [];
    if (typeof pkg.main === 'string') rels.push(pkg.main);
    if (typeof pkg.module === 'string') rels.push(pkg.module);
    if (typeof pkg.bin === 'string') rels.push(pkg.bin);
    else if (pkg.bin && typeof pkg.bin === 'object') {
      const first = Object.values(pkg.bin).find((v) => typeof v === 'string');
      if (first) rels.push(first);
    }
    rels.push('cli.js', 'index.js');
    for (const rel of rels) {
      const abs = path.join(dir, rel);
      if (isFile(abs)) return abs;
    }
  } catch {
    // missing/unreadable manifest — fall through
  }
  return null;
}

/**
 * Resolve a module's entry file natively, anchored at `fromDir`.
 * @param {string} moduleName
 * @param {{ fromDir?: string }} [opts]
 * @returns {string|null}
 */
export function resolveModuleEntry(moduleName, opts = {}) {
  const fromDir = path.resolve(opts.fromDir || process.cwd());
  const require = createRequire(path.join(fromDir, 'noop.cjs'));
  try {
    return require.resolve(moduleName);
  } catch (err) {
    if (err && NOT_RESOLVABLE.has(err.code)) return null;
    throw err;
  }
}

/**
 * Derive the package root directory from a resolved entry file.
 * @param {string} moduleName
 * @param {string|null} entry
 * @param {{ fromDir?: string }} [opts]
 * @returns {string|null}
 */
export function packageRootFromEntry(moduleName, entry, opts = {}) {
  if (!entry) return null;
  const marker = path.join('node_modules', ...moduleName.split('/'));
  const idx = entry.lastIndexOf(marker);
  if (idx !== -1) return entry.slice(0, idx + marker.length);
  try {
    const fromDir = path.resolve(opts.fromDir || process.cwd());
    const require = createRequire(path.join(fromDir, 'noop.cjs'));
    return path.dirname(require.resolve(`${moduleName}/package.json`));
  } catch {
    return null;
  }
}

/**
 * Manually walk up the directory tree looking for `node_modules/<name>`.
 * @param {string} moduleName
 * @param {{ fromDir?: string }} [opts]
 * @returns {string|null}
 */
export function findClosestModuleDir(moduleName, opts = {}) {
  const segments = moduleName.split('/');
  let dir = path.resolve(opts.fromDir || process.cwd());
  const root = path.parse(dir).root;
  while (true) {
    const candidate = path.join(dir, 'node_modules', ...segments);
    if (isDir(candidate)) return candidate;
    if (dir === root) return null;
    dir = path.dirname(dir);
  }
}

/** Locate the installed SDK package root (native resolution, then manual walk). */
function findSdkDir(fromDir) {
  const hereDir = path.dirname(fileURLToPath(import.meta.url));
  // an explicit fromDir is authoritative; otherwise search from this package, then cwd
  const anchors = fromDir ? [fromDir] : [hereDir, process.cwd()];
  for (const anchor of anchors) {
    for (const name of DEFAULT_CANDIDATES) {
      const entry = resolveModuleEntry(name, { fromDir: anchor });
      const dir = entry
        ? packageRootFromEntry(name, entry, { fromDir: anchor })
        : findClosestModuleDir(name, { fromDir: anchor });
      if (dir) return dir;
    }
  }
  return null;
}

/** Look for an executable `claude` on the PATH. */
function findOnPath(env) {
  const PATH = env.PATH ?? env.Path ?? '';
  if (!PATH) return null;
  const isWin = process.platform === 'win32';
  const names = isWin ? ['claude.cmd', 'claude.exe', 'claude'] : ['claude'];
  for (const entry of PATH.split(path.delimiter)) {
    if (!entry) continue;
    for (const name of names) {
      const candidate = path.join(entry, name);
      if (isFile(candidate)) return path.resolve(candidate);
    }
  }
  return null;
}

/**
 * Resolve the Claude Code executable the Agent SDK subprocess needs. Precedence:
 *   1. `config.pathToClaudeCodeExecutable` (validated as an existing file).
 *   2. `env.CLAUDE_AGENT_EXECUTABLE` (validated as an existing file).
 *   3. The CLI bundled inside `@anthropic-ai/claude-agent-sdk`.
 *   4. A `PATH` walk for an executable `claude`.
 *
 * @param {object} [opts]
 * @param {object} [opts.config]
 * @param {NodeJS.ProcessEnv} [opts.env]
 * @param {string} [opts.fromDir] anchor for module resolution
 * @param {boolean} [opts.required] throw when nothing resolves (default true)
 * @returns {string|null}
 */
export function resolveExecutablePath({ config = {}, env = process.env, fromDir, required = true } = {}) {
  const explicit = config.pathToClaudeCodeExecutable;
  if (explicit) {
    if (!isFile(explicit)) {
      throw new Error(`pathToClaudeCodeExecutable does not exist or is not a file: ${explicit}`);
    }
    return path.resolve(explicit);
  }

  if (env.CLAUDE_AGENT_EXECUTABLE) {
    if (!isFile(env.CLAUDE_AGENT_EXECUTABLE)) {
      throw new Error(
        `CLAUDE_AGENT_EXECUTABLE does not exist or is not a file: ${env.CLAUDE_AGENT_EXECUTABLE}`,
      );
    }
    return path.resolve(env.CLAUDE_AGENT_EXECUTABLE);
  }

  const sdkDir = findSdkDir(fromDir);
  if (sdkDir) {
    // the SDK ships Claude Code as cli.js; its manifest `main` (sdk.mjs) is the
    // library itself, which exits silently when spawned as the executable
    const cli = path.join(sdkDir, 'cli.js');
    if (isFile(cli)) return cli;
    const entry = readManifestEntry(sdkDir);
    if (entry) return entry;
  }

  const onPath = findOnPath(env);
  if (onPath) return onPath;

  if (required) {
    throw new Error(
      'Claude Code executable not found. Set pathToClaudeCodeExecutable, set '
      + 'CLAUDE_AGENT_EXECUTABLE, or install @anthropic-ai/claude-agent-sdk.',
    );
  }
  return null;
}

/**
 * Confirm credentials are available in the environment before spawning the SDK
 * subprocess. Returns `{ mode }` for the first match — never the secret value.
 *   ANTHROPIC_API_KEY → 'api-key'
 *   CLAUDE_CODE_USE_BEDROCK → 'bedrock'
 *   CLAUDE_CODE_USE_VERTEX → 'vertex'
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ required?: boolean }} [opts] set required:false to probe without throwing
 * @returns {{ mode: string|null }}
 */
export function resolveAuth(env = process.env, { required = true } = {}) {
  if (env.ANTHROPIC_API_KEY) return { mode: 'api-key' };
  if (env.CLAUDE_CODE_USE_BEDROCK) return { mode: 'bedrock' };
  if (env.CLAUDE_CODE_USE_VERTEX) return { mode: 'vertex' };
  if (required) {
    throw new Error(
      'No Claude auth found. Set ANTHROPIC_API_KEY, or CLAUDE_CODE_USE_BEDROCK, or '
      + 'CLAUDE_CODE_USE_VERTEX.',
    );
  }
  return { mode: null };
}

/** Lazily import the real `query` from the SDK (skipped when a mock is injected). */
async function loadRealQuery() {
  const sdk = await import('@anthropic-ai/claude-agent-sdk');
  return sdk.query ?? sdk.default?.query ?? sdk.default;
}

/* ------------------------------------------------------------------ *
 * In-process SDK MCP tooling (tool() + createSdkMcpServer()).
 *
 * The real SDK provides these; offline/tests fall back to dependency-free
 * plain-object builders so `registerTool()` and `_buildMcpServers()` remain
 * inspectable without spawning a subprocess or requiring zod. See README
 * "Mapping & deviations".
 * ------------------------------------------------------------------ */

/** Fallback `tool()`: a plain SdkMcpToolDefinition-shaped object. */
export function fallbackTool(name, description, inputSchema, handler) {
  return { name, description, inputSchema, handler };
}

/** Fallback `createSdkMcpServer()`: a plain sdk-type McpServerConfig. */
export function fallbackCreateSdkMcpServer({ name = 'harness', version = '0.1.0', tools = [] } = {}) {
  return { type: 'sdk', name, version, mcp_server: { name, version, tools } };
}

/**
 * Resolve `{ tool, createSdkMcpServer, zod }` from the SDK, or dependency-free
 * fallbacks. `zod` is the SDK's peer dependency: the real `tool()` needs a zod
 * raw shape for its input schema (see jsonSchemaToZodShape); it is null when
 * not installed.
 */
export async function loadSdkTooling() {
  let zod = null;
  try {
    const mod = await import('zod');
    zod = mod.z ?? mod.default ?? mod;
  } catch {
    // zod not installed: custom tools cannot be declared to the real SDK
  }
  try {
    const sdk = await import('@anthropic-ai/claude-agent-sdk');
    return {
      tool: sdk.tool ?? fallbackTool,
      createSdkMcpServer: sdk.createSdkMcpServer ?? fallbackCreateSdkMcpServer,
      zod,
    };
  } catch {
    return { tool: fallbackTool, createSdkMcpServer: fallbackCreateSdkMcpServer, zod };
  }
}

/**
 * Convert one JSON Schema node into a zod type: string (with enum), number,
 * integer, boolean, array (items), object (properties / required), and
 * anything else as `z.any()`. `description` carries over via `.describe()`.
 */
export function jsonSchemaToZod(z, node = {}) {
  let t;
  const type = Array.isArray(node.type) ? node.type.find((x) => x !== 'null') : node.type;
  if (Array.isArray(node.enum) && node.enum.length && node.enum.every((v) => typeof v === 'string')) {
    t = z.enum(node.enum);
  } else if (type === 'string') t = z.string();
  else if (type === 'integer') t = z.number().int();
  else if (type === 'number') t = z.number();
  else if (type === 'boolean') t = z.boolean();
  else if (type === 'array') t = z.array(node.items ? jsonSchemaToZod(z, node.items) : z.any());
  else if (type === 'object' || node.properties) t = z.object(jsonSchemaToZodShape(z, node));
  else t = z.any();
  if (Array.isArray(node.type) && node.type.includes('null')) t = t.nullable();
  return node.description ? t.describe(node.description) : t;
}

/**
 * Convert an object JSON Schema (a tool's `parameters`) into the zod raw shape
 * the SDK's `tool(name, description, shape, handler)` expects. Properties not
 * listed in `required` become optional.
 */
export function jsonSchemaToZodShape(z, schema = {}) {
  const required = new Set(schema.required ?? []);
  const shape = {};
  for (const [name, prop] of Object.entries(schema.properties ?? {})) {
    const t = jsonSchemaToZod(z, prop);
    shape[name] = required.has(name) ? t : t.optional();
  }
  return shape;
}

/**
 * Dispatch a fully-built `options` object to the runtime (or an injected mock).
 * Unlike `createQuery`, the caller owns option assembly — the harness builds the
 * rich options (hooks, canUseTool, mcpServers, agents, resume, …) and hands them
 * straight through. Resolves auth + executable only on the real path.
 *
 * @returns {AsyncGenerator} the `Query` stream of `SDKMessage`
 */
export async function* dispatchQuery({ prompt, options = {}, queryImpl, env = process.env, fromDir } = {}) {
  if (!queryImpl) {
    resolveAuth(env);
    options.pathToClaudeCodeExecutable ??= resolveExecutablePath({
      config: { pathToClaudeCodeExecutable: options.pathToClaudeCodeExecutable },
      env,
      fromDir,
    });
  }
  const q = queryImpl ?? await loadRealQuery();
  yield* q({ prompt, options });
}

/**
 * Build a `query()` bound to the harness config. Returns a `run(prompt)` function
 * yielding the `Query` async generator of `SDKMessage`; `run.abortController` and
 * `run.options` are exposed for cancellation/inspection.
 *
 * @param {object} config validated harness config
 * @param {object} [opts]
 * @param {Function} [opts.queryImpl] inject a mock query (skips auth + real import)
 * @param {NodeJS.ProcessEnv} [opts.env]
 * @param {AbortController} [opts.abortController]
 * @param {string} [opts.fromDir]
 */
export function createQuery(config, { queryImpl, env = process.env, abortController, fromDir } = {}) {
  if (!queryImpl) resolveAuth(env);

  const options = buildQueryOptions(config);
  options.pathToClaudeCodeExecutable ??= queryImpl
    ? (config.pathToClaudeCodeExecutable ?? null)
    : resolveExecutablePath({ config, env, fromDir });
  options.abortController = abortController ?? new AbortController();

  const run = (prompt) => {
    if (queryImpl) return queryImpl({ prompt, options });
    return runReal(prompt, options);
  };
  run.abortController = options.abortController;
  run.options = options;
  return run;

  async function* runReal(prompt, opts) {
    const query = await loadRealQuery();
    yield* query({ prompt, options: opts });
  }
}
