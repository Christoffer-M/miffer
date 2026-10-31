import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import {
  TextField as AriaTextField,
  Dialog,
  Form,
  Heading,
  Label,
  Modal,
  ModalOverlay,
  TextArea,
  ToggleButton,
  ToggleButtonGroup,
} from "react-aria-components";
import { BellOff, Trash2, X } from "lucide-react";
import { type Reminder, session } from "../api";
import { Avatar } from "../brand";
import { canPush, useSetPush } from "../mutations/household";
import { useAddReminder, useChangeReminder, useDeleteReminder } from "../mutations/reminders";
import { isOffline } from "../offline";
import { meQuery, useMembers } from "../queries/household";
import { quickTimes, toLocalInput } from "../reminders";
import { Button } from "./Button";
import { TextField } from "./TextField";
import confirm from "./Confirm.module.css";
import field from "./TextField.module.css";
import s from "./ReminderSheet.module.css";

type Repeat = "day" | "week" | "month";
const REPEAT_CHOICES = [
  ["never", "Never"],
  ["day", "Daily"],
  ["week", "Weekly"],
  ["month", "Monthly"],
] as const;
const EVERYONE = "everyone";

/** Adding a reminder (no `reminder`) or editing one, in a sheet from the bottom of the screen. */
export function ReminderSheet({ reminder, onClose }: { reminder?: Reminder; onClose: () => void }) {
  const { members, myId } = useMembers();
  const { data: me } = useQuery(meQuery);
  const setPush = useSetPush(me?.pushKey);
  const add = useAddReminder();
  const change = useChangeReminder();
  const remove = useDeleteReminder();
  const ids = { when: useId(), repeat: useId(), for: useId() };

  const [title, setTitle] = useState(reminder?.title ?? "");
  const [notes, setNotes] = useState(reminder?.notes ?? "");
  const [remindAt, setRemindAt] = useState(reminder?.remindAt ? new Date(reminder.remindAt) : null);
  const [repeat, setRepeat] = useState<Repeat | null>(reminder?.repeat ?? null);
  // A new one is for this phone until someone else is picked.
  const [forDevice, setForDevice] = useState(reminder ? reminder.forDevice : (myId ?? session.deviceId));
  const [quick] = useState(() => quickTimes()); // fixed while the sheet is open, so a pick stays picked

  // Who won't hear about it: only worth saying when it has a time and the server can send at all.
  const recipients = forDevice ? members.filter((m) => m.id === forDevice) : members;
  const silent = me?.pushKey && remindAt ? recipients.filter((m) => !m.pushOn) : [];

  function save(e: FormEvent) {
    e.preventDefault();
    const fields = {
      title: title.trim(),
      notes: notes.trim(),
      repeat: remindAt ? repeat : null,
      forDevice,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    const at = remindAt?.toISOString() ?? null;
    if (!reminder) add.mutate({ id: crypto.randomUUID(), ...fields, remindAt: at });
    // The time only goes along when it changed: sending it would also end a snooze and send it again.
    else change.mutate({ id: reminder.id, ...fields, ...(at !== reminder.remindAt && { remindAt: at }) });
    if (!isOffline()) onClose(); // refused offline: the sheet stays, so nothing typed is lost
  }

  return (
    <ModalOverlay isOpen isDismissable onOpenChange={(open) => !open && onClose()} className={confirm.overlay}>
      <Modal className={`${confirm.sheet} ${s.sheet}`}>
        <Dialog className={confirm.dialog}>
          <Form className={s.form} onSubmit={save}>
            <div className={s.head}>
              <Heading slot="title" className={s.title}>
                {reminder ? "Edit reminder" : "New reminder"}
              </Heading>
              <Button variant="icon" aria-label="Close" onPress={onClose}>
                <X size={20} aria-hidden />
              </Button>
            </div>

            <TextField label="What" value={title} onChange={setTitle} maxLength={200} autoFocus={!reminder} />

            <AriaTextField value={notes} onChange={setNotes} maxLength={2000} className={field.field}>
              <Label className={field.label}>Notes</Label>
              <TextArea placeholder="Optional" rows={2} className={`${field.input} ${s.textarea}`} />
            </AriaTextField>

            <div className={s.group}>
              <span id={ids.when} className={field.label}>
                When
              </span>
              <div className={s.chips} role="group" aria-labelledby={ids.when}>
                {quick.map((q) => (
                  <ToggleButton
                    key={q.label}
                    className={s.chip}
                    isSelected={remindAt?.getTime() === q.at.getTime()}
                    onChange={() => setRemindAt(q.at)}
                  >
                    {q.label}
                  </ToggleButton>
                ))}
              </div>
              <div className={s.timeRow}>
                <input
                  type="datetime-local"
                  aria-labelledby={ids.when}
                  className={`${field.input} ${s.native}`}
                  value={remindAt ? toLocalInput(remindAt) : ""}
                  onChange={(e) => setRemindAt(e.target.value ? new Date(e.target.value) : null)}
                />
                <Button variant="text" isDisabled={!remindAt} onPress={() => setRemindAt(null)}>
                  No time
                </Button>
              </div>
            </div>

            {remindAt && (
              <div className={`${s.group} ${s.reveal}`}>
                <span id={ids.repeat} className={field.label}>
                  Repeat
                </span>
                <ToggleButtonGroup
                  aria-labelledby={ids.repeat}
                  className={s.chips}
                  selectionMode="single"
                  disallowEmptySelection
                  selectedKeys={[repeat ?? "never"]}
                  onSelectionChange={(keys) => {
                    const [key] = keys;
                    setRepeat(key === "never" ? null : (key as Repeat));
                  }}
                >
                  {REPEAT_CHOICES.map(([key, label]) => (
                    <ToggleButton key={key} id={key} className={s.chip}>
                      {label}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </div>
            )}

            {members.length > 1 && (
              <div className={s.group}>
                <span id={ids.for} className={field.label}>
                  For
                </span>
                <ToggleButtonGroup
                  aria-labelledby={ids.for}
                  className={s.chips}
                  selectionMode="single"
                  disallowEmptySelection
                  selectedKeys={[forDevice ?? EVERYONE]}
                  onSelectionChange={(keys) => {
                    const [key] = keys;
                    setForDevice(key === EVERYONE ? null : String(key));
                  }}
                >
                  {members.map((m) => (
                    <ToggleButton key={m.id} id={m.id} className={`${s.chip} ${s.withAvatar}`}>
                      <Avatar name={m.name} index={members.indexOf(m)} small />
                      {m.id === myId ? "Me" : m.name}
                    </ToggleButton>
                  ))}
                  <ToggleButton id={EVERYONE} className={s.chip}>
                    {members.length === 2 ? "Both" : "Everyone"}
                  </ToggleButton>
                </ToggleButtonGroup>
              </div>
            )}

            {silent.map((m) => (
              <p key={m.id} className={`${s.hint} ${s.reveal}`}>
                <BellOff size={18} aria-hidden className={s.hintIcon} />
                <span>
                  {m.id === myId
                    ? "Notifications are off on this phone, so it won't buzz."
                    : `${m.name} has notifications off, so it won't buzz for them.`}
                </span>
                {m.id === myId && canPush && Notification.permission !== "denied" && (
                  <Button variant="text" onPress={() => setPush.mutate(true)} isDisabled={setPush.isPending}>
                    Turn on
                  </Button>
                )}
              </p>
            ))}

            <div className={s.actions}>
              {reminder && (
                <Button
                  variant="text"
                  className={s.delete}
                  onPress={() => {
                    remove.mutate(reminder.id);
                    if (!isOffline()) onClose();
                  }}
                >
                  <Trash2 size={18} aria-hidden />
                  Delete
                </Button>
              )}
              <Button type="submit" className={s.save} isDisabled={!title.trim()}>
                {reminder ? "Save" : "Add reminder"}
              </Button>
            </div>
          </Form>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
