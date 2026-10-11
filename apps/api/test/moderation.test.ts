import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RuleModerator } from '../src/moderation/rule-moderator.ts';
import { ModerationService } from '../src/moderation/moderation.service.ts';
import type { ModerationResult, Moderator } from '../src/moderation/moderation.types.ts';

const rules = new RuleModerator();

test('harsh but legitimate criticism passes', async () => {
  for (const text of [
    'Worst biryani I have ever had. Cold, oily, and the manager was rude when I complained.',
    'The service was crap and the car broke down twice in a month. Avoid.',
    'Absolutely useless government office, waited 6 hours for nothing.',
  ]) {
    const r = await rules.moderate(text);
    assert.equal(r.abusive, false, text);
  }
});

test('insults are removed and the complaint is kept', async () => {
  const r = await rules.moderate('The waiter was an idiot and the food was cold, 2 hours late.');
  assert.equal(r.abusive, true);
  assert.deepEqual(r.categories, ['harassment']);
  assert.equal(r.suggestedRewrite, 'The waiter was [removed] and the food was cold, 2 hours late.');
});

test('contact details are masked', async () => {
  const r = await rules.moderate('Owner cheated me, call him on +91 98765 43210 or mail raj@example.com');
  assert.equal(r.abusive, true);
  assert.deepEqual(r.categories, ['personal_info']);
  assert.equal(r.suggestedRewrite, 'Owner cheated me, call him on [contact removed] or mail [contact removed]');
});

test('threats get no rewrite', async () => {
  const r = await rules.moderate('If they do this again I will burn down the shop');
  assert.equal(r.abusive, true);
  assert.ok(r.categories.includes('threat'));
  assert.equal(r.suggestedRewrite, null);
});

test('regex state does not leak between calls', async () => {
  // Global regexes keep lastIndex; a bug here makes every 2nd call miss.
  for (let i = 0; i < 4; i++) {
    assert.equal((await rules.moderate('you moron')).abusive, true, `call ${i}`);
  }
});

const fake = (impl: () => Promise<ModerationResult>): Moderator => ({ moderate: impl });
const clean: ModerationResult = { abusive: false, categories: [], explanation: '', suggestedRewrite: null, provider: 'fake' };

test('service: rule hit rejects without calling the contextual moderator', async () => {
  let called = false;
  const svc = new ModerationService(rules, fake(async () => { called = true; return clean; }));
  const out = await svc.check('you moron');
  assert.equal(out.decision, 'reject');
  assert.equal(called, false);
});

test('service: contextual moderator can reject what rules miss', async () => {
  const svc = new ModerationService(rules, fake(async () => ({
    ...clean, abusive: true, categories: ['harassment'], suggestedRewrite: 'Food was cold.',
  })));
  const out = await svc.check('The chef is a walking disgrace to his family. Food was cold.');
  assert.equal(out.decision, 'reject');
});

test('service: contextual moderator failure holds the post instead of publishing it', async () => {
  const svc = new ModerationService(rules, fake(async () => { throw new Error('timeout'); }));
  const out = await svc.check('Decent place, a bit pricey.');
  assert.deepEqual(out, { decision: 'hold', reason: 'timeout' });
});

test('service: without a contextual moderator, clean posts are allowed', async () => {
  const out = await new ModerationService(rules, null).check('Decent place, a bit pricey.');
  assert.equal(out.decision, 'allow');
});
