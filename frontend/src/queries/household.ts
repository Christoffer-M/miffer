import { queryOptions } from "@tanstack/react-query";
import { api, ok } from "../api";

/** This phone's device id and how many phones share the household. */
export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async () => (await ok(api.households.me.$get())).json(),
});
