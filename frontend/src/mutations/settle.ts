import type { QueryClient } from "@tanstack/react-query";

// Changes to a list go to the server one at a time and show on screen before they get there.
// A refetch while some are still on their way would show those as not done yet for a moment,
// so the list refetches only after the last one, and live pings for it wait for that too.

/** Whether this phone still has changes to this list on their way. */
export const changesPending = (qc: QueryClient, list: string) => qc.isMutating({ mutationKey: [list] }) > 0;

/** For onSettled: refetches once this was the last change in line. */
export function refetchWhenLast(qc: QueryClient, list: string, refetch: () => Promise<unknown>) {
  if (qc.isMutating({ mutationKey: [list] }) === 1) return refetch();
}
