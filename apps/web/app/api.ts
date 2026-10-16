export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Shapes returned by the API. BIGINT ids and NUMERIC averages arrive as
// strings (node-postgres keeps them exact), so they're typed that way here.

export interface Category {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
}

export interface Entity {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  country_code: string | null;
  region: string | null;
  city: string | null;
  avg_rating: string | null;
  rating_count: number;
  feedback_count: number;
}

export interface FeedbackItem {
  id: string;
  body: string;
  rating: number | null;
  upvotes: number;
  created_at: string;
  entity_id: string;
  entity_name: string;
  city: string | null;
  country_code: string | null;
  category: string;   // category slug
}

export interface FeedPage {
  items: FeedbackItem[];
  nextCursor: string | null;
}

export interface SessionUser {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  email_verified: boolean;
}

/** GET from a server component. Returns null instead of throwing when the API is down or answers non-2xx. */
export async function apiGet<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, init);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** "3 hours ago", "2 days ago". */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000], ['month', 2_592_000], ['week', 604_800], ['day', 86_400], ['hour', 3_600], ['minute', 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}
