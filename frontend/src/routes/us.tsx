import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useToken } from "../api";
import { Avatar, Wordmark } from "../brand";
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

const primary = `${ui.button} ${ui.primary}`;
const outline = `${ui.button} ${ui.outline}`;

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
            <Link to="/groceries" className={primary}>
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
      <div className={`${ui.panel} ${s.panel}`}>
        <label htmlFor="name">Your name</label>
        <input
          id="name"
          className={s.textInput}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          autoComplete="given-name"
          placeholder="So others know who added what"
        />
      </div>
      <form
        className={`${ui.panel} ${s.panel}`}
        onSubmit={(e) => {
          e.preventDefault();
          join.mutate({ code, name });
        }}
      >
        <label htmlFor="code">Link code</label>
        <input
          id="code"
          className={s.codeInput}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={6}
          autoComplete="off"
          autoCapitalize="characters"
          placeholder="ABC123"
        />
        {join.error && <p className={ui.error}>{join.error.message}</p>}
        <button type="submit" className={primary} disabled={!hasName || code.length !== 6 || join.isPending}>
          Link up
        </button>
      </form>
      <div className={s.divider}>or</div>
      <button type="button" className={outline} onClick={() => start.mutate(name)} disabled={!hasName || start.isPending}>
        Start a new household
      </button>
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
        <strong id="members">In this household · {members.length}</strong>
        <ul className={s.members}>
          {members.map((m, i) => (
            <li key={m.id}>
              <Avatar name={m.name} index={i} />
              {m.id === myId ? (
                <MyName name={m.name} />
              ) : (
                <span className={s.memberName}>{m.name}</span>
              )}
              {m.id !== myId && (
                <button
                  type="button"
                  className={ui.iconButton}
                  aria-label={`Remove ${m.name}`}
                  disabled={remove.isPending}
                  onClick={() => {
                    if (confirm(`Remove ${m.name}'s phone? They'll need a new code to link up again.`)) {
                      remove.mutate(m.id);
                    }
                  }}
                >
                  <CloseIcon />
                </button>
              )}
            </li>
          ))}
        </ul>
        {remove.error && <p className={ui.error}>{remove.error.message}</p>}
      </section>

      <div className={ui.panel}>
        <strong>Add someone</strong>
        <span className={`${ui.muted} ${ui.small}`}>Get a code and enter it on their phone. Each code links one phone.</span>
        <button type="button" className={outline} onClick={() => newCode.mutate()} disabled={newCode.isPending}>
          Get a link code
        </button>
      </div>
      {newCode.data && <CodeCard code={newCode.data.code} />}

      {myId && (
        <button
          type="button"
          className={ui.textButton}
          onClick={() => {
            if (confirm("Leave this household? You'll need a new code to link up again.")) remove.mutate(myId);
          }}
        >
          Leave this household
        </button>
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
          <span className={ui.muted}> (this phone)</span>
        </span>
        <button
          type="button"
          className={ui.iconButton}
          aria-label="Change your name"
          onClick={() => setDraft(name === "Unnamed phone" ? "" : name)}
        >
          <PencilIcon />
        </button>
      </>
    );
  }

  return (
    <form
      className={s.rename}
      onSubmit={(e) => {
        e.preventDefault();
        rename.mutate(draft, { onSuccess: () => setDraft(null) });
      }}
    >
      <input
        aria-label="Your name"
        className={s.textInput}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setDraft(null)}
        maxLength={40}
        autoFocus
      />
      <button type="submit" className={ui.textButton} disabled={!draft.trim() || rename.isPending}>
        Save
      </button>
      <button type="button" className={ui.textButton} onClick={() => setDraft(null)}>
        Cancel
      </button>
      {rename.error && <p className={ui.error}>{rename.error.message}</p>}
    </form>
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
