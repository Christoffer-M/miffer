import { createFileRoute, redirect } from "@tanstack/react-router";

// Watching is a tab on Series now; this keeps old links to it working.
export const Route = createFileRoute("/watch/watching")({
  beforeLoad: () => {
    throw redirect({ to: "/watch/series", search: { tab: "watching" }, replace: true });
  },
});
