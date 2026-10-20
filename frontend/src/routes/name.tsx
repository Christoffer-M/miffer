import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useLocation, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Form } from "react-aria-components";
import { session } from "../api";
import { Wordmark } from "../brand";
import { Button, buttonClass } from "../components/Button";
import { CodeCard } from "../components/CodeCard";
import { TextField } from "../components/TextField";
import { useJoinHousehold, useStartHousehold } from "../mutations/household";
import { codeQuery, isWrongCode } from "../queries/household";
import ui from "../ui.module.css";
import s from "./us.module.css"; // the same layout as the Us screen this follows on from

// /name#code=ABC123 joins that household (invite links and Link up land here); without a
// code, it starts a new one.
export const Route = createFileRoute("/name")({
  // A phone that's already linked has nothing to do here.
  beforeLoad: () => {
    if (session.token) throw redirect({ to: "/us" });
  },
  component: Name,
});

/**
 * The code after # in the address, or undefined when there is none. It's in the fragment
 * rather than the query so it never reaches the server's logs.
 */
function useCode() {
  const hash = useLocation({ select: (l) => l.hash });
  const code = new URLSearchParams(hash.replace(/^#/, "")).get("code");
  return code === null ? undefined : code.trim().toUpperCase();
}

function Name() {
  const code = useCode();
  const joining = code !== undefined;
  // A link a chat app cut short: an empty or partial code.
  const broken = joining && !/^[A-Z0-9]{6}$/.test(code);
  const navigate = useNavigate();
  const [name, setName] = useState("");
  // Shown once a new household exists, so the others can link up.
  const [newCode, setNewCode] = useState<string | null>(null);
  // Already answered when they came from Link up; checked here when they came from an invite link.
  const check = useQuery({ ...codeQuery(code ?? ""), enabled: joining && !broken });
  const join = useJoinHousehold(() => navigate({ to: "/groceries" }));
  const start = useStartHousehold(setNewCode);
  // Only a code the server turned down rules out joining; a busy server or a dropped
  // connection is worth trying again.
  const wrongCode = broken || isWrongCode(check.error) || isWrongCode(join.error);
  const error = broken
    ? "This invite link is incomplete. Ask for a new one."
    : (check.error ?? join.error ?? start.error)?.message;

  return (
    <main className={`${ui.content} ${s.us}`}>
      <div className={s.intro}>
        <Wordmark />
        <h1 className={ui.display}>{newCode ? "Your household is ready" : "What's your name?"}</h1>
        <p className={ui.muted}>
          {newCode
            ? "Now invite the others."
            : `${joining ? "You're joining a household." : "You're starting a new household."} Your name shows next to what you add.`}
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
      ) : (
        <>
          <Form
            className={ui.panel}
            onSubmit={(e) => {
              e.preventDefault();
              if (joining) join.mutate({ code, name });
              else start.mutate(name);
            }}
          >
            <TextField
              label="Your name"
              placeholder="So others know who added what"
              value={name}
              onChange={setName}
              maxLength={40}
              autoComplete="given-name"
              autoFocus
            />
            {error && <p className={ui.error}>{error}</p>}
            <Button type="submit" isDisabled={!name.trim() || join.isPending || start.isPending || wrongCode}>
              {joining ? "Join household" : "Start household"}
            </Button>
          </Form>
          <Link to="/us" className={buttonClass("text")}>
            {wrongCode ? "Enter a different code" : "Back"}
          </Link>
        </>
      )}
    </main>
  );
}
