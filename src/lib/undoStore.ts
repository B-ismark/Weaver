"use client";

import { useSyncExternalStore } from "react";

/**
 * A single-slot "undo" queue for destructive-ish taste actions (currently only
 * "Not my taste"). One toast at a time: a fresh action replaces the previous
 * one, so the bar never stacks. Mirrors the module-level store pattern used by
 * likedStore / hiddenStore so it survives client navigation and is readable
 * from any surface (grid tile, detail view) via a hook.
 *
 * The `undo` closure holds whatever reversal the caller needs (un-hide the id,
 * re-send the `unhide` signal, un-collapse the tile) — the store stays generic.
 */
export type UndoEntry = { id: string; label: string; undo: () => void };

const DEFAULT_TTL = 5000;

let current: UndoEntry | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}
function clearTimer() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

/** Show an undoable action; auto-dismisses after `ttl` ms. */
export function showUndo(entry: UndoEntry, ttl: number = DEFAULT_TTL) {
  clearTimer();
  current = entry;
  emit();
  timer = setTimeout(() => {
    current = null;
    timer = null;
    emit();
  }, ttl);
}

/** Dismiss without undoing (auto-timeout or explicit close). */
export function dismissUndo() {
  clearTimer();
  if (!current) return;
  current = null;
  emit();
}

/** Run the reversal and clear the toast. */
export function runUndo() {
  const entry = current;
  clearTimer();
  current = null;
  emit();
  entry?.undo();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Reactive view of the pending undo entry (null when nothing is pending). */
export function useUndo(): UndoEntry | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null
  );
}
