/**
 * Shared CLI argument parsing + bootstrap for the examples.
 *
 * Every example accepts:
 *   --model <id>            model id (default claude-opus-4-8)
 *   --effort <level>        reasoning effort: low|medium|high|xhigh|max (default low)
 *   --max-turns <n>         agentic turn ceiling (default 8) — the Agent SDK's
 *                           response ceiling is turns, not max_tokens
 *   --permission-mode <m>   default|acceptEdits|plan|bypassPermissions
 *   --base-url <url>        enterprise endpoint (Bedrock/Vertex/proxy)
 *   --token-budget <n>      token ceiling (maxTokens)
 *   --budget-warn <pct>     warn-at percent (default 80)
 *   --budget-enforcement    block | warn (default warn for examples)
 *
 * Authentication follows the runtime: ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN,
 * CLAUDE_CODE_USE_BEDROCK / CLAUDE_CODE_USE_VERTEX (enterprise), otherwise the
 * installed CLI's stored login by default (also prefers the installed `claude`
 * binary over the SDK-bundled cli.js; opt out with CLAUDE_AGENT_USE_CLI_LOGIN=0).
 *
 * The Copilot harness's --cli-path / --proxy flags are gone: the Agent SDK
 * resolves its own Claude Code binary (override with pathToClaudeCodeExecutable)
 * and enforces policy via permissionMode / canUseTool. Use --base-url for an
 * enterprise endpoint (see example 24).
 *
 * Module swap (interchange contract): the SDK the examples run against is
 * chosen HERE, once — set HARNESS_MODULE to a repo-relative harness package
 * dir (github-sdk/v300 | claude-sdk/v100 | claude-agent-sdk/v100) to retarget every
 * example with zero example-code changes. Unset → this package's own SDK.
 */

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageDir, '..', '..');
// Documented package names whose dirs have since moved on disk.
const MODULE_ALIASES = {
  'github-sdk/v300': 'github-copilot-sdk/v300',
  'claude-agent-sdk': 'claude-agent-sdk/v100',
};
const requestedModule = process.env.HARNESS_MODULE?.replace(/\/+$/, '');
const targetDir = requestedModule
  ? resolve(repoRoot, MODULE_ALIASES[requestedModule] ?? requestedModule)
  : packageDir;
const sdk = await import(pathToFileURL(join(targetDir, 'src', 'index.mjs')));

// Canonical SDK symbols the examples consume, re-exported from the selected
// module so example bodies never import an SDK path themselves.
export const {
  createHarness,
  Harness,
  formatSSE,
  TokenBudgetExceededError,
  resolveAuth, // this package's extra — undefined on the other targets
} = sdk;

export const DEFAULT_MODEL = 'claude-opus-4-8';
export const DEFAULT_REASONING_EFFORT = 'low';
export const DEFAULT_MAX_TURNS = 8;
// Generous default budget in 'warn' mode so examples never block on the heuristic
// preflight — they emit budget:exceeded (if tripped) and still run.
export const DEFAULT_TOKEN_BUDGET = {
  maxTokens: 200_000,
  warnAtPercent: 80,
  enforcement: 'warn',
};

export function parseCommonArgs(argv = process.argv.slice(2)) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    switch (argv[i]) {
      case '--model': args.model = argv[++i]; break;
      case '--effort': args.effort = argv[++i]; break;
      case '--max-turns': args.maxTurns = Number(argv[++i]); break;
      case '--permission-mode': args.permissionMode = argv[++i]; break;
      case '--base-url': args.baseURL = argv[++i]; break;
      case '--token-budget': args.budgetMaxTokens = Number(argv[++i]); break;
      case '--budget-warn': args.warnAtPercent = Number(argv[++i]); break;
      case '--budget-enforcement': args.enforcement = argv[++i]; break;
      default: args._.push(argv[i]);
    }
  }
  return args;
}

/**
 * Resolve the user's message from positional args. Examples deliberately do NOT
 * fall back to a built-in default prompt: if no message is given we print a usage
 * hint and exit BEFORE creating the harness — so nothing is sent to the model
 * (0 turns spent). The harness enforces the same rule via EmptyPromptError.
 */
export function requirePrompt(args, usage) {
  const message = args._[0];
  if (typeof message !== 'string' || message.trim() === '') {
    console.error('No message provided — nothing sent to the model (0 turns spent).');
    console.error(`Usage: ${usage}`);
    process.exit(2);
  }
  return message;
}

function resolveTokenBudget(args, exampleBudget) {
  const base = { ...DEFAULT_TOKEN_BUDGET, ...exampleBudget };
  return {
    ...base,
    ...(args.budgetMaxTokens != null && { maxTokens: args.budgetMaxTokens }),
    ...(args.warnAtPercent != null && { warnAtPercent: args.warnAtPercent }),
    ...(args.enforcement != null && { enforcement: args.enforcement }),
  };
}

/** Harness config overrides shared by all examples. */
export function baseConfig(args, extra = {}) {
  const { tokenBudget: exampleBudget, ...restExtra } = extra;
  const tokenBudget = resolveTokenBudget(args, exampleBudget);
  return {
    model: args.model ?? DEFAULT_MODEL,
    effort: args.effort ?? DEFAULT_REASONING_EFFORT,
    maxTurns: args.maxTurns ?? DEFAULT_MAX_TURNS,
    ...(args.permissionMode && { permissionMode: args.permissionMode }),
    // the harness merges baseURL into the subprocess env itself (PATH and the
    // API key survive); ANTHROPIC_BASE_URL in the ambient env is the default
    ...(args.baseURL && { baseURL: args.baseURL }),
    ...restExtra,
    ...(tokenBudget && { tokenBudget }),
  };
}

/** try/finally + signal-safe runner so harness.stop() always executes. */
export async function runExample(harness, fn) {
  const shutdown = async (code) => {
    try {
      await harness.stop();
    } catch (err) {
      console.error('harness.stop() failed:', err);
    }
    process.exit(code);
  };
  process.on('SIGINT', () => shutdown(130));
  process.on('SIGTERM', () => shutdown(143));
  try {
    await fn();
  } catch (err) {
    console.error(err);
    await shutdown(1);
  }
  await shutdown(0);
}

/* ------------------------------------------------------------------ *
 * pretty printers
 * ------------------------------------------------------------------ */

export function printUsage(summaryOrReport) {
  if (typeof summaryOrReport === 'string') {
    console.log(summaryOrReport);
    return;
  }
  const s = summaryOrReport;
  const t = s.tokens ?? {};
  console.log(
    `tokens: ${t.total ?? 0} (${t.input ?? 0} in / ${t.output ?? 0} out, cache ${t.cacheRead ?? 0}r/${t.cacheWrite ?? 0}w)`
    + (s.cost != null ? ` — est. cost $${s.cost} (client-side estimate)` : ''),
  );
}

export function printDelta(text) {
  process.stdout.write(text);
}

export function printResult(r) {
  console.log(`\n--- answer (session ${r.sessionId ?? 'n/a'}, ${r.numTurns ?? '?'} turns) ---`);
  console.log(r.content);
}
