import { useOutletContext } from "react-router-dom";
import type { Session } from "@/types";

export function useRouteSession(): Session {
  return useOutletContext<Session>();
}
