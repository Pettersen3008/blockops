import { useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { ErrorState, LoadingState } from "@/components/common/async-state";
import { PageHeader } from "@/components/common/page-header";
import { safeErrorMessage } from "@/lib/api/api-error";
import { AuditFilterControls } from "./audit-filter-controls";
import { parseAuditSearchParams } from "./audit-filters";
import { AuditResults } from "./audit-results";
import type { AuditOutcomeFilter } from "./audit-schema";
import { useAuditEvents } from "./use-audit-events";

export function AuditPage() {
  const audit = useAuditEvents();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = parseAuditSearchParams(searchParams);
  const rawOutcome = searchParams.get("outcome");

  const updateFilters = (nextQuery: string, nextOutcome: AuditOutcomeFilter) => {
    const next = new URLSearchParams();
    if (nextQuery) next.set("q", nextQuery);
    next.set("outcome", nextOutcome);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    if (rawOutcome === filters.outcome) return;
    const next = new URLSearchParams(searchParams);
    next.set("outcome", filters.outcome);
    setSearchParams(next, { replace: true });
  }, [filters.outcome, rawOutcome, searchParams, setSearchParams]);

  if (audit.isLoading) return <LoadingState label="Loading administrative evidence" />;
  if (audit.isError || !audit.data) {
    return <ErrorState message={safeErrorMessage(audit.error)} onRetry={() => void audit.refetch()} />;
  }

  return (
    <>
      <PageHeader eyebrow="Administrative evidence" title="Audit log" description="The latest 200 authentication, authorization, Minecraft, world, backup, user, and integration actions." actions={<ShieldCheck aria-hidden="true" />} />
      <AuditFilterControls filters={filters} onChange={updateFilters} />
      <AuditResults events={audit.data.events} filters={filters} />
    </>
  );
}
