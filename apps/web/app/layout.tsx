export const metadata = { title: 'Raw Feedback' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 820, margin: '0 auto', padding: 16 }}>
        {children}
      </body>
    </html>
  );
}
