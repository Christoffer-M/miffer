import { eq } from "drizzle-orm";
import webpush, { type PushSubscription } from "web-push";
import { db, schema } from "./db/index.js";

const { devices } = schema;

// Generate once with `npx web-push generate-vapid-keys`. Without them notifications are off.
const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
export const pushKey = VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY ? VAPID_PUBLIC_KEY : null;
if (pushKey) webpush.setVapidDetails(VAPID_SUBJECT ?? "https://localhost", pushKey, VAPID_PRIVATE_KEY!);

// The server POSTs to whatever endpoint a phone hands it, so only the browsers' push services
// are allowed: FCM (Chrome, Android), Mozilla, Apple and Windows (Edge).
const PUSH_HOSTS =
  /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[\w-]+\.notify\.windows\.com)$/;
export const isPushEndpoint = (url: string) => {
  const u = URL.parse(url);
  return u?.protocol === "https:" && PUSH_HOSTS.test(u.hostname);
};

const householdPhones = (householdId: string) =>
  db
    .select({ id: devices.id, name: devices.name, push: devices.push })
    .from(devices)
    .where(eq(devices.householdId, householdId));

/** Sends one phone a notification. */
function send(deviceId: string, push: PushSubscription, payload: object) {
  return webpush.sendNotification(push, JSON.stringify(payload), { TTL: 24 * 60 * 60 }).catch(async (err) => {
    // Gone: the phone turned notifications off or the browser dropped it.
    if (err?.statusCode === 404 || err?.statusCode === 410) {
      await db.update(devices).set({ push: null }).where(eq(devices.id, deviceId));
    } else console.error("push failed", err);
  });
}

/** Tells everyone else in the household with notifications on that this phone added something. */
export async function pushAdded(householdId: string, deviceId: string, item: string) {
  if (!pushKey) return;
  const phones = await householdPhones(householdId);
  const adder = phones.find((p) => p.id === deviceId);
  const body = `${adder?.name || "Someone"} added ${item}`;
  await Promise.all(phones.map(({ id, push }) => id !== deviceId && push && send(id, push, { body })));
}

const REPEATS = { day: "daily", week: "weekly", month: "monthly" };

/** Nudges whoever a reminder is for: one phone, or everyone when it's for no one in particular. */
export async function pushReminder(r: typeof schema.reminders.$inferSelect) {
  if (!pushKey) return;
  const phones = await householdPhones(r.householdId);
  const from = phones.find((p) => p.id === r.createdBy)?.name;
  await Promise.all(
    phones.map(({ id, push }) => {
      if (!push || (r.forDevice && r.forDevice !== id)) return;
      // The notes if there are any, else who set it (when it wasn't you) and how often it comes.
      const fromWho = r.createdBy !== id && from && `From ${from}`;
      const body = r.notes || [fromWho, r.repeat && REPEATS[r.repeat]].filter(Boolean).join(" · ");
      return send(id, push, { reminder: r.id, title: r.title, body });
    }),
  );
}
