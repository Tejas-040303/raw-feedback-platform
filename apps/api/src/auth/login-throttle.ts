import { isIPv4, isIPv6 } from 'node:net';

/**
 * Failed-login limits. Two independent limits, because they stop different
 * attacks:
 *
 *   per account — someone guessing many passwords for ONE account.
 *   per IP      — someone trying a few common passwords against MANY
 *                 accounts ("password spraying"), which never trips the
 *                 per-account limit.
 *
 * A limit lockout is temporary on purpose. A permanent lock would let anyone
 * lock any user out of their account just by typing wrong passwords for it.
 */
export interface RateLimit {
  max: number;      // attempts allowed per window
  window: string;   // Postgres interval, e.g. '15 minutes'
  lock: string;     // how long to block once max is exceeded
}

export const ACCOUNT_LIMIT: RateLimit = { max: 5, window: '15 minutes', lock: '15 minutes' };
// Higher, because many honest users can share one IP (offices, mobile
// carriers, university Wi-Fi all put people behind one address).
export const IP_LIMIT: RateLimit = { max: 50, window: '15 minutes', lock: '15 minutes' };

// Endpoints that send email. Each request costs us a real email and can
// be used to flood someone's inbox, so these are much tighter.
export const MAIL_PER_RECIPIENT: RateLimit = { max: 3, window: '1 hour', lock: '1 hour' };
export const MAIL_PER_IP: RateLimit = { max: 10, window: '1 hour', lock: '1 hour' };

// Sign-ups, per client network. Every attempt that passes validation counts,
// including ones rejected as "username taken", because each one costs a
// scrypt hash (CPU and 64 MiB of memory) and probes which names and emails
// exist. Two windows: the hourly one stops bursts, the daily one stops a bot
// that stays just under the hourly limit all day. Both leave room for a
// household or an office signing up together.
export const REGISTER_PER_IP_HOUR: RateLimit = { max: 10, window: '1 hour', lock: '1 hour' };
export const REGISTER_PER_IP_DAY: RateLimit = { max: 30, window: '24 hours', lock: '24 hours' };

/**
 * Key for the account being attacked. An existing account is keyed by id, so
 * logging in by username or by email shares one counter. A name with no
 * account still gets a counter, so the response is the same either way and
 * the 429 doesn't reveal which accounts exist.
 */
export function accountKey(userId: number | undefined, identifier: string): string {
  return userId !== undefined ? `user:${userId}` : `name:${identifier.trim().toLowerCase()}`;
}

/**
 * Key for the client's network. IPv6 is keyed by its /64 prefix: one home or
 * phone connection is usually given a whole /64, i.e. 2^64 addresses, so a
 * per-address limit would be trivial to dodge.
 */
export function ipKey(ip: string | undefined): string {
  if (!ip) return 'ip:unknown';
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);   // IPv4 seen through an IPv6 socket
  if (mapped) return `ip:${mapped[1]}`;
  if (isIPv4(ip)) return `ip:${ip}`;
  if (isIPv6(ip)) return `ip6:${expandIPv6(ip).slice(0, 4).join(':')}::/64`;
  return 'ip:unknown';
}

function expandIPv6(ip: string): string[] {
  const [head, tail = ''] = ip.split('%')[0].split('::');
  const left = head ? head.split(':') : [];
  const right = ip.includes('::') && tail ? tail.split(':') : [];
  const missing = 8 - left.length - right.length;
  const groups = ip.includes('::') ? [...left, ...Array(missing).fill('0'), ...right] : left;
  return groups.map((g) => g.toLowerCase().padStart(4, '0'));
}
