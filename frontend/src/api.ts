import { hc, type InferResponseType } from "hono/client";
import { useSyncExternalStore } from "react";
import type { AppType } from "../../backend/src/app";

// The PWA talks to its own domain; a Tauri build sets VITE_API_URL to the server's.
const BASE = import.meta.env.VITE_API_URL ?? "";

const TOKEN_KEY = "miffer.token";
const DEVICE_KEY = "miffer.device";

export const session = {
  get token() {
    return localStorage.getItem(TOKEN_KEY);
  },
  get deviceId() {
    return localStorage.getItem(DEVICE_KEY);
  },
  save(token: string, deviceId: string) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(DEVICE_KEY, deviceId);
    window.dispatchEvent(new Event(SESSION_EVENT));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(DEVICE_KEY);
    window.dispatchEvent(new Event(SESSION_EVENT));
  },
};

const SESSION_EVENT = "miffer:session";

/** The current token, re-rendering when this phone links up or unlinks. */
export function useToken() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(SESSION_EVENT, cb);
      return () => window.removeEventListener(SESSION_EVENT, cb);
    },
    () => session.token,
  );
}

export const { api } = hc<AppType>(BASE || "/", {
  headers: (): Record<string, string> =>
    session.token ? { Authorization: `Bearer ${session.token}` } : {},
});

export type Item = InferResponseType<typeof api.items.$get, 200>[number];

/** Throws on a failed response; a revoked token sends the phone back to link up. */
export async function ok<T extends Response>(request: Promise<T>): Promise<Exclude<T, { ok: false }>> {
  const res = await request;
  if (res.status === 401) {
    session.clear();
    location.assign("/us");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res as Exclude<T, { ok: false }>;
}

export type LiveTopic = "items" | "members";

/**
 * Opens the live connection and calls onChange with what changed in the
 * household, and with both topics on every (re)connect so a ping missed while
 * offline can't leave anything stale. Returns a function that closes it.
 */
export function connectLive(onChange: (what: LiveTopic) => void) {
  let ws: WebSocket | undefined;
  let retry: number | undefined;
  let stopped = false;

  const open = () => {
    const url = new URL("/api/ws", BASE || location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(url);
    ws.onopen = () => {
      ws?.send(session.token ?? "");
      onChange("items");
      onChange("members");
    };
    ws.onmessage = (e) => {
      if (e.data === "items" || e.data === "members") onChange(e.data);
    };
    ws.onclose = () => {
      if (!stopped) retry = window.setTimeout(open, 2000);
    };
  };

  open();
  return () => {
    stopped = true;
    window.clearTimeout(retry);
    ws?.close();
  };
}
