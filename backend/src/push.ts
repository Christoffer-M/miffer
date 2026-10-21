import { and, eq, isNotNull, ne } from "drizzle-orm";
import webpush from "web-push";
import { db, schema } from "./db/index.js";

const { devices } = schema;

// Generate once with `npx web-push generate-vapid-keys`. Without them notifications are off.
const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
export const pushKey = VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY ? VAPID_PUBLIC_KEY : null;
if (pushKey) webpush.setVapidDetails(VAPID_SUBJECT ?? "https://localhost", pushKey, VAPID_PRIVATE_KEY!);

// The server POSTs to whatever endpoint a phone hands it, so only the browsers' push services
// are allowed: FCM (Chrome, Android, Edge), Mozilla, Apple and Windows.
const PUSH_HOSTS = /(^|\.)(googleapis\.com|mozilla\.com|push\.apple\.com|notify\.windows\.com)$/;
export const isPushEndpoint = (url: string) => {
  const u = URL.parse(url);
  return u?.protocol === "https:" && PUSH_HOSTS.test(u.hostname);
};

/** Tells everyone else in the household with notifications on that this phone added something. */
export async function pushAdded(householdId: string, deviceId: string, item: string) {
  if (!pushKey) return;
  const [adder] = await db.select({ name: devices.name }).from(devices).where(eq(devices.id, deviceId));
  const others = await db
    .select({ id: devices.id, push: devices.push })
    .from(devices)
    .where(and(eq(devices.householdId, householdId), ne(devices.id, deviceId), isNotNull(devices.push)));
  const body = `${adder?.name || "Someone"} added ${item}`;

  await Promise.all(
    others.map(({ id, push }) =>
      webpush.sendNotification(push!, JSON.stringify({ body }), { TTL: 24 * 60 * 60 }).catch(async (err) => {
        // Gone: the phone turned notifications off or the browser dropped it.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await db.update(devices).set({ push: null }).where(eq(devices.id, id));
        } else console.error("push failed", err);
      }),
    ),
  );
}
