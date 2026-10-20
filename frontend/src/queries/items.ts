import { queryOptions } from "@tanstack/react-query";
import { api, ok } from "../api";

export const itemsQuery = queryOptions({
  queryKey: ["items"],
  queryFn: async () => (await ok(api.items.$get())).json(),
});
