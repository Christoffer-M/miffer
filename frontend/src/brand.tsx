import { useMembers } from "./queries/household";
import s from "./brand.module.css";

export const Wordmark = () => (
  <span className={s.wordmark}>
    miffer<span className={s.dot}>.</span>
  </span>
);

// Each member keeps a colour by join order: you, then everyone else.
const COLORS = [s.c0, s.c1, s.c2, s.c3, s.c4];
const SHOWN = 4;

/** A member's initial in their colour. Small: in a row or a chip. */
export function Avatar({ name, index, small }: { name: string; index: number; small?: boolean }) {
  return (
    <span className={`${s.avatar} ${COLORS[index % COLORS.length]} ${small ? s.small : ""}`} title={name} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/** Everyone in the household as overlapping initials. */
export function Avatars() {
  const { members } = useMembers();
  if (members.length === 0) return null;
  const extra = members.length - SHOWN;
  return (
    <div className={s.avatars} aria-label={`Shared with ${members.map((m) => m.name).join(", ")}`}>
      {members.slice(0, SHOWN).map((m, i) => (
        <Avatar key={m.id} name={m.name} index={i} />
      ))}
      {extra > 0 && <span className={`${s.avatar} ${s.more}`}>+{extra}</span>}
    </div>
  );
}
