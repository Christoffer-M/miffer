import { useMutation } from "@tanstack/react-query";
import { api, ok, session } from "../api";

// The callbacks run in the hook, not in mutate(), because saving the token
// re-renders the Us screen and can unmount the form that started the request.

/** "Start fresh": a new household; this phone gets a token and a code to share. */
export const useStartHousehold = (onStarted: (code: string) => void) =>
  useMutation({
    mutationFn: async () => (await ok(api.households.$post())).json(),
    onSuccess: ({ token, deviceId, code }) => {
      session.save(token, deviceId);
      onStarted(code);
    },
  });

/** "Link up": trade the partner's code for a token in their household. */
export const useJoinHousehold = (onJoined: () => void) =>
  useMutation({
    mutationFn: async (code: string) => (await ok(api.households.join.$post({ json: { code } }))).json(),
    onSuccess: ({ token, deviceId }) => {
      session.save(token, deviceId);
      onJoined();
    },
  });

/** A fresh link code for linking another phone. */
export const useNewLinkCode = () =>
  useMutation({
    mutationFn: async () => (await ok(api.households.code.$post())).json(),
  });
