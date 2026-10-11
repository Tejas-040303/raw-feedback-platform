import type { ModerationResult, Moderator } from './moderation.types.ts';

export type ModerationOutcome =
  | { decision: 'allow'; result: ModerationResult }
  | { decision: 'reject'; result: ModerationResult }
  // The context-aware check could not run (API down, timeout, refusal).
  // The post is stored but hidden until a human or a retry clears it.
  | { decision: 'hold'; reason: string };

/**
 * Two-stage pipeline:
 *   1. rules  — free and instant; a hit rejects immediately.
 *   2. claude — only for posts the rules passed, and only if configured.
 *
 * Failure policy: if stage 2 errors, we HOLD rather than allow. Failing open
 * would publish abuse whenever the API has an outage; failing closed
 * (rejecting) would blame the user for our outage.
 */
export class ModerationService {
  private readonly rules: Moderator;
  private readonly contextual: Moderator | null;

  // Plain fields rather than constructor parameter properties, so this file
  // runs under Node's type stripping in the unit tests.
  constructor(rules: Moderator, contextual: Moderator | null) {
    this.rules = rules;
    this.contextual = contextual;
  }

  async check(text: string): Promise<ModerationOutcome> {
    const ruleResult = await this.rules.moderate(text);
    if (ruleResult.abusive) return { decision: 'reject', result: ruleResult };

    if (!this.contextual) return { decision: 'allow', result: ruleResult };

    try {
      const result = await this.contextual.moderate(text);
      return { decision: result.abusive ? 'reject' : 'allow', result };
    } catch (err) {
      return { decision: 'hold', reason: err instanceof Error ? err.message : String(err) };
    }
  }
}
