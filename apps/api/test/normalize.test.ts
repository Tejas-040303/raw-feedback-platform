import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cityKey, nameKey, slugify } from '../src/common/normalize.ts';

test('names that mean the same thing get the same key', () => {
  const same = ["Domino's Pizza", 'dominos pizza', '  DOMINOS   PIZZA ', 'Dominos-Pizza!'];
  for (const n of same) assert.equal(nameKey(n), 'dominos pizza', n);
});

test('accents, ampersands, "the" and legal suffixes are folded', () => {
  assert.equal(nameKey('Café Coffee Day'), 'cafe coffee day');
  assert.equal(nameKey('Johnson & Johnson'), nameKey('Johnson and Johnson'));
  assert.equal(nameKey('The Leela Palace'), 'leela palace');
  assert.equal(nameKey('Tata Motors Pvt. Ltd.'), 'tata motors');
});

test('folding never empties a name', () => {
  assert.equal(nameKey('The'), 'the');
  assert.equal(nameKey('Ltd'), 'ltd');
});

test('different names stay different', () => {
  assert.notEqual(nameKey('Taj Mahal'), nameKey('Taj Mahal Palace'));
});

test('non-Latin scripts are kept', () => {
  assert.equal(nameKey('दिल्ली दरबार'), 'दिल्ली दरबार');
});

test('slugify and cityKey', () => {
  assert.equal(slugify("Domino's Pizza, Pune"), 'dominos-pizza-pune');
  assert.equal(cityKey('  Bengaluru '), 'bengaluru');
  assert.equal(cityKey(''), null);
  assert.equal(cityKey(undefined), null);
});
