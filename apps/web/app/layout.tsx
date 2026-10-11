import type { Metadata } from 'next';
import { Bricolage_Grotesque, Instrument_Sans } from 'next/font/google';
import { SiteHeader } from '@/components/site-header';
import './globals.css';

// Self-hosted by Next.js at build time; exposed as CSS variables used in globals.css.
const heading = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-heading', display: 'swap' });
const body = Instrument_Sans({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Raw Feedback', template: '%s · Raw Feedback' },
  description: 'Honest, unfiltered reviews of places, companies, services and public offices.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable}`}>
      <body className="min-h-screen">
        <SiteHeader />
        <main className="px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
