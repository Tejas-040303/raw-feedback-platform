// These pages are opened from an email link carrying a secret token. With
// no-referrer, the browser never sends the page URL (token included) to any
// other site, e.g. when it loads an image or font from a CDN.
export const metadata = { referrer: 'no-referrer' as const };

export default function TokenPageLayout({ children }: { children: React.ReactNode }) {
  return children;
}
