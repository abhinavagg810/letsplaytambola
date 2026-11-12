import type { CSSProperties, InputHTMLAttributes, ReactNode, Ref } from 'react';
import { cx } from './cx';
import styles from './Input.module.css';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** text = Baloo 2 · code = JetBrains Mono, uppercase, wide letter-spacing (game codes). Default text. */
  variant?: 'text' | 'code';
  /** Height in px. Default 60. */
  size?: 56 | 60 | 62;
  /** Background: surface (on the plum page) or bg (inside a surface card). Default surface. */
  tone?: 'surface' | 'bg';
  /** Font size in px (never below 16 — iOS zooms into smaller inputs). Default 22 (text) / 24 (code). */
  fontSize?: number;
  /** Font weight. Default 600 (text) / 500 (code). */
  weight?: 500 | 600 | 800;
  /** Marks the field as wrong (pink border) and sets `aria-invalid`. */
  invalid?: boolean;
  ref?: Ref<HTMLInputElement>;
}

/** Text input, 56–62px tall. Pair with `<Field>` for a visible label. See docs/COMPONENTS.md. */
export function Input({ variant = 'text', size = 60, tone = 'surface', fontSize, weight, invalid, className, style, ref, ...rest }: InputProps) {
  const css = {
    height: size,
    ...(fontSize ? { fontSize: Math.max(16, fontSize) } : null),
    ...(weight ? { fontWeight: weight } : null),
    ...style,
  } as CSSProperties;
  return (
    <input
      ref={ref}
      className={cx(styles.input, styles[variant], tone === 'bg' && styles.toneBg, invalid && styles.invalid, className)}
      style={css}
      aria-invalid={invalid || undefined}
      {...(variant === 'code' ? { autoCapitalize: 'characters', autoCorrect: 'off', autoComplete: 'off', spellCheck: false } : null)}
      {...rest}
    />
  );
}

export interface FieldProps {
  /** Visible label (18px/800). */
  label: ReactNode;
  /** Helper line under the control (15px, muted). */
  hint?: ReactNode;
  /** Usually one `<Input>`. Wrapped in a `<label>`, so no id wiring is needed. */
  children: ReactNode;
  className?: string;
}

/** Label + control + optional helper text, stacked. */
export function Field({ label, hint, children, className }: FieldProps) {
  return (
    <label className={cx(styles.field, className)}>
      <span className={styles.fieldLabel}>{label}</span>
      {children}
      {hint ? <span className={styles.fieldHint}>{hint}</span> : null}
    </label>
  );
}
