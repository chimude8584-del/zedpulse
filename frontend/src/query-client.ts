// One QueryClient for the whole app with offline-first defaults.
// Queries serve cached data when offline; mutations are paused and retried on reconnect.
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: "offlineFirst",
      staleTime: 1000 * 30, // 30s
      gcTime: 1000 * 60 * 60 * 24 * 7, // keep cache 7 days
      retry: 2,
    },
    mutations: {
      networkMode: "offlineFirst",
      retry: 3,
    },
  },
});
