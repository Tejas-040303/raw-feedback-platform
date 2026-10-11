export const metadata = { title: 'Raw Feedback' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 820, margin: '0 auto', padding: 16 }}>
        <nav style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          <a href="/">Feedback</a>
          <span style={{ flex: 1 }} />
          <a href="/login">Log in</a>
          <a href="/signup">Create account</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
