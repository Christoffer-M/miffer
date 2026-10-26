import { queryOptions } from "@tanstack/react-query";
import { api, ok } from "../api";

export const remindersQuery = queryOptions({
  queryKey: ["reminders"],
  queryFn: async () => (await ok(api.reminders.$get())).json(),
});
