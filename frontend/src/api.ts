import { hc, type InferResponseType } from "hono/client";
import { useSyncExternalStore } from "react";
import type { AppType } from "../../backend/src/app";
import { forgetAll } from "./remember";

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
    shareTokenWithWorker();
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(DEVICE_KEY);
    forgetAll(); // the next household mustn't open with this one's lists
    window.dispatchEvent(new Event(SESSION_EVENT));
    shareTokenWithWorker();
  },
};

const SESSION_EVENT = "miffer:session";

/**
 * The service worker can't read localStorage, so the token is copied where it can: Done and
 * Snooze on a reminder's notification call the API from there (sw.js). Also run at startup,
 * for phones that linked up before this existed.
 */
export function shareTokenWithWorker() {
  if (!("caches" in window)) return;
  const token = session.token;
  (token ? caches.open("miffer").then((c) => c.put("/token", new Response(token))) : caches.delete("miffer")).catch(
    () => {}, // the buttons then open the app instead
  );
}

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
export type Reminder = InferResponseType<typeof api.reminders.$get, 200>[number];

/** A failed response: the server's message, and its status for telling failures apart. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Throws an ApiError on a failed response; a revoked token sends the phone back to link up. */
export async function ok<T extends Response>(request: Promise<T>): Promise<Exclude<T, { ok: false }>> {
  const res = await request;
  if (res.status === 401) {
    session.clear();
    location.assign("/us");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? `Request failed (${res.status})`, res.status);
  }
  return res as Exclude<T, { ok: false }>;
}

export type LiveTopic = "items" | "members" | "reminders";
const TOPICS: LiveTopic[] = ["items", "members", "reminders"];

/**
 * Opens the live connection and calls onChange with what changed in the
 * household, and with every topic on each (re)connect so a ping missed while
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
      TOPICS.forEach(onChange);
    };
    ws.onmessage = (e) => {
      if (TOPICS.includes(e.data)) onChange(e.data);
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
