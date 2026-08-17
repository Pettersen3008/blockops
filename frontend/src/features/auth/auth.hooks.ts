import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi } from "./auth.api";
import { authKeys } from "./auth.keys";
import type { AuthCredentials, Session } from "./auth.schemas";

export function useSetupStatus() {
  return useQuery({ queryKey: authKeys.setup(), queryFn: authApi.setupStatus, staleTime: Infinity });
}

export function useSessionQuery(enabled: boolean) {
  return useQuery({
    queryKey: authKeys.session(),
    queryFn: authApi.session,
    enabled,
    retry: false,
    staleTime: 60_000,
  });
}

function useAuthenticationMutation(mutationFn: (credentials: AuthCredentials) => Promise<Session>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (session) => {
      queryClient.setQueryData(authKeys.setup(), { required: false });
      queryClient.setQueryData(authKeys.session(), session);
    },
  });
}

export function useSetupMutation() {
  return useAuthenticationMutation(authApi.setup);
}

export function useLoginMutation() {
  return useAuthenticationMutation(authApi.login);
}

export function useLogoutMutation(csrfToken: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => authApi.logout(csrfToken),
    onSettled: () => {
      queryClient.clear();
      window.history.replaceState({}, "", "/overview");
      window.location.reload();
    },
  });
}
