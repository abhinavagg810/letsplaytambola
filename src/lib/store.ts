import { useSyncExternalStore } from 'react';

/** Minimal external store (no dependency). */
export function createStore<T extends object>(initial: T) {
  let state = initial;
  const subs = new Set<() => void>();
  const get = () => state;
  const set = (patch: Partial<T> | ((s: T) => Partial<T>)) => {
    const p = typeof patch === 'function' ? patch(state) : patch;
    state = { ...state, ...p };
    subs.forEach((f) => f());
  };
  const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
  function use(): T;
  function use<U>(sel: (s: T) => U): U;
  function use<U>(sel?: (s: T) => U) {
    return useSyncExternalStore(subscribe, () => (sel ? sel(state) : state), () => (sel ? sel(state) : state));
  }
  return { get, set, subscribe, use };
}
