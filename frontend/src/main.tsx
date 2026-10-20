import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { fitAppToKeyboard } from "./keyboard";
import { routeTree } from "./routeTree.gen";
import "./tokens.css";

fitAppToKeyboard();

const queryClient = new QueryClient();

// Tabs in bar order: moving right slides the new screen in from the right, and back again.
const TABS = ["/", "/groceries", "/us"];

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
