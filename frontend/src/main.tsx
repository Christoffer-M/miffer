import { MutationCache, onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { shareTokenWithWorker } from "./api";
import { fitAppToKeyboard } from "./keyboard";
import { isOffline, OfflineError } from "./offline";
import { routeTree } from "./routeTree.gen";
import "./tokens.css";

fitAppToKeyboard();
// For notifications and opening offline. Registered up front so turning notifications on can subscribe right away.
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
shareTokenWithWorker();

// TanStack Query takes the phone to be online until it hears otherwise, so tell it what it is.
onlineManager.setOnline(navigator.onLine);
const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    // Offline a change is refused before it shows on screen, rather than kept to send later (offline.ts).
    onMutate: (_, { meta }) => {
      if (isOffline()) throw new OfflineError(`You're offline, so ${meta?.offline ?? "that couldn't be saved"}.`);
    },
  }),
});

// Tabs in bar order: moving right slides the new screen in from the right, and back again.
const TABS = ["/", "/groceries", "/reminders", "/us"];

const router = createRouter({
  routeTree,
  context: { queryClient },
  // Every navigation runs as a View Transition; the animation itself is CSS in tokens.css.
  defaultViewTransition: {
    types: ({ fromLocation, toLocation, pathChanged }) => {
      if (!pathChanged || matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
      const from = TABS.indexOf(fromLocation?.pathname ?? "");
      const to = TABS.indexOf(toLocation.pathname);
      if (from === -1 || to === -1) return ["fade"];
      return [to > from ? "forward" : "back"];
    },
  },
});

// A tapped notification brings an already open app to the screen it's about (sw.js).
navigator.serviceWorker?.addEventListener("message", (e) => {
  if (typeof e.data?.open === "string") router.navigate({ to: e.data.open });
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
