import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { api, ok, session, useToken } from "../api";
import { Wordmark } from "../brand";

export const Route = createFileRoute("/us")({ component: Us });

function Us() {
  const token = useToken();
  // Shown right after "Start fresh" so the partner can link up.
  const [newCode, setNewCode] = useState<string | null>(null);

  return (
    <main className="content us">
      <div className="intro">
        <Wordmark />
        <h1 className="display">One app, two phones</h1>
        <p className="muted">
          {token
            ? "Everything you add is shared with your partner's phone."
            : "Enter the code from your partner's phone to link up. Your grocery list is shared between you."}
        </p>
      </div>
      {newCode ? (
        <CodeCard code={newCode} after={<Link to="/groceries" className="button primary">Go to the list</Link>} />
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
  const join = useMutation({
    mutationFn: async () => (await ok(api.households.join.$post({ json: { code } }))).json(),
    onSuccess: ({ token, deviceId }) => {
      session.save(token, deviceId);
      navigate({ to: "/groceries" });
    },
  });
  const start = useMutation({
    mutationFn: async () => (await ok(api.households.$post())).json(),
    onSuccess: ({ token, deviceId, code }) => {
      session.save(token, deviceId);
      onStarted(code);
    },
  });

  return (
    <>
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          join.mutate();
        }}
      >
        <label htmlFor="code">Link code</label>
        <input
          id="code"
          className="code-input"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={6}
          autoComplete="off"
          autoCapitalize="characters"
          placeholder="ABC123"
        />
        {join.error && <p className="error">{join.error.message}</p>}
        <button type="submit" className="button primary" disabled={code.length !== 6 || join.isPending}>
          Link up
        </button>
      </form>
      <div className="divider">or</div>
      <button type="button" className="button outline" onClick={() => start.mutate()} disabled={start.isPending}>
        Start fresh
      </button>
      {start.error && <p className="error">{start.error.message}</p>}
      <p className="muted small center">You'll get a code to share. No account needed.</p>
    </>
  );
}

function Linked() {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => (await ok(api.households.me.$get())).json(),
  });
  const newCode = useMutation({
    mutationFn: async () => (await ok(api.households.code.$post())).json(),
  });

  return (
    <>
      <div className="panel">
        <strong>{me.data && me.data.devices > 1 ? `Linked · ${me.data.devices} phones` : "Only this phone so far"}</strong>
        <span className="muted small">Need to link another phone? Get a code and enter it there.</span>
        <button type="button" className="button outline" onClick={() => newCode.mutate()} disabled={newCode.isPending}>
          Get a link code
        </button>
      </div>
      {newCode.data && <CodeCard code={newCode.data.code} />}
      <button
        type="button"
        className="text-button"
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
    <div className="panel">
      <span className="muted small">Enter this on your partner's phone within 10 minutes</span>
      <output className="code" aria-label={`Link code ${code.split("").join(" ")}`}>
        {code}
      </output>
      {after}
    </div>
  );
}
