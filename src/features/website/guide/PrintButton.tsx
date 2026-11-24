'use client';
// "Print this list" on /tambola-number-calls. The page itself is fully server-rendered; this button is the only script.

export function PrintButton({ className }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      Print this list
    </button>
  );
}
