import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Form } from "react-aria-components";
import { Pencil, X } from "lucide-react";
import { useToken } from "../api";
import { Avatar, Wordmark } from "../brand";
import { Button } from "../components/Button";
import { CodeCard } from "../components/CodeCard";
import { Confirm } from "../components/Confirm";
import { TextField } from "../components/TextField";
import { canPush, useNewLinkCode, useRemoveMember, useRename, useSetPush } from "../mutations/household";
import { codeQuery, meQuery, useMembers } from "../queries/household";
import ui from "../ui.module.css";
import s from "./us.module.css";

export const Route = createFileRoute("/us")({ component: Us });

function Us() {
  const token = useToken();

  return (
    <main className={`${ui.content} ${s.us}`}>
      <div className={s.intro}>
        <Wordmark />
        <h1 className={ui.display}>Your household, together</h1>
        <p className={ui.muted}>
          {token
            ? "Everything you add shows up for everyone here."
            : "Enter a code from anyone in your household to link up, or start a new household."}
        </p>
      </div>
      {token ? <Household /> : <LinkUp />}
    </main>
  );
}

/** The first step: a code to join with, or a new household. Both go on to the name screen. */
function LinkUp() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  // A wrong code shows here, before they've typed their name.
  const check = useMutation({
    mutationFn: (code: string) => queryClient.fetchQuery(codeQuery(code)),
    onSuccess: (_, code) => navigate({ to: "/name", hash: `code=${code}` }),
  });

  return (
    <>
      <Form
        className={ui.panel}
        onSubmit={(e) => {
          e.preventDefault();
          check.mutate(code);
        }}
      >
        <TextField
          label="Link code"
          placeholder="ABC123"
          value={code}
          onChange={(v) => {
            setCode(v.toUpperCase());
            check.reset(); // the error was about the code they're now changing
          }}
          maxLength={6}
          autoComplete="off"
          inputProps={{ className: `${ui.codeBox} ${s.codeInput}`, autoCapitalize: "characters", spellCheck: false }}
        />
        {check.error && <p className={ui.error}>{check.error.message}</p>}
        <Button type="submit" isDisabled={code.length !== 6 || check.isPending}>
          Link up
        </Button>
      </Form>
      <div className={s.divider}>or</div>
      <Button variant="outline" onPress={() => navigate({ to: "/name" })}>
        Start a new household
      </Button>
      <p className={`${ui.muted} ${ui.small} ${s.hint}`}>No account needed.</p>
    </>
  );
}

function Household() {
  const { members, myId } = useMembers();
  const remove = useRemoveMember();
  const newCode = useNewLinkCode();

  return (
    <>
      <section className={ui.panel} aria-labelledby="members">
        <h2 id="members" className={s.panelTitle}>
          In this household · {members.length}
        </h2>
        <ul className={s.members}>
          {members.map((m, i) => (
            <li key={m.id}>
              <Avatar name={m.name} index={i} />
              {m.id === myId ? (
                <MyName name={m.name} />
              ) : (
                <>
                  <span className={s.memberName}>{m.name}</span>
                  <Confirm
                    title={`Remove ${m.name}?`}
                    message={`${m.name}'s phone will stop seeing the list right away. They'll need a new code to link up again.`}
                    confirmLabel="Remove"
                    onConfirm={() => remove.mutate(m.id)}
                  >
                    <Button variant="icon" aria-label={`Remove ${m.name}`} isDisabled={remove.isPending}>
                      <X size={18} aria-hidden />
                    </Button>
                  </Confirm>
                </>
              )}
            </li>
          ))}
        </ul>
        {remove.error && <p className={ui.error}>{remove.error.message}</p>}
      </section>

      <section className={ui.panel} aria-labelledby="add-someone">
        <h2 id="add-someone" className={s.panelTitle}>
          Add someone
        </h2>
        <span className={`${ui.muted} ${ui.small}`}>Get an invite link to send them, or a code to enter on their phone. Each one links one phone.</span>
        <Button variant="outline" onPress={() => newCode.mutate()} isDisabled={newCode.isPending}>
          Invite someone
        </Button>
      </section>
      {newCode.data && <CodeCard code={newCode.data.code} />}

      <Notifications />

      {myId && (
        <Confirm
          title="Leave this household?"
          message="This phone will stop seeing the list. You'll need a new code from someone in the household to link up again."
          confirmLabel="Leave"
          onConfirm={() => remove.mutate(myId)}
        >
          <Button variant="text">Leave this household</Button>
        </Confirm>
      )}
    </>
  );
}

/** Turning on notifications for when someone else adds something. Hidden if the server has none set up. */
function Notifications() {
  const { data } = useQuery(meQuery);
  const setPush = useSetPush(data?.pushKey);
  if (!data?.pushKey) return null;

  return (
    <section className={ui.panel} aria-labelledby="notifications">
      <h2 id="notifications" className={s.panelTitle}>
        Notifications
      </h2>
      <span className={`${ui.muted} ${ui.small}`}>
        {!canPush
          ? "To get a notification when someone adds something, add miffer to your Home Screen and open it from there."
          : data.pushOn
            ? "This phone gets a notification when someone else adds something."
            : "Get a notification when someone else adds something."}
      </span>
      {canPush && (
        <Button variant="outline" onPress={() => setPush.mutate(!data.pushOn)} isDisabled={setPush.isPending}>
          {data.pushOn ? "Turn off" : "Turn on"}
        </Button>
      )}
      {setPush.error && <p className={ui.error}>{setPush.error.message}</p>}
    </section>
  );
}

/** Your own row: your name with an edit button, or a small form while editing. */
function MyName({ name }: { name: string }) {
  const [draft, setDraft] = useState<string | null>(null); // null: not editing
  const rename = useRename();

  if (draft === null) {
    return (
      <>
        <span className={s.memberName}>
          {name}
          <span className={ui.muted}> (you)</span>
        </span>
        <Button
          variant="icon"
          aria-label="Change your name"
          onPress={() => setDraft(name === "Unnamed phone" ? "" : name)}
        >
          <Pencil size={18} aria-hidden />
        </Button>
      </>
    );
  }

  return (
    <Form
      className={s.rename}
      onSubmit={(e) => {
        e.preventDefault();
        rename.mutate(draft, { onSuccess: () => setDraft(null) });
      }}
    >
      <TextField
        label="Your name"
        hideLabel
        value={draft}
        onChange={setDraft}
        onKeyDown={(e) => e.key === "Escape" && setDraft(null)}
        maxLength={40}
        autoFocus
        className={s.renameField}
        inputProps={{ className: s.renameInput }}
      />
      <Button type="submit" variant="text" className={s.renameButton} isDisabled={!draft.trim() || rename.isPending}>
        Save
      </Button>
      <Button variant="text" className={s.renameButton} onPress={() => setDraft(null)}>
        Cancel
      </Button>
      {rename.error && <p className={ui.error}>{rename.error.message}</p>}
    </Form>
  );
}
