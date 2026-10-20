import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { session, useToken } from "../api";
import { Wordmark } from "../brand";
import { useJoinHousehold, useNewLinkCode, useStartHousehold } from "../mutations/household";
import { meQuery } from "../queries/household";
import ui from "../ui.module.css";
import s from "./us.module.css";

export const Route = createFileRoute("/us")({ component: Us });

const primary = `${ui.button} ${ui.primary}`;
const outline = `${ui.button} ${ui.outline}`;

function Us() {
  const token = useToken();
  // Shown right after "Start fresh" so the partner can link up.
  const [newCode, setNewCode] = useState<string | null>(null);

  return (
    <main className={`${ui.content} ${s.us}`}>
      <div className={s.intro}>
        <Wordmark />
        <h1 className={ui.display}>One app, two phones</h1>
        <p className={ui.muted}>
          {token
            ? "Everything you add is shared with your partner's phone."
            : "Enter the code from your partner's phone to link up. Your grocery list is shared between you."}
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
        <Linked />
      ) : (
        <LinkUp onStarted={setNewCode} />
      )}
    </main>
  );
}

function LinkUp({ onStarted }: { onStarted: (code: string) => void }) {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const join = useJoinHousehold(() => navigate({ to: "/groceries" }));
  const start = useStartHousehold(onStarted);

  return (
    <>
      <form
        className={`${ui.panel} ${s.panel}`}
        onSubmit={(e) => {
          e.preventDefault();
          join.mutate(code);
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
        <button type="submit" className={primary} disabled={code.length !== 6 || join.isPending}>
          Link up
        </button>
      </form>
      <div className={s.divider}>or</div>
      <button type="button" className={outline} onClick={() => start.mutate()} disabled={start.isPending}>
        Start fresh
      </button>
      {start.error && <p className={ui.error}>{start.error.message}</p>}
      <p className={`${ui.muted} ${ui.small} ${s.hint}`}>You'll get a code to share. No account needed.</p>
    </>
  );
}

function Linked() {
  const qc = useQueryClient();
  const me = useQuery(meQuery);
  const newCode = useNewLinkCode();

  return (
    <>
      <div className={ui.panel}>
        <strong>{me.data && me.data.devices > 1 ? `Linked · ${me.data.devices} phones` : "Only this phone so far"}</strong>
        <span className={`${ui.muted} ${ui.small}`}>Need to link another phone? Get a code and enter it there.</span>
        <button type="button" className={outline} onClick={() => newCode.mutate()} disabled={newCode.isPending}>
          Get a link code
        </button>
      </div>
      {newCode.data && <CodeCard code={newCode.data.code} />}
      <button
        type="button"
        className={ui.textButton}
        onClick={() => {
          if (!confirm("Unlink this phone? You'll need a new code from your partner to link up again.")) return;
          session.clear();
          qc.clear();
        }}
      >
        Unlink this phone
      </button>
    </>
  );
}

function CodeCard({ code, after }: { code: string; after?: React.ReactNode }) {
  return (
    <div className={ui.panel}>
      <span className={`${ui.muted} ${ui.small}`}>Enter this on your partner's phone within 10 minutes</span>
      <output className={s.code} aria-label={`Link code ${code.split("").join(" ")}`}>
        {code}
      </output>
      {after}
    </div>
  );
}
