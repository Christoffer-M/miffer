import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button as AriaButton, Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { AlarmClock, Bell, Check, ChevronRight, Pencil, Repeat } from "lucide-react";
import { type Reminder, session } from "../api";
import { Avatar } from "../brand";
import { type ReminderTimes, useChangeReminder, useCompleteReminder, useRestoreReminder } from "../mutations/reminders";
import { useMembers } from "../queries/household";
import { remindersQuery } from "../queries/reminders";
import { dueAt, dueFor, formatBack, formatDue, nextTime, REPEATS, SNOOZES } from "../reminders";
import { Button } from "./Button";
import { ReminderSheet } from "./ReminderSheet";
import { UndoBar } from "./UndoBar";
import confirm from "./Confirm.module.css";
import ui from "../ui.module.css";
import s from "./DueReminders.module.css";

/** How long Undo stays up after Done or Snooze. */
const UNDO_MS = 6000;

// A tapped notification opens the app with ?reminder=<id> (sw.js): that one comes first.
// Taken off the address before the router reads it, so a reload doesn't put it first again.
const startUrl = new URL(location.href);
const tappedAtStart = startUrl.searchParams.get("reminder");
if (tappedAtStart) {
  startUrl.searchParams.delete("reminder");
  history.replaceState(history.state, "", startUrl);
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * What's due for this phone, one at a time, as soon as the app opens: Done, Snooze, or Not now.
 * Not now puts them off until the app is opened again; anything that comes due meanwhile still shows.
 * Undo shows just above the tabs, or in `undoSpot` when the screen has a bar of its own there (UndoBar.tsx).
 */
export function DueReminders({ undoSpot }: { undoSpot: HTMLElement | null }) {
  const { data = [] } = useQuery(remindersQuery);
  const { members, myId, whoIs } = useMembers();
  const complete = useCompleteReminder();
  const change = useChangeReminder();
  const restore = useRestoreReminder();
  const [first, setFirst] = useState(tappedAtStart);
  const [shownId, setShownId] = useState<string | null>(null);
  const [notNow, setNotNow] = useState<string[]>([]);
  const [editing, setEditing] = useState<Reminder | null>(null);
  // The last one dealt with: as it was before, and as Done or Snooze left it (once that's through), for Undo.
  const [undo, setUndo] = useState<{ before: Reminder; after: Promise<ReminderTimes>; text: string } | null>(null);

  useEffect(() => {
    const opened = () => document.visibilityState === "visible" && setNotNow([]);
    // A notification tapped while the app was already open (sw.js).
    const tapped = (e: MessageEvent) => {
      const id = e.data?.reminder;
      if (typeof id !== "string") return;
      setFirst(id);
      setShownId(id);
      setNotNow((ids) => ids.filter((x) => x !== id));
    };
    document.addEventListener("visibilitychange", opened);
    navigator.serviceWorker?.addEventListener("message", tapped);
    return () => {
      document.removeEventListener("visibilitychange", opened);
      navigator.serviceWorker?.removeEventListener("message", tapped);
    };
  }, []);

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  const queue = dueFor(data, myId ?? session.deviceId ?? "", first).filter((r) => !notNow.includes(r.id));
  const due = queue.find((r) => r.id === shownId) ?? queue[0];
  // The last one shown stays in the sheet while it slides away, instead of the sheet emptying out.
  const [shown, setShown] = useState(due);
  if (due && due !== shown) setShown(due);
  const at = queue.indexOf(shown!);
  // Which way the next one slides in: on from Done, Snooze or Skip, back for Undo. Not when the sheet opens.
  const [moved, setMoved] = useState<"next" | "back" | null>(null);
  if (!due && moved) setMoved(null);

  function done(r: Reminder) {
    setMoved("next");
    const next = r.repeat && r.remindAt && nextTime(new Date(r.remindAt), r.repeat);
    const after = complete.mutateAsync(r.id);
    after.catch(() => {}); // the refetch shows it wasn't done; an Undo then finds nothing to undo
    setUndo({ before: r, after, text: next ? `Done, back ${formatBack(next)}` : `Done: ${r.title}` });
  }

  function snooze(r: Reminder, until: Date) {
    const snoozedUntil = until.toISOString();
    setMoved("next");
    change.mutate({ id: r.id, snoozedUntil });
    const after = Promise.resolve({ remindAt: r.remindAt, snoozedUntil, done: false });
    setUndo({ before: r, after, text: `Snoozed, back ${formatBack(until)}` });
  }

  function undoLast() {
    if (!undo) return;
    const { id, remindAt, snoozedUntil, notified, done } = undo.before;
    restore.mutate({ id, remindAt, snoozedUntil, notified, done, ifStill: undo.after });
    setShownId(id);
    if (due) setMoved("back");
    setUndo(null);
  }

  function skip() {
    setShownId(queue[(at + 1) % queue.length].id);
    setMoved("next");
  }

  // In the sheet while it's open (the screen behind can't be tapped then), else above the tab bar.
  const undoBar = undo && <UndoBar text={undo.text} onUndo={undoLast} className={due ? s.undoInSheet : ""} />;

  // Who it's from, unless it's this phone's own.
  const from = shown?.createdBy && whoIs(shown.createdBy);
  const sender = from && from !== "you" ? from : null;
  const senderMember = sender ? members.find((m) => m.id === shown?.createdBy) : undefined;

  return (
    <>
      <ModalOverlay
        isOpen={!!due && !editing}
        isDismissable
        onOpenChange={(open) => !open && setNotNow(queue.map((r) => r.id))}
        className={confirm.overlay}
      >
        <Modal className={`${confirm.sheet} ${s.sheet}`}>
          {shown && (
            <Dialog className={s.dialog}>
              {/* One item in the column, so the empty status line under the handle takes no room. */}
              <div className={s.top}>
                <div className={s.handle} aria-hidden />
                <div role="status">{due && undoBar}</div>
              </div>
              {/* The reminder itself: slides in as the next one comes up. */}
              <div key={shown.id} className={`${s.card} ${moved ? s[moved] : ""}`}>
                <div className={s.head}>
                  <span className={s.bell}>
                    <Bell size={20} aria-hidden className={ui.ring} />
                  </span>
                  <div className={s.when}>
                    <span className={ui.eyebrow}>Due · {formatDue(new Date(dueAt(shown)!))}</span>
                    {queue.length > 1 && (
                      <span className={s.count}>
                        {at + 1} of {queue.length}
                      </span>
                    )}
                  </div>
                  <Button variant="icon" aria-label="Edit reminder" onPress={() => setEditing(shown)}>
                    <Pencil size={20} aria-hidden />
                  </Button>
                </div>

                <div className={s.body}>
                  <Heading slot="title" className={s.title}>
                    {shown.title}
                  </Heading>
                  {(sender || shown.repeat) && (
                    <p className={s.meta}>
                      {sender && (
                        <>
                          {senderMember && <Avatar name={senderMember.name} index={members.indexOf(senderMember)} small />}
                          <span>From {sender}</span>
                        </>
                      )}
                      {sender && shown.repeat && <span aria-hidden>·</span>}
                      {shown.repeat && (
                        <>
                          <Repeat size={14} aria-hidden />
                          <span>{capitalize(REPEATS[shown.repeat])}</span>
                        </>
                      )}
                    </p>
                  )}
                  {shown.notes && <p className={s.notes}>{shown.notes}</p>}
                </div>
              </div>

              <div className={s.actions}>
                <Button className={s.done} onPress={() => done(shown)}>
                  <Check size={22} strokeWidth={2.5} aria-hidden />
                  Done
                </Button>
                <div className={s.snooze} role="group" aria-labelledby="due-snooze">
                  <span id="due-snooze" className={s.snoozeLabel}>
                    <AlarmClock size={15} aria-hidden />
                    Snooze
                  </span>
                  <div className={s.snoozeTimes}>
                    {SNOOZES.map((t) => (
                      <AriaButton key={t.label} className={s.chip} onPress={() => snooze(shown, t.at())}>
                        {t.label}
                      </AriaButton>
                    ))}
                  </div>
                </div>
                <div className={s.footer}>
                  <Button variant="text" className={s.notNow} onPress={() => setNotNow(queue.map((r) => r.id))}>
                    Not now
                  </Button>
                  {queue.length > 1 && (
                    <Button variant="text" className={s.skip} onPress={skip}>
                      Skip
                      <ChevronRight size={18} strokeWidth={2.5} aria-hidden />
                    </Button>
                  )}
                </div>
              </div>
            </Dialog>
          )}
        </Modal>
      </ModalOverlay>

      {editing && <ReminderSheet reminder={editing} onClose={() => setEditing(null)} />}

      {/* Always there (empty when there's nothing to undo) so screen readers announce it. */}
      <div className={s.undoSlot} role="status">
        {!due && !undoSpot && undoBar}
      </div>
      {!due && undoSpot && undoBar && createPortal(undoBar, undoSpot)}
    </>
  );
}
