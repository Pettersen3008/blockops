import { useEffect } from "react";
import { Download } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Button, ButtonLink, ErrorState, LoadingState, PageHeader } from "@blockops/ui";
import { safeErrorMessage } from "@/lib/api/api-error";
import { auditExportUrl } from "./audit-export-url";
import { AuditFilterControls } from "./audit-filter-controls";
import { hasAuditFilters, parseAuditSearchParams } from "./audit-filters";
import { AuditResults } from "./audit-results";
import type { AuditOutcomeFilter } from "./audit-schema";
import { useAuditEvents } from "./use-audit-events";

export function AuditPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = parseAuditSearchParams(searchParams);
  const audit = useAuditEvents(filters);
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
  if (audit.isError && !audit.data) {
    return <ErrorState message={safeErrorMessage(audit.error)} onRetry={() => void audit.refetch()} />;
  }

  const events = audit.data?.pages.flatMap((page) => page.events) ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Administrative evidence"
        title="Audit log"
        description="Authentication, authorization, Minecraft, world, backup, user, and integration actions."
        actions={<ButtonLink variant="secondary" href={auditExportUrl(filters)}><Download aria-hidden="true" /> Export CSV</ButtonLink>}
      />
      <AuditFilterControls filters={filters} onChange={updateFilters} />
      <AuditResults events={events} filtered={hasAuditFilters(filters)} />
      {audit.isFetchNextPageError ? <p className="mt-4 text-sm text-destructive" role="alert">{safeErrorMessage(audit.error)}</p> : null}
      {audit.hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <Button disabled={audit.isFetchingNextPage} variant="secondary" onClick={() => void audit.fetchNextPage()}>
            {audit.isFetchingNextPage ? "Loading more" : audit.isFetchNextPageError ? "Try load more again" : "Load more"}
          </Button>
        </div>
      ) : null}
    </>
  );
}
