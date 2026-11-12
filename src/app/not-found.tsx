import type { Metadata } from 'next';
import { Button } from '@/components/Button';
import { PageShell } from '@/components/PageShell';

export const metadata: Metadata = { title: 'Page not found', robots: { index: false } };

/** Generic 404 for unknown addresses. (A missing game code is handled by /g/[code] itself.) */
export default function NotFound() {
  return (
    <PageShell>
      <div
        style={{
          maxWidth: 'var(--content-narrow)',
          margin: '0 auto',
          padding: '64px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: 32, lineHeight: 1.1 }}>We can’t find that page</h1>
        <p style={{ fontSize: 18, color: 'var(--text-soft)' }}>The link may be old or mistyped. Have a game code? You can still join.</p>
        <Button href="/join" size={58} block flat>
          Join with a code
        </Button>
        <Button href="/" variant="outline" size={54} block>
          Go to the home page
        </Button>
      </div>
    </PageShell>
  );
}
