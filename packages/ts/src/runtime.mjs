/**
 * Runtime wiring for the Claude Agent SDK.
 *
 * The Agent SDK spawns the Claude Code CLI as a subprocess, so the harness must
 * (a) locate that executable deterministically, (b) confirm credentials exist in
 * the environment before spawning, and (c) hand callers a `query()` bound to the
 * mapped harness options — with a `queryImpl` seam so the whole test suite runs
 * offline against a mock stream, never a real subprocess.
 *
 * The module-resolution helpers embed the finder cores of the
 * `find-claude-node-module-directory-path` and
 * `find-copilot-node-module-directory-path` repos directly in this source —
 * `findClaude()` / `findCopilot()` share one `findModule()` core, no external
 * dependency. Each candidate package is located two ways: native Node module
 * resolution first, then a manual `node_modules` walk (which also finds
 * CLI-only packages whose `exports` map blocks native resolution).
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { buildQueryOptions } from './config.mjs';

/**
 * Candidate package names, first match wins. The CLI package itself is probed
 * before the Agent SDK so a dedicated `@anthropic-ai/claude-code` install
 * beats the SDK's vendored copy.
 */
export const DEFAULT_CANDIDATES = [
  '@anthropic-ai/claude-code',
  '@anthropic-ai/claude-agent-sdk',
];

/** Candidate package names for the Copilot twin (`findCopilot`). */
export const COPILOT_DEFAULT_CANDIDATES = [
  '@github/copilot',
  '@github/copilot-sdk',
  '@github/copilot-language-server',
];

/** Binary names probed by the native-binary finder. */
export const DEFAULT_BINARY_NAMES = ['claude'];

/** Non-PATH system dirs worth probing on POSIX (Homebrew keg + classic local). */
export const DEFAULT_SYSTEM_DIRS = ['/usr/local/bin', '/opt/homebrew/bin'];

/**
 * Kinds tried first-match-wins by `findClaudeBinary`. A project-local
 * node_modules install pins a version, so it outranks whatever global binary
 * happens to be on the machine — flipped in CLI-login mode, which is on unless
 * `CLAUDE_AGENT_USE_CLI_LOGIN=0` (see `resolveExecutablePath`).
 */
export const DEFAULT_ORDER = ['node-module', 'native-binary'];

/**
 * Relative locations where a Claude Code CLI script is known to live inside a
 * found package, probed after the manifest's bin targets:
 *   - `cli.js` — the entry `@anthropic-ai/claude-code` declares as its `claude`
 *     bin, and the file the Agent SDK's own `pathToClaudeCodeExecutable`
 *     default points at inside `@anthropic-ai/claude-agent-sdk`;
 *   - `vendor/claude-code/cli.js` — where some Agent SDK builds vendor the CLI.
 */
const CLI_RELATIVE_CANDIDATES = ['cli.js', path.join('vendor', 'claude-code', 'cli.js')];

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

/**
 * Resolve the `.bin` dir of the node_modules that contains the found package,
 * and map the package's declared bin names to their shim paths under it.
 * @param {string} moduleName
 * @param {string} dir package root
 * @returns {{ binDir: string, bin: Record<string, string> }}
 */
export function resolveBinInfo(moduleName, dir) {
  const segments = moduleName.split('/');
  const nodeModulesDir = path.resolve(dir, ...segments.map(() => '..'));
  const binDir = path.join(nodeModulesDir, '.bin');
  const bin = {};
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    if (typeof pkg.bin === 'string') {
      const name = segments[segments.length - 1];
      bin[name] = path.join(binDir, name);
    } else if (pkg.bin && typeof pkg.bin === 'object') {
      for (const name of Object.keys(pkg.bin)) bin[name] = path.join(binDir, name);
    }
  } catch {
    // no/unreadable manifest — leave bin empty
  }
  return { binDir, bin };
}

/**
 * Resolve the actual Claude Code CLI script inside a found package — the value
 * the Agent SDK's `pathToClaudeCodeExecutable` option (and the
 * `CLAUDE_AGENT_EXECUTABLE` env var) expects. Probes, in order: the manifest's
 * `claude` bin target, any other bin target, then the known vendored CLI
 * locations. Returns an absolute file path or null — never a throw.
 * @param {string} moduleName
 * @param {string} dir package root
 * @returns {string|null}
 */
export function resolveClaudeCodeExecutable(moduleName, dir) {
  const rels = [];
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    if (typeof pkg.bin === 'string') rels.push(pkg.bin);
    else if (pkg.bin && typeof pkg.bin === 'object') {
      if (typeof pkg.bin.claude === 'string') rels.push(pkg.bin.claude);
      for (const v of Object.values(pkg.bin)) {
        if (typeof v === 'string') rels.push(v);
      }
    }
  } catch {
    // no/unreadable manifest — probe the known locations only
  }
  rels.push(...CLI_RELATIVE_CANDIDATES);
  for (const rel of rels) {
    const abs = path.join(dir, rel);
    if (isFile(abs)) return abs;
  }
  return null;
}

/**
 * Shared finder core: locate the closest installed package from `candidates`,
 * trying native resolution first, then the manual node_modules walk — so both
 * library packages and CLI-only packages (no `.` export) are found. Never
 * throws for an installed-but-unexported package.
 * @param {string[]} candidates package names, first match wins
 * @param {{ fromDir?: string, strategy?: 'auto'|'native'|'manual' }} [opts]
 * @returns {{ name: string, dir: string|null, entry: string|null, binDir: string|null,
 *             bin: Record<string, string>, strategy: string, fromDir: string }|null}
 */
export function findModule(candidates, opts = {}) {
  const fromDir = opts.fromDir || process.cwd();
  const strategy = opts.strategy || 'auto';
  for (const name of candidates) {
    if (strategy === 'auto' || strategy === 'native') {
      const entry = resolveModuleEntry(name, { fromDir });
      if (entry) {
        const dir = packageRootFromEntry(name, entry, { fromDir });
        const { binDir, bin } = dir ? resolveBinInfo(name, dir) : { binDir: null, bin: {} };
        return { name, dir, entry, binDir, bin, strategy: 'native', fromDir };
      }
    }
    if (strategy === 'auto' || strategy === 'manual') {
      const dir = findClosestModuleDir(name, { fromDir });
      if (dir) {
        const { binDir, bin } = resolveBinInfo(name, dir);
        return { name, dir, entry: readManifestEntry(dir), binDir, bin, strategy: 'manual', fromDir };
      }
    }
  }
  return null;
}

function normalizeCandidates(opts, defaults) {
  if (!opts.candidates) return defaults;
  return Array.isArray(opts.candidates) ? opts.candidates : [opts.candidates];
}

/**
 * findClaude — locate the closest installed Claude package
 * (`@anthropic-ai/claude-code`, then `@anthropic-ai/claude-agent-sdk`) and the
 * CLI script inside it. The returned `pathToClaudeCodeExecutable` is the value
 * to hand to the Agent SDK option of the same name; `null` when no CLI script
 * exists on disk.
 * @param {{ candidates?: string|string[], fromDir?: string,
 *           strategy?: 'auto'|'native'|'manual' }} [opts]
 */
export function findClaude(opts = {}) {
  const hit = findModule(normalizeCandidates(opts, DEFAULT_CANDIDATES), opts);
  if (!hit) return null;
  return {
    ...hit,
    pathToClaudeCodeExecutable: hit.dir ? resolveClaudeCodeExecutable(hit.name, hit.dir) : null,
  };
}

/**
 * findCopilot — the Copilot twin, embedded for interchange parity with the
 * sibling harness: same core, `@github/*` candidates, no CLI-script field.
 * @param {{ candidates?: string|string[], fromDir?: string,
 *           strategy?: 'auto'|'native'|'manual' }} [opts]
 */
export function findCopilot(opts = {}) {
  return findModule(normalizeCandidates(opts, COPILOT_DEFAULT_CANDIDATES), opts);
}

/* ------------------------------------------------------------------ *
 * native-binary kind (embedded from find-claude-binary-directory-path)
 * ------------------------------------------------------------------ */

const VERSIONISH = /^\d+\.\d+\.\d+/;

function binaryNameVariants(name, platform) {
  return platform === 'win32' ? [`${name}.exe`, `${name}.cmd`, name] : [name];
}

/**
 * Enumerate the on-disk locations where a claude binary may live, in probe
 * order. Pure — nothing is checked for existence here.
 *   1. home-local-bin — `~/.local/bin/<name>` (the native installer's symlink)
 *   2. claude-local   — `~/.claude/local/<name>` (legacy local install)
 *   3. system         — `systemDirs` (default /usr/local/bin, /opt/homebrew/bin; POSIX only)
 *   4. PATH           — every directory on PATH
 * HOME is read ONLY from `env` (HOME/USERPROFILE).
 */
export function nativeBinaryLocations(opts = {}) {
  const env = opts.env || process.env;
  const platform = opts.platform || process.platform;
  const names = opts.names
    ? (Array.isArray(opts.names) ? opts.names : [opts.names])
    : DEFAULT_BINARY_NAMES;
  const systemDirs = opts.systemDirs
    ?? (platform === 'win32' ? [] : DEFAULT_SYSTEM_DIRS);

  const home = env.HOME || env.USERPROFILE || null;
  const pathDirs = String(env.PATH || env.Path || '')
    .split(path.delimiter)
    .filter(Boolean);

  const locations = [];
  for (const name of names) {
    for (const variant of binaryNameVariants(name, platform)) {
      if (home) {
        locations.push({ source: 'home-local-bin', path: path.join(home, '.local', 'bin', variant) });
        locations.push({ source: 'claude-local', path: path.join(home, '.claude', 'local', variant) });
      }
      for (const dir of systemDirs) {
        locations.push({ source: 'system', path: path.join(dir, variant) });
      }
      for (const dir of pathDirs) {
        locations.push({ source: 'PATH', path: path.join(dir, variant) });
      }
    }
  }
  return locations;
}

function isExecutableFile(p, platform = process.platform) {
  try {
    const st = fs.statSync(p); // follows symlinks
    if (!st.isFile()) return false;
    if (platform === 'win32') return true;
    return (st.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

/**
 * Inspect a candidate binary path: must be an existing executable file.
 * Follows symlinks (the native installer links `~/.local/bin/claude` →
 * `~/.local/share/claude/versions/<version>`) and extracts the version from a
 * `versions/<v>` or Homebrew `Cellar/<formula>/<v>` path. Never spawns.
 * @returns {{ path, realpath, dir, version: string|null, isSymlink: boolean }|null}
 */
export function inspectBinary(p, opts = {}) {
  const platform = opts.platform || process.platform;
  if (!isExecutableFile(p, platform)) return null;

  let isSymlink = false;
  try {
    isSymlink = fs.lstatSync(p).isSymbolicLink();
  } catch {
    return null;
  }
  let realpath = p;
  try {
    realpath = fs.realpathSync(p);
  } catch {
    // broken realpath on an exec'able stat is unlikely; keep the original
  }

  let version = null;
  const base = path.basename(realpath);
  if (VERSIONISH.test(base)) {
    version = base;
  } else {
    const segments = realpath.split(path.sep);
    const i = segments.lastIndexOf('versions');
    if (i !== -1 && i + 1 < segments.length && VERSIONISH.test(segments[i + 1])) {
      version = segments[i + 1];
    } else {
      // Homebrew keg: …/Cellar/<formula>/<version>/bin/<name>
      const c = segments.lastIndexOf('Cellar');
      if (c !== -1 && c + 2 < segments.length && VERSIONISH.test(segments[c + 2])) {
        version = segments[c + 2];
      }
    }
  }

  return { path: p, realpath, dir: path.dirname(realpath), version, isSymlink };
}

/**
 * Find a standalone claude binary on disk. Probes `nativeBinaryLocations()`
 * in order, deduplicating by resolved realpath; first hit wins.
 * Returns a result with `kind: 'native-binary'`, or null.
 */
export function findNativeBinary(opts = {}) {
  const platform = opts.platform || process.platform;
  const seen = new Set();
  for (const loc of nativeBinaryLocations(opts)) {
    const info = inspectBinary(loc.path, { platform });
    if (!info) continue;
    if (seen.has(info.realpath)) continue;
    seen.add(info.realpath);
    return {
      kind: 'native-binary',
      name: path.basename(loc.path),
      source: loc.source,
      path: info.path,
      realpath: info.realpath,
      dir: info.dir,
      version: info.version,
      isSymlink: info.isSymlink,
      executable: info.path,
    };
  }
  return null;
}

/**
 * Find a Claude Code install of either kind, first-match-wins across `order`
 * (default: node-module, then native-binary). Every hit carries `kind` and a
 * spawnable `executable` (the package's cli.js to run with node, or the binary
 * itself).
 * @param {{ order?: string|string[], fromDir?: string, candidates?: string|string[],
 *           strategy?: 'auto'|'native'|'manual', names?: string|string[],
 *           env?: object, platform?: string, systemDirs?: string[] }} [opts]
 */
export function findClaudeBinary(opts = {}) {
  const order = opts.order
    ? (Array.isArray(opts.order) ? opts.order : [opts.order])
    : DEFAULT_ORDER;

  for (const kind of order) {
    if (kind === 'node-module') {
      const hit = findClaude(opts);
      if (hit?.pathToClaudeCodeExecutable) {
        return { ...hit, kind: 'node-module', executable: hit.pathToClaudeCodeExecutable };
      }
    } else if (kind === 'native-binary') {
      const hit = findNativeBinary(opts);
      if (hit) return hit;
    } else {
      throw new Error(`unknown kind in order: ${JSON.stringify(kind)} (expected 'node-module' or 'native-binary')`);
    }
  }
  return null;
}

/**
 * CLI-login mode is the default: unset means on, and only `'0'` turns it off.
 * It selects the installed CLI's stored login for auth and prefers the
 * installed `claude` binary as the executable.
 */
export function cliLoginEnabled(env = process.env) {
  return env.CLAUDE_AGENT_USE_CLI_LOGIN !== '0';
}

/**
 * Resolve the Claude Code executable the Agent SDK subprocess needs. Precedence:
 *   1. `config.pathToClaudeCodeExecutable` (validated as an existing file).
 *   2. `env.CLAUDE_AGENT_EXECUTABLE` (validated as an existing file).
 *   3. In CLI-login mode (default; off with `CLAUDE_AGENT_USE_CLI_LOGIN=0`): the installed
 *      native `claude` binary first (`findNativeBinary()` — ~/.local/bin,
 *      ~/.claude/local, system dirs, PATH). The installed binary owns the CLI
 *      login session; spawning the SDK-bundled cli.js instead has been observed
 *      to stall on startup in plain terminals (suspected, unconfirmed macOS
 *      Keychain prompt — see claude-sdk-hang-troubleshooting.md).
 *   4. `findClaude()` — the CLI script inside the closest installed
 *      `@anthropic-ai/claude-code` or `@anthropic-ai/claude-agent-sdk` package
 *      (native module resolution, then a manual node_modules walk).
 *   5. `findNativeBinary()` — the installed `claude` binary (superset of the
 *      old PATH walk: the native installer's locations are probed too).
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

  const useCliLogin = cliLoginEnabled(env);
  if (useCliLogin) {
    const native = findNativeBinary({ env });
    if (native) return native.executable;
  }

  // an explicit fromDir is authoritative; otherwise search from this package, then cwd
  const hereDir = path.dirname(fileURLToPath(import.meta.url));
  const anchors = fromDir ? [fromDir] : [hereDir, process.cwd()];
  for (const anchor of anchors) {
    const hit = findClaude({ fromDir: anchor });
    // only a probed CLI script is spawnable — the package's manifest `main`
    // (sdk.mjs) is the library itself, which exits silently as the executable,
    // so a hit with no CLI script falls through to the native-binary probe
    if (hit?.pathToClaudeCodeExecutable) return hit.pathToClaudeCodeExecutable;
  }

  if (!useCliLogin) {
    const native = findNativeBinary({ env });
    if (native) return native.executable;
  }

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
 *   CLAUDE_CODE_OAUTH_TOKEN → 'oauth-token'  (e.g. from `claude setup-token`)
 *   CLAUDE_CODE_USE_BEDROCK → 'bedrock'
 *   CLAUDE_CODE_USE_VERTEX → 'vertex'
 *   otherwise → 'cli-login' (the spawned CLI authenticates itself from its
 *     stored login; pairs with the installed-binary preference in
 *     `resolveExecutablePath`). `CLAUDE_AGENT_USE_CLI_LOGIN=0` opts out, and
 *     then no explicit credential means no auth.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ required?: boolean }} [opts] set required:false to probe without throwing
 * @returns {{ mode: string|null }}
 */
export function resolveAuth(env = process.env, { required = true } = {}) {
  if (env.ANTHROPIC_API_KEY) return { mode: 'api-key' };
  if (env.CLAUDE_CODE_OAUTH_TOKEN) return { mode: 'oauth-token' };
  if (env.CLAUDE_CODE_USE_BEDROCK) return { mode: 'bedrock' };
  if (env.CLAUDE_CODE_USE_VERTEX) return { mode: 'vertex' };
  if (cliLoginEnabled(env)) return { mode: 'cli-login' };
  if (required) {
    throw new Error(
      'No Claude auth found. Set ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN, '
      + 'CLAUDE_CODE_USE_BEDROCK, or CLAUDE_CODE_USE_VERTEX, or remove '
      + 'CLAUDE_AGENT_USE_CLI_LOGIN=0 to use the installed CLI\'s stored login.',
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
