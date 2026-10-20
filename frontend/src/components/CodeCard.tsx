import { Share2 } from "lucide-react";
import { useState } from "react";
import ui from "../ui.module.css";
import { Button } from "./Button";
import s from "./CodeCard.module.css";

/** A link code to read out, and an invite link to send that opens the name screen with it filled in. */
export function CodeCard({ code, after }: { code: string; after?: React.ReactNode }) {
  // In the fragment, so the code never reaches the server's logs.
  const link = new URL(`/name#code=${code}`, location.origin).href;
  // What happened to the last link copied. Kept with that link, so a new code starts fresh.
  const [copy, setCopy] = useState<{ link: string; ok: boolean } | null>(null);
  const copied = copy?.link === link ? copy.ok : undefined;

  // The share sheet on phones; copying the link elsewhere.
  const share = async () => {
    if (navigator.share) {
      try {
        return await navigator.share({ title: "miffer", text: "Join our grocery list on miffer", url: link });
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return; // closed the sheet
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopy({ link, ok: true });
    } catch {
      setCopy({ link, ok: false }); // no clipboard access: show the link to copy by hand
    }
  };

  return (
    <div className={ui.panel}>
      <span className={`${ui.muted} ${ui.small}`}>Send them the link, or enter the code on their phone, within a day</span>
      <output className={`${ui.codeBox} ${s.code}`} aria-label={`Link code ${code.split("").join(" ")}`}>
        {code}
      </output>
      <Button variant="outline" onPress={share}>
        <Share2 size={18} aria-hidden />
        {copied ? "Link copied" : "Share invite link"}
      </Button>
      {copied === false && (
        <p className={`${ui.small} ${s.link}`}>
          Couldn't copy it. Send them this link: <span>{link}</span>
        </p>
      )}
      {after}
    </div>
  );
}
