"use client";

import * as React from "react";

type FloatingWindowsState = {
  nextZIndex: number;
};

const DEFAULT_STATE: FloatingWindowsState = {
  nextZIndex: 2000,
};

let state = DEFAULT_STATE;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

function emit() {
  listeners.forEach((listener) => listener());
}

export function setFloatingWindowsState(
  updater:
    | Partial<FloatingWindowsState>
    | ((prev: FloatingWindowsState) => Partial<FloatingWindowsState>),
) {
  const patch = typeof updater === "function" ? updater(state) : updater;
  state = { ...state, ...patch };
  emit();
}

export function useFloatingWindowsStore<T>(
  selector: (current: FloatingWindowsState) => T,
): T {
  const snapshot = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return selector(snapshot);
}
