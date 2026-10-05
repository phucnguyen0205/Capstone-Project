"use client";

/**
 * Persistent per-conversation settings — theme, mute, pin.
 * Stored in localStorage so they survive page refresh.
 *
 * Schema:
 *   chatSettings:{conversationId} → {
 *     themeId: string,
 *     muted: boolean,
 *     pinned: boolean,
 *   }
 */

const PREFIX = "chatSettings:";
const KEY_INDEX = "chatSettings:__index__"; // for fast lookup of all convs

type ConvSettings = {
  themeId?: string;
  muted?: boolean;
  pinned?: boolean;
};

function readAll(): Record<string, ConvSettings> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY_INDEX);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, ConvSettings>;
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, ConvSettings>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY_INDEX, JSON.stringify(map));
  } catch {
    /* quota or disabled — silent */
  }
}

function readOne(convId: string): ConvSettings {
  const all = readAll();
  return all[convId] ?? {};
}

function writeOne(convId: string, settings: ConvSettings) {
  const all = readAll();
  all[convId] = { ...all[convId], ...settings };
  writeAll(all);
}

/* ─── Read APIs (SSR-safe) ──────────────────────────────────────────────── */

export function getThemeId(convId: string): string | undefined {
  return readOne(convId).themeId;
}

export function getMuted(convId: string): boolean {
  return readOne(convId).muted ?? false;
}

export function getPinned(convId: string): boolean {
  return readOne(convId).pinned ?? false;
}

export function getAllSettings(convId: string): ConvSettings {
  return readOne(convId);
}

/* ─── Write APIs ───────────────────────────────────────────────────────── */

export function setThemeId(convId: string, themeId: string) {
  writeOne(convId, { themeId });
}

export function setMuted(convId: string, muted: boolean) {
  writeOne(convId, { muted });
}

export function setPinned(convId: string, pinned: boolean) {
  writeOne(convId, { pinned });
}

export function clearSettings(convId: string) {
  const all = readAll();
  delete all[convId];
  writeAll(all);
}

/* ─── React hooks (re-render on changes) ───────────────────────────────── */

import { useEffect, useState, useCallback } from "react";

/** Subscribe to theme changes for one conversation. */
export function useChatSettings(convId: string | undefined) {
  const [settings, setSettings] = useState<ConvSettings>({});

  // Load on mount / when convId changes
  useEffect(() => {
    if (!convId) {
      setSettings({});
      return;
    }
    setSettings(readOne(convId));

    // Listen to changes from other tabs / components
    function onStorage(e: StorageEvent) {
      if (e.key === KEY_INDEX) {
        setSettings(readOne(convId!));
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [convId]);

  const updateTheme = useCallback(
    (themeId: string) => {
      if (!convId) return;
      writeOne(convId, { themeId });
      setSettings((s) => ({ ...s, themeId }));
      // Notify same-tab listeners
      window.dispatchEvent(
        new StorageEvent("storage", { key: KEY_INDEX })
      );
    },
    [convId]
  );

  const updateMuted = useCallback(
    (muted: boolean) => {
      if (!convId) return;
      writeOne(convId, { muted });
      setSettings((s) => ({ ...s, muted }));
      window.dispatchEvent(
        new StorageEvent("storage", { key: KEY_INDEX })
      );
    },
    [convId]
  );

  const updatePinned = useCallback(
    (pinned: boolean) => {
      if (!convId) return;
      writeOne(convId, { pinned });
      setSettings((s) => ({ ...s, pinned }));
      window.dispatchEvent(
        new StorageEvent("storage", { key: KEY_INDEX })
      );
    },
    [convId]
  );

  return {
    settings,
    themeId: settings.themeId ?? "pink-sunset",
    muted: settings.muted ?? false,
    pinned: settings.pinned ?? false,
    updateTheme,
    updateMuted,
    updatePinned,
  };
}
