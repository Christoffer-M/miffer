import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button as AriaButton, Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { AlarmClock, Bell, Check, ChevronRight, Pencil, Repeat, Undo2 } from "lucide-react";
import { type Reminder, session } from "../api";
import { Avatar } from "../brand";
import { useChangeReminder, useCompleteReminder, useRestoreReminder } from "../mutations/reminders";
import { useMembers } from "../queries/household";
import { remindersQuery } from "../queries/reminders";
import { dueAt, dueFor, formatBack, formatWhen, nextTime, REPEATS, snoozeTimes } from "../reminders";
import { Button } from "./Button";
import { ReminderSheet } from "./ReminderSheet";
import confirm from "./Confirm.module.css";
import ui from "../ui.module.css";
import s from "./DueReminders.module.css";

/** How long Undo stays up after Done or Snooze. */
const UNDO_MS = 6000;

// A tapped notification opens the app with ?reminder=<id> (sw.js): that one comes first.
const tappedAtStart = new URLSearchParams(location.search).get("reminder");

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * What's due for this phone, one at a time, as soon as the app opens: Done, Snooze, or Not now.
 * Not now puts them off until the app is opened again; anything that comes due meanwhile still shows.
 */
export function DueReminders() {
  const { data = [] } = useQuery(remindersQuery);
  const { members, myId, whoIs } = useMembers();
  const complete = useCompleteReminder();
  const change = useChangeReminder();
  const restore = useRestoreReminder();
  const [first, setFirst] = useState(tappedAtStart);
  const [shownId, setShownId] = useState<string | null>(null);
  const [notNow, setNotNow] = useState<string[]>([]);
  const [editing, setEditing] = useState<Reminder | null>(null);
  // The last one dealt with, as it was before, for Undo.
  const [undo, setUndo] = useState<{ before: Reminder; text: string } | null>(null);

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

  function done(r: Reminder) {
    const next = r.repeat && r.remindAt && nextTime(new Date(r.remindAt), r.repeat);
    setUndo({ before: r, text: next ? `Done, back ${formatBack(next)}` : `Done: ${r.title}` });
    complete.mutate(r.id);
  }

  function snooze(r: Reminder, until: Date) {
    setUndo({ before: r, text: `Snoozed, back ${formatBack(until)}` });
    change.mutate({ id: r.id, snoozedUntil: until.toISOString() });
  }

  function undoLast() {
    if (!undo) return;
    const { id, remindAt, snoozedUntil, notified, done } = undo.before;
    restore.mutate({ id, remindAt, snoozedUntil, notified, done });
    setShownId(id);
    setUndo(null);
  }

  // In the sheet while it's open (the screen behind can't be tapped then), else above the tab bar.
  const undoBar = undo && (
    <div className={`${ui.undo} ${due ? s.undoInSheet : ""}`}>
      <span className={ui.undoText}>{undo.text}</span>
      <Button variant="text" className={ui.undoButton} onPress={undoLast}>
        <Undo2 size={18} aria-hidden />
        Undo
      </Button>
    </div>
  );

  const from = shown?.createdBy && whoIs(shown.createdBy);
  const fromMember = members.find((m) => m.id === shown?.createdBy);

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
              <div className={s.handle} aria-hidden />
              <div role="status">{due && undoBar}</div>
              <div className={s.head}>
                <span className={s.bell}>
                  <Bell size={20} aria-hidden />
                </span>
                <div className={s.when}>
                  <span className={ui.eyebrow}>Due · {formatWhen(new Date(dueAt(shown)!)).replace(/^Today /, "")}</span>
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
                {((from && from !== "you") || shown.repeat) && (
                  <p className={s.meta}>
                    {from && from !== "you" && (
                      <>
                        {fromMember && <Avatar name={fromMember.name} index={members.indexOf(fromMember)} small />}
                        <span>From {from}</span>
                      </>
                    )}
                    {from && from !== "you" && shown.repeat && <span aria-hidden>·</span>}
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
                    {snoozeTimes().map((t) => (
                      <AriaButton key={t.label} className={s.chip} onPress={() => snooze(shown, t.at)}>
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
                    <Button variant="text" className={s.skip} onPress={() => setShownId(queue[(at + 1) % queue.length].id)}>
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
        {!due && undoBar}
      </div>
    </>
  );
}
