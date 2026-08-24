import { useQuery } from "@tanstack/react-query";
import { backupsQuery } from "../backups-query";

export function useBackups() {
  return useQuery(backupsQuery());
}
