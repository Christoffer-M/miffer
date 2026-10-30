import { queryOptions, useQuery } from "@tanstack/react-query";
import { ApiError, api, ok, session } from "../api";
import { remembered } from "../remember";

/** This phone's device id and everyone in the household, oldest first. */
export const meQuery = queryOptions({
  queryKey: ["me"],
  ...remembered("me", async () => (await ok(api.households.me.$get())).json()),
});

/** The household's members, plus a way to label who added something. */
export function useMembers() {
  const { data } = useQuery(meQuery);
  // Phones linked before names existed have an empty one.
  const members = (data?.members ?? []).map((m) => ({ ...m, name: m.name || "Unnamed phone" }));
  return {
    members,
    myId: data?.deviceId,
    /** "you" for this phone, the member's name otherwise. */
    whoIs: (id: string | null) =>
      // The stored device id works before the member list has loaded.
      id === (data?.deviceId ?? session.deviceId) ? "you" : (members.find((m) => m.id === id)?.name ?? "someone"),
  };
}

/**
 * Whether a link code would work, without using it up. Link up fetches it before going to
 * the name screen, which then reads the same answer from the cache instead of asking again.
 */
export const codeQuery = (code: string) =>
  queryOptions({
    queryKey: ["code", code],
    queryFn: async () => {
      await ok(api.households.check.$post({ json: { code } }));
      return true;
    },
    staleTime: 60_000,
    retry: false,
    // Each check counts against the join rate limit, so only ask when the screen opens.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

/** The server said this code doesn't work, as opposed to a busy server or a dropped connection. */
export const isWrongCode = (error: unknown) => error instanceof ApiError && error.status === 404;
