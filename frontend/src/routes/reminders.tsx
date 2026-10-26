import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button as AriaButton } from "react-aria-components";
import { AlarmClock, Bell, Clock, Plus, Repeat } from "lucide-react";
import type { Reminder } from "../api";
import { Avatar, Avatars } from "../brand";
import { Button } from "../components/Button";
import { Checkbox } from "../components/Checkbox";
import { ReminderSheet } from "../components/ReminderSheet";
import {
  useChangeReminder,
  useClearDoneReminders,
  useCompleteReminder,
} from "../mutations/reminders";
import { useMembers } from "../queries/household";
import { remindersQuery } from "../queries/reminders";
import { clock, dueAt, formatWhen, REPEATS, snoozeTimes, sortReminders } from "../reminders";
import ui from "../ui.module.css";
import s from "./reminders.module.css";

export const Route = createFileRoute("/reminders")({ component: Reminders });

function Reminders() {
  const { data = [], isPending, error } = useQuery(remindersQuery);
  const { due, upcoming, done } = sortReminders(data);
  const complete = useCompleteReminder();
  const change = useChangeReminder();
  const clear = useClearDoneReminders();
  // The sheet: a new reminder, one being edited, or closed.
  const [open, setOpen] = useState<Reminder | "new" | null>(null);

  return (
    <>
      <header className={s.header}>
        <span className={ui.eyebrow}>miffer</span>
        <div className={`${ui.row} ${s.titleRow}`}>
          <h1 className={ui.display}>Reminders</h1>
          <Avatars />
        </div>
        <p className={ui.muted}>
          {due.length} due · {upcoming.length} coming up
        </p>
      </header>

      <main className={`${ui.content} ${s.list}`}>
        {error && <p className={ui.error}>{error.message}</p>}
        {!isPending && data.length === 0 && (
          <p className={`${ui.muted} ${s.empty}`}>Nothing to remember yet. Add something for you, or for both of you.</p>
        )}

        {due.length > 0 && (
          <section aria-labelledby="due" className={s.section}>
            <h2 id="due" className={`${ui.eyebrow} ${s.sectionTitle}`}>
              Due now
            </h2>
            {due.map((r) => (
              <div key={r.id} className={s.dueCard}>
                <div className={s.row}>
                  <Checkbox
                    aria-label={`Done: ${r.title}`}
                    className={s.dueCheck}
                    isSelected={false}
                    onChange={() => complete.mutate(r.id)}
                  >
                    {null}
                  </Checkbox>
                  <AriaButton className={s.open} onPress={() => setOpen(r)}>
                    <strong className={s.dueTitle}>{r.title}</strong>
                    <span className={`${s.meta} ${s.dueMeta}`}>
                      <Bell size={14} aria-hidden />
                      {clock(new Date(dueAt(r)!))}
                      <About reminder={r} />
                    </span>
                  </AriaButton>
                </div>
                <div className={s.snooze} role="group" aria-label={`Snooze ${r.title}`}>
                  <span className={s.snoozeLabel}>Snooze</span>
                  {snoozeTimes().map((t) => (
                    <AriaButton
                      key={t.label}
                      className={s.snoozeChip}
                      onPress={() => change.mutate({ id: r.id, snoozedUntil: t.at.toISOString() })}
                    >
                      {t.label}
                    </AriaButton>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {upcoming.length > 0 && (
          <section aria-labelledby="upcoming" className={s.section}>
            <h2 id="upcoming" className={`${ui.eyebrow} ${ui.muted} ${s.sectionTitle}`}>
              Coming up
            </h2>
            <ul className={s.sheet}>
              {upcoming.map((r) => (
                <li key={r.id} className={s.item}>
                  <Checkbox aria-label={`Done: ${r.title}`} isSelected={false} onChange={() => complete.mutate(r.id)}>
                    {null}
                  </Checkbox>
                  <AriaButton className={s.open} onPress={() => setOpen(r)}>
                    <span className={s.itemTitle}>{r.title}</span>
                    <When reminder={r} />
                  </AriaButton>
                  <For reminder={r} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {done.length > 0 && (
          <section aria-labelledby="done">
            <div className={`${ui.row} ${s.doneHead}`}>
              <h2 id="done" className={`${ui.eyebrow} ${ui.muted} ${s.sectionTitle}`}>
                Done
              </h2>
              <Button variant="text" onPress={() => clear.mutate()}>
                Clear
              </Button>
            </div>
            <ul className={s.doneList}>
              {done.map((r) => (
                <li key={r.id}>
                  <Checkbox
                    className={s.doneCheck}
                    isSelected
                    onChange={() => change.mutate({ id: r.id, done: false })}
                  >
                    <s>{r.title}</s>
                  </Checkbox>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <div className={s.addBar}>
        <Button className={s.addButton} onPress={() => setOpen("new")}>
          <Plus size={20} strokeWidth={2.5} aria-hidden />
          New reminder
        </Button>
      </div>

      {open && (
        <ReminderSheet
          key={open === "new" ? "new" : open.id}
          reminder={open === "new" ? undefined : open}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

/** Who set it (when it wasn't you) and how often it comes, after the time. */
function About({ reminder: r }: { reminder: Reminder }) {
  const { whoIs } = useMembers();
  const from = r.createdBy && whoIs(r.createdBy);
  return (
    <>
      {from && from !== "you" && <span>· from {from}</span>}
      <Repeats reminder={r} />
    </>
  );
}

/** "· weekly" with its icon, for a repeating one. */
function Repeats({ reminder: r }: { reminder: Reminder }) {
  if (!r.repeat) return null;
  return (
    <>
      <span aria-hidden>·</span>
      <Repeat size={14} aria-hidden />
      {REPEATS[r.repeat]}
    </>
  );
}

function When({ reminder: r }: { reminder: Reminder }) {
  if (r.snoozedUntil) {
    return (
      <span className={`${s.meta} ${s.soon}`}>
        <AlarmClock size={14} aria-hidden />
        {/* "back at 13:17" today, "back tomorrow 09:00", "back Thu 17:30" */}
        Snoozed · back{" "}
        {formatWhen(new Date(r.snoozedUntil))
          .replace(/^Today /, "at ")
          .replace(/^(Tomorrow|Yesterday)/, (day) => day.toLowerCase())}
      </span>
    );
  }
  if (!r.remindAt) return <span className={s.meta}>No time set</span>;
  return (
    <span className={s.meta}>
      <Clock size={14} aria-hidden />
      {formatWhen(new Date(r.remindAt))}
      <Repeats reminder={r} />
    </span>
  );
}

/** Whose it is: one avatar, or everyone's when it's for the whole household. */
function For({ reminder: r }: { reminder: Reminder }) {
  const { members, whoIs } = useMembers();
  if (members.length < 2) return null;
  const shown = r.forDevice ? members.filter((m) => m.id === r.forDevice) : members;
  return (
    <span className={s.for} aria-label={r.forDevice ? `For ${whoIs(r.forDevice)}` : "For everyone"}>
      {shown.map((m) => (
        <Avatar key={m.id} name={m.name} index={members.indexOf(m)} small />
      ))}
    </span>
  );
}
