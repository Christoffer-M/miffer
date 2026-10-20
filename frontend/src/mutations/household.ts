import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ok, session } from "../api";
import { meQuery } from "../queries/household";

// The callbacks run in the hook, not in mutate(), because saving the token
// re-renders the Us screen and can unmount the form that started the request.

/** "Start fresh": a new household; this phone gets a token and a code to share. */
export const useStartHousehold = (onStarted: (code: string) => void) =>
  useMutation({
    mutationFn: async (name: string) => (await ok(api.households.$post({ json: { name } }))).json(),
    onSuccess: ({ token, deviceId, code }) => {
      session.save(token, deviceId);
      onStarted(code);
    },
  });

/** "Link up": trade a code from someone in the household for a token. */
export const useJoinHousehold = (onJoined: () => void) =>
  useMutation({
    mutationFn: async (json: { code: string; name: string }) =>
      (await ok(api.households.join.$post({ json }))).json(),
    onSuccess: ({ token, deviceId }) => {
      session.save(token, deviceId);
      onJoined();
    },
  });

/** A fresh link code for adding another phone. */
export const useNewLinkCode = () =>
  useMutation({
    mutationFn: async () => (await ok(api.households.code.$post())).json(),
  });

/** Changes this phone's name. */
export function useRename() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => ok(api.households.me.$patch({ json: { name } })),
    onSuccess: () => qc.invalidateQueries(meQuery),
  });
}

/** Removes a phone from the household. Removing this phone means leaving. */
export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ok(api.households.members[":id"].$delete({ param: { id } })),
    onSuccess: (_, id) => {
      if (id === session.deviceId) {
        session.clear();
        qc.clear();
      } else {
        qc.invalidateQueries(meQuery);
      }
    },
  });
}
