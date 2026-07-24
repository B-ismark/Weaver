"use client";

import { useSyncExternalStore } from "react";

/**
 * A single-slot toast queue for taste feedback. Two flavours share one slot:
 *   - Undoable actions ("Not my taste") carry an `undo` closure → the toast
 *     shows an Undo button.
 *   - Transient confirmations (a "More/Less like this" nudge) omit `undo` →
 *     the toast is a plain, auto-dismissing acknowledgement (showToast).
 * One toast at a time: a fresh action replaces the previous one, so the bar
 * never stacks. Mirrors the module-level store pattern used by likedStore /
 * hiddenStore so it survives client navigation and is readable from any surface
 * (grid tile, detail view) via a hook.
 *
 * The `undo` closure holds whatever reversal the caller needs (un-hide the id,
 * re-send the `unhide` signal, un-collapse the tile) — the store stays generic.
 */
export type UndoEntry = { id: string; label: string; undo?: () => void };

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

let flashSeq = 0;

/**
 * Show a transient, undo-less confirmation (e.g. a "More/Less like this" nudge,
 * whose surface closes on tap so the tap needs a lasting acknowledgement).
 * Shorter TTL than an undo — there's no action to reverse, just reassurance.
 * Each flash gets a unique id so the toast re-animates on rapid repeats.
 */
export function showToast(label: string, ttl: number = 2400) {
  showUndo({ id: `flash-${++flashSeq}`, label }, ttl);
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
  entry?.undo?.();
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
