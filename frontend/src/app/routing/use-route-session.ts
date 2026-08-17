import { useOutletContext } from "react-router-dom";
import type { Session } from "@/features/auth";

export function useRouteSession(): Session {
  return useOutletContext<Session>();
}
