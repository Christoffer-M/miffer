import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Form } from "react-aria-components";
import { useToken } from "../api";
import { Avatar, Wordmark } from "../brand";
import { Button, buttonClass } from "../components/Button";
import { Confirm } from "../components/Confirm";
import { TextField } from "../components/TextField";
import { CloseIcon, PencilIcon } from "../icons";
import {
  useJoinHousehold,
  useNewLinkCode,
  useRemoveMember,
  useRename,
  useStartHousehold,
} from "../mutations/household";
import { useMembers } from "../queries/household";
import ui from "../ui.module.css";
import s from "./us.module.css";

export const Route = createFileRoute("/us")({ component: Us });

function Us() {
  const token = useToken();
  // Shown right after "Start fresh" so others can link up.
  const [newCode, setNewCode] = useState<string | null>(null);

  return (
    <main className={`${ui.content} ${s.us}`}>
      <div className={s.intro}>
        <Wordmark />
        <h1 className={ui.display}>One list for the whole household</h1>
        <p className={ui.muted}>
          {token
            ? "Everything you add shows up for everyone here."
            : "Enter a code from anyone in your household to link up, or start a new household."}
        </p>
      </div>
      {newCode ? (
        <CodeCard
          code={newCode}
          after={
            <Link to="/groceries" className={buttonClass("primary")}>
              Go to the list
            </Link>
          }
        />
      ) : token ? (
        <Household />
      ) : (
        <LinkUp onStarted={setNewCode} />
      )}
    </main>
  );
}

function LinkUp({ onStarted }: { onStarted: (code: string) => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const join = useJoinHousehold(() => navigate({ to: "/groceries" }));
  const start = useStartHousehold(onStarted);
  const hasName = name.trim().length > 0;

  return (
    <>
      <div className={ui.panel}>
        <TextField
          label="Your name"
          placeholder="So others know who added what"
          value={name}
          onChange={setName}
          maxLength={40}
          autoComplete="given-name"
        />
      </div>
      <Form
        className={ui.panel}
        onSubmit={(e) => {
          e.preventDefault();
          join.mutate({ code, name });
        }}
      >
        <TextField
          label="Link code"
          placeholder="ABC123"
          value={code}
          onChange={(v) => setCode(v.toUpperCase())}
          maxLength={6}
          autoComplete="off"
          inputProps={{ className: s.codeInput, autoCapitalize: "characters", spellCheck: false }}
        />
        {join.error && <p className={ui.error}>{join.error.message}</p>}
        <Button type="submit" isDisabled={!hasName || code.length !== 6 || join.isPending}>
          Link up
        </Button>
      </Form>
      <div className={s.divider}>or</div>
      <Button variant="outline" onPress={() => start.mutate(name)} isDisabled={!hasName || start.isPending}>
        Start a new household
      </Button>
      {start.error && <p className={ui.error}>{start.error.message}</p>}
      <p className={`${ui.muted} ${ui.small} ${s.hint}`}>
        {hasName ? "You'll get a code to share. No account needed." : "Fill in your name first."}
      </p>
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
                      <CloseIcon />
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
        <span className={`${ui.muted} ${ui.small}`}>Get a code and enter it on their phone. Each code links one phone.</span>
        <Button variant="outline" onPress={() => newCode.mutate()} isDisabled={newCode.isPending}>
          Get a link code
        </Button>
      </section>
      {newCode.data && <CodeCard code={newCode.data.code} />}

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
          <PencilIcon />
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

function CodeCard({ code, after }: { code: string; after?: React.ReactNode }) {
  return (
    <div className={ui.panel}>
      <span className={`${ui.muted} ${ui.small}`}>Enter this on their phone within 10 minutes</span>
      <output className={s.code} aria-label={`Link code ${code.split("").join(" ")}`}>
        {code}
      </output>
      {after}
    </div>
  );
}
