"use client";

/**
 * Lightweight event bus for "show / hide chat column" toggling.
 *
 * The Navbar exposes a button that fires `chat-toggle:open` to open
 * the chat panel. The Dashboard listens for `chat-toggle:open` and
 * `chat-toggle:close` to control visibility. State is also reflected
 * into localStorage so the choice survives a soft refresh.
 */

const KEY = "chatColumnVisible";

export type ChatColumnVisibleListener = (visible: boolean) => void;
const listeners = new Set<ChatColumnVisibleListener>();

function emit(visible: boolean) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, visible ? "1" : "0"); } catch {}
  listeners.forEach((cb) => cb(visible));
  window.dispatchEvent(new CustomEvent("chat-toggle:state", { detail: { visible } }));
}

export function isChatColumnVisible(): boolean {
  if (typeof window === "undefined") return true;
  try { return localStorage.getItem(KEY) !== "0"; } catch { return true; }
}

export function openChatColumn() {
  emit(true);
}

export function closeChatColumn() {
  emit(false);
}

export function toggleChatColumn() {
  emit(!isChatColumnVisible());
}

export function subscribeChatColumnVisible(cb: ChatColumnVisibleListener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
