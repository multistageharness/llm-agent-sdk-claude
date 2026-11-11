/**
 * Token estimation, budget enforcement, and pre-run usage analysis.
 *
 * Estimation is heuristic (no tokenizer dependency): ~4 characters per token for
 * prose, with a word-count floor so dense code/whitespace doesn't under-count.
 * Real usage is reconciled from the Agent SDK `result` message's `usage` after
 * each run (see UsageTracker.ingestResult), so the budget tracks actuals — the
 * estimate is only used for the preflight gate.
 *
 * DEVIATION from `claude-sdk/v100`: the Messages API sibling offered an accurate
 * path via `client.messages.countTokens()`. The **Claude Agent SDK exposes no
 * token-counting endpoint** (it spawns the Claude Code CLI subprocess), so
 * `analyzeRunAccurate()` is retained for surface parity but delegates to the
 * heuristic `analyzeRun()`.
 */

const CHARS_PER_TOKEN = 4;

/** Heuristic token estimate for a string. */
export function estimateTokens(text) {
  if (text == null) return 0;
  const s = String(text);
  if (s.length === 0) return 0;
  const byChars = Math.ceil(s.length / CHARS_PER_TOKEN);
  const byWords = Math.ceil(s.split(/\s+/).filter(Boolean).length * 4 / 3);
  return Math.max(byChars, byWords);
}

/** Estimate tokens for an array of {role, content} messages. */
export function estimateMessagesTokens(messages = []) {
  // ~4 tokens of per-message framing overhead, mirroring chat-format costs.
  return messages.reduce(
    (sum, m) => sum + estimateTokens(m?.content) + 4,
    0,
  );
}

export class TokenBudgetExceededError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'TokenBudgetExceededError';
    Object.assign(this, details);
  }
}

/**
 * Tracks cumulative token spend against a configurable ceiling.
 * `maxTokens: null` means unlimited (tracking only).
 */
export class TokenBudget {
  /**
   * @param {object} [opts]
   * @param {number|null} [opts.maxTokens]
   * @param {number} [opts.warnAtPercent]
   * @param {'block'|'warn'} [opts.enforcement]
   */
  constructor(opts = {}) {
    this.maxTokens = opts.maxTokens ?? null;
    this.warnAtPercent = opts.warnAtPercent ?? 80;
    this.enforcement = opts.enforcement ?? 'block';
    this.used = 0;
    this._warned = false;
  }

  get remaining() {
    return this.maxTokens == null ? Infinity : Math.max(0, this.maxTokens - this.used);
  }

  get utilizationPercent() {
    if (this.maxTokens == null || this.maxTokens === 0) return 0;
    return Math.min(100, (this.used / this.maxTokens) * 100);
  }

  /** Record actual spend. Returns 'ok' | 'warn' | 'exceeded' state transitions. */
  record(tokens) {
    this.used += Math.max(0, tokens || 0);
    if (this.maxTokens == null) return 'ok';
    if (this.used >= this.maxTokens) return 'exceeded';
    if (!this._warned && this.utilizationPercent >= this.warnAtPercent) {
      this._warned = true;
      return 'warn';
    }
    return 'ok';
  }

  /** Would running a request estimated at `estimate` tokens bust the budget? */
  wouldExceed(estimate) {
    if (this.maxTokens == null) return false;
    return this.used + estimate > this.maxTokens;
  }

  /**
   * Preflight gate. Throws TokenBudgetExceededError in 'block' mode when the
   * estimate does not fit; returns the verdict either way.
   */
  checkOrThrow(estimate, context = {}) {
    const exceeded = this.wouldExceed(estimate);
    if (exceeded && this.enforcement === 'block') {
      throw new TokenBudgetExceededError(
        `Token budget exceeded: ${this.used} used + ~${estimate} estimated > ${this.maxTokens} max`,
        { used: this.used, estimate, maxTokens: this.maxTokens, ...context },
      );
    }
    return exceeded;
  }

  snapshot() {
    return {
      maxTokens: this.maxTokens,
      used: this.used,
      remaining: this.maxTokens == null ? null : this.remaining,
      utilizationPercent: Number(this.utilizationPercent.toFixed(1)),
      enforcement: this.enforcement,
    };
  }
}

function buildReport(breakdown, budget) {
  const estimatedInputTokens =
    breakdown.promptTokens + breakdown.systemTokens
    + breakdown.contextTokens + breakdown.attachmentTokens;
  const estimatedTotalTokens = estimatedInputTokens + breakdown.expectedOutputTokens;
  const report = {
    breakdown,
    estimatedInputTokens,
    estimatedTotalTokens,
    budget: budget ? budget.snapshot() : null,
    fitsWithinBudget: budget ? !budget.wouldExceed(estimatedTotalTokens) : true,
  };
  report.recommendation = report.fitsWithinBudget
    ? 'ok'
    : (budget?.enforcement === 'block'
      ? 'blocked: raise tokenBudget.maxTokens, trim the prompt/context, or start a new harness'
      : 'over budget: run will proceed (enforcement=warn) but budget:exceeded will fire');
  return report;
}

/**
 * Pre-run token usage analysis: estimate the cost of a prospective request
 * against the current budget before any tokens are spent (heuristic).
 *
 * @param {object} input
 * @param {string} input.prompt
 * @param {string|null} [input.systemPrompt]
 * @param {Array<{role:string,content:string}>} [input.context] prior turns being attached
 * @param {string[]} [input.attachments] file contents being embedded
 * @param {number} [input.expectedOutputTokens] caller's output-size expectation
 * @param {TokenBudget} [budget]
 */
export function analyzeRun(input, budget) {
  return buildReport({
    promptTokens: estimateTokens(input.prompt),
    systemTokens: estimateTokens(input.systemPrompt),
    contextTokens: estimateMessagesTokens(input.context),
    attachmentTokens: (input.attachments ?? []).reduce((sum, a) => sum + estimateTokens(a), 0),
    expectedOutputTokens: input.expectedOutputTokens ?? 0,
  }, budget);
}

/**
 * Accurate pre-run analysis. Retained for surface parity with `claude-sdk/v100`,
 * but the Claude Agent SDK has no `countTokens` endpoint, so this delegates to
 * the heuristic `analyzeRun()` — "accurate" mode is heuristic-only here.
 *
 * Call forms (interchange contract — always `await` the result):
 *   analyzeRunAccurate(client, input, budget?)  — client is accepted and ignored
 *   analyzeRunAccurate(input, budget?)
 *
 * @param {object} input   same shape as analyzeRun's input
 * @param {TokenBudget} [budget]
 */
export function analyzeRunAccurate(clientOrInput, inputOrBudget, maybeBudget) {
  if (typeof clientOrInput?.messages?.countTokens === 'function') {
    return analyzeRun(inputOrBudget, maybeBudget);
  }
  return analyzeRun(clientOrInput, inputOrBudget);
}
