'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';
import styles from './Sheet.module.css';

export interface SheetProps {
  open: boolean;
  /** Called on scrim tap, Escape, or the close gesture. The parent sets `open` to false. */
  onClose: () => void;
  /** Heading, e.g. "What are you claiming?" (26px/800). Also the dialog's accessible name. */
  title: ReactNode;
  /** Line under the title, e.g. "We'll check your ticket instantly." */
  subtitle?: ReactNode;
  children?: ReactNode;
  className?: string;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Bottom sheet: cream, radius 28 at the top, max-width 560, dark scrim, slides up.
 * Closes on scrim tap or Escape, traps focus while open, returns focus to the opener,
 * locks page scroll and pads for the phone's home bar. See docs/COMPONENTS.md.
 */
export function Sheet({ open, onClose, title, subtitle, children, className }: SheetProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const el = panel.current;
    const first = el?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? el)?.focus({ preventScroll: true });
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !el) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        el.focus();
        return;
      }
      const head = items[0];
      const tail = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === head || active === el)) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && active === tail) {
        e.preventDefault();
        head.focus();
      } else if (!el.contains(active)) {
        e.preventDefault();
        head.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className={styles.scrim} onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(styles.panel, className)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.grab} aria-hidden="true" />
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export interface SheetOptionProps {
  /** Bold first line, e.g. the prize name (19px/800). */
  label: ReactNode;
  /** Second line, e.g. the rule (15px). */
  detail?: ReactNode;
  onClick: () => void;
}

/** A white option row for use inside a Sheet (one per open prize on the Claim sheet). At least 60px tall. */
export function SheetOption({ label, detail, onClick }: SheetOptionProps) {
  return (
    <button type="button" className={styles.option} onClick={onClick}>
      <span className={styles.optionLabel}>{label}</span>
      {detail ? <span className={styles.optionDetail}>{detail}</span> : null}
    </button>
  );
}
