import { cx } from './cx';
import styles from './Toggle.module.css';

export interface ToggleProps {
  checked: boolean;
  /** Called with the new value. Omit together with `presentational`. */
  onChange?: (next: boolean) => void;
  /** Accessible name, e.g. "Deal me a ticket". Required unless `presentational`. */
  label?: string;
  disabled?: boolean;
  /**
   * Draws only the 52×30 switch as a `<span>` — for when the whole row is already the button
   * (give that row `role="switch"` and `aria-checked`).
   */
  presentational?: boolean;
  className?: string;
}

/** On/off switch, 52×30, green when on. See docs/COMPONENTS.md. */
export function Toggle({ checked, onChange, label, disabled, presentational, className }: ToggleProps) {
  const cls = cx(styles.toggle, checked && styles.on, className);
  if (presentational) {
    return (
      <span className={cls} aria-hidden="true">
        <span className={styles.knob} />
      </span>
    );
  }
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={cx(cls, styles.button)} onClick={() => onChange?.(!checked)}>
      <span className={styles.knob} />
    </button>
  );
}
