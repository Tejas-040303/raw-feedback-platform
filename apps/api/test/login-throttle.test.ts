import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountKey, ipKey } from '../src/auth/login-throttle.ts';

test('account key: existing account by id, so username and email share one counter', () => {
  assert.equal(accountKey(42, 'tejas_p'), 'user:42');
  assert.equal(accountKey(42, 'tejas@example.com'), 'user:42');
});

test('account key: unknown names are throttled too, case-insensitively', () => {
  assert.equal(accountKey(undefined, '  Bob '), 'name:bob');
  assert.equal(accountKey(undefined, 'BOB'), accountKey(undefined, 'bob'));
});

test('ip key: IPv4, including IPv4 seen through an IPv6 socket', () => {
  assert.equal(ipKey('203.0.113.7'), 'ip:203.0.113.7');
  assert.equal(ipKey('::ffff:203.0.113.7'), 'ip:203.0.113.7');
});

test('ip key: IPv6 addresses in the same /64 share a key', () => {
  const a = ipKey('2001:db8:1:2:aaaa::1');
  const b = ipKey('2001:0db8:0001:0002:ffff:ffff:ffff:ffff');
  assert.equal(a, 'ip6:2001:0db8:0001:0002::/64');
  assert.equal(a, b);
  assert.notEqual(a, ipKey('2001:db8:1:3::1'));          // next /64 over
  assert.equal(ipKey('::1'), 'ip6:0000:0000:0000:0000::/64');
  assert.equal(ipKey('fe80::1%eth0'), 'ip6:fe80:0000:0000:0000::/64'); // zone id ignored
});

test('ip key: missing or garbage input does not crash', () => {
  assert.equal(ipKey(undefined), 'ip:unknown');
  assert.equal(ipKey('not an ip'), 'ip:unknown');
});
