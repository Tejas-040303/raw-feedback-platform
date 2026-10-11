import type { AbuseCategory, ModerationResult, Moderator } from './moderation.types.ts';

/**
 * Deterministic, offline moderator.
 *
 * It is always run first: it is free, instant, and catches the obvious
 * cases (insults, contact details, explicit threats). It cannot understand
 * context, so the Claude moderator is layered on top when configured.
 *
 * Harsh criticism is NOT abuse. "The food was disgusting and the manager
 * was rude" must pass — that is exactly the feedback this platform exists for.
 */

// Words that name a PERSON as an insult. Plain profanity about an
// experience ("the service was crap") is deliberately not listed: this is a
// raw-feedback platform. Kept short on purpose; extend from real data.
const INSULTS = [
  'idiot', 'idiots', 'moron', 'morons', 'bastard', 'bastards', 'scum',
  'loser', 'losers', 'jerk', 'jerks', 'fucker', 'fuckers', 'bitch',
  'asshole', 'assholes',
];
// Optional leading article so "an idiot" becomes "[removed]", not "an [removed]".
const INSULT_RE = new RegExp(`\\b(?:(?:a|an)\\s+)?(?:${INSULTS.join('|')})\\b`, 'gi');

const THREAT_RES = [
  /\b(i|we)('ll| will| am going to| gonna)\s+(kill|hurt|beat|stab|shoot|burn)\b/i,
  /\b(kill|burn down|blow up)\s+(him|her|them|you|the (place|shop|office|owner|staff))\b/i,
];

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
// 10+ digits, allowing spaces/dashes and an optional +country prefix.
const PHONE_RE = /(\+?\d[\d\s-]{8,}\d)/g;
const URL_RE = /\bhttps?:\/\/\S+/gi;

export class RuleModerator implements Moderator {
  async moderate(text: string): Promise<ModerationResult> {
    const categories = new Set<AbuseCategory>();
    let rewrite = text;

    if (THREAT_RES.some((re) => re.test(text))) categories.add('threat');

    if (INSULT_RE.test(text)) {
      categories.add('harassment');
      // Rules can't rephrase, only redact. A visible marker reads better than a
      // silent gap; the Claude moderator produces a properly rewritten post.
      rewrite = rewrite.replace(INSULT_RE, '[removed]');
    }
    INSULT_RE.lastIndex = 0;

    if (EMAIL_RE.test(text) || PHONE_RE.test(text)) {
      categories.add('personal_info');
      rewrite = rewrite.replace(EMAIL_RE, '[contact removed]').replace(PHONE_RE, '[contact removed]');
    }
    EMAIL_RE.lastIndex = 0;
    PHONE_RE.lastIndex = 0;

    const urls = text.match(URL_RE) ?? [];
    if (urls.length >= 3) {
      categories.add('spam');
      rewrite = rewrite.replace(URL_RE, '');
    }

    if (categories.size === 0) {
      return { abusive: false, categories: [], explanation: '', suggestedRewrite: null, provider: 'rules' };
    }

    rewrite = tidy(rewrite);
    // A threat has no "honest complaint" inside it to keep, and stripping
    // words can leave a near-empty post — in both cases offer no rewrite.
    const salvageable = !categories.has('threat') && rewrite.replace(/\[(removed|contact removed)\]/g, '').trim().split(/\s+/).length >= 3;

    return {
      abusive: true,
      categories: [...categories],
      explanation: explain([...categories]),
      suggestedRewrite: salvageable ? rewrite : null,
      provider: 'rules',
    };
  }
}

function tidy(s: string): string {
  return s
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/([,.!?]){2,}/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function explain(categories: AbuseCategory[]): string {
  const parts: Record<AbuseCategory, string> = {
    harassment: 'insults aimed at people',
    hate: 'hateful language',
    threat: 'a threat of harm',
    personal_info: "someone's personal contact details",
    sexual: 'sexual content about a person',
    spam: 'promotional links',
  };
  return `Your post contains ${categories.map((c) => parts[c]).join(' and ')}. ` +
    'Criticism is welcome here, but it has to be about the experience, not attacks on people.';
}
