import { queryOptions, useQuery } from "@tanstack/react-query";
import { api, ok } from "../api";

/** This phone's device id and everyone in the household, oldest first. */
export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async () => (await ok(api.households.me.$get())).json(),
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
      id === data?.deviceId ? "you" : (members.find((m) => m.id === id)?.name ?? "someone"),
  };
}
