import { useDeferredValue, useEffect, useMemo } from "react";
import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { Search, ShieldCheck } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/AsyncState";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/formatters";
import { safeErrorMessage } from "@/lib/api/ApiError";
import { matchesAuditFilters, parseOutcomeFilter } from "./audit.filters";
import { useAuditEvents } from "./audit.hooks";
import type { AuditEvent, AuditOutcomeFilter } from "./audit.schemas";

const features = tableFeatures({});
const columnHelper = createColumnHelper<typeof features, AuditEvent>();
const columns = columnHelper.columns([
  columnHelper.accessor("occurredAt", {
    header: "Time",
    cell: ({ getValue }) => <time dateTime={getValue()}>{formatDate(getValue())}</time>,
  }),
  columnHelper.accessor("outcome", {
    header: "Outcome",
    cell: ({ getValue }) => {
      const outcome = getValue();
      return <StatusPill tone={outcome === "success" ? "good" : outcome === "denied" ? "warn" : "bad"}>{outcome}</StatusPill>;
    },
  }),
  columnHelper.accessor("username", {
    header: "Actor",
    cell: ({ getValue }) => getValue() || "Unauthenticated",
  }),
  columnHelper.accessor("action", {
    header: "Action",
    cell: ({ getValue }) => <code>{getValue()}</code>,
  }),
  columnHelper.accessor("target", { header: "Target" }),
  columnHelper.accessor("sourceIp", {
    header: "Source",
    cell: ({ getValue }) => <code>{getValue()}</code>,
  }),
  columnHelper.accessor("details", {
    header: "Details",
    cell: ({ getValue }) => <code className="details-code">{formatDetails(getValue())}</code>,
  }),
]);

const outcomes = ["all", "success", "failure", "denied"] as const;

export function AuditPage() {
  const audit = useAuditEvents();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const rawOutcome = searchParams.get("outcome");
  const outcome = parseOutcomeFilter(rawOutcome);

  const updateFilters = (nextQuery: string, nextOutcome: AuditOutcomeFilter) => {
    const next = new URLSearchParams();
    if (nextQuery) next.set("q", nextQuery);
    next.set("outcome", nextOutcome);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    if (rawOutcome === outcome) return;
    const next = new URLSearchParams(searchParams);
    next.set("outcome", outcome);
    setSearchParams(next, { replace: true });
  }, [outcome, rawOutcome, searchParams, setSearchParams]);

  const deferredQuery = useDeferredValue(query);
  const filteredEvents = useMemo(() => (audit.data?.events ?? []).filter((event) => (
    matchesAuditFilters(event, deferredQuery, outcome)
  )), [audit.data?.events, deferredQuery, outcome]);
  const table = useTable({ data: filteredEvents, columns, features });

  if (audit.isLoading) return <LoadingState label="Loading administrative evidence" />;
  if (audit.isError || !audit.data) {
    return <ErrorState message={safeErrorMessage(audit.error)} onRetry={() => void audit.refetch()} />;
  }

  const rows = table.getRowModel().rows;
  return (
    <>
      <PageHeader eyebrow="Administrative evidence" title="Audit log" description="The latest 200 authentication, authorization, Minecraft, world, backup, user, and integration actions." actions={<ShieldCheck aria-hidden="true" />} />
      <Card className="audit-tools">
        <label className="search-input"><Search aria-hidden="true" /><span className="sr-only">Search audit events</span><input type="search" placeholder="Search actor, action, target, or source" value={query} onChange={(event) => updateFilters(event.target.value, outcome)} /></label>
        <div className="segmented" aria-label="Audit outcome filter">
          {outcomes.map((value) => <button key={value} aria-pressed={outcome === value} onClick={() => updateFilters(query, value)}>{value}</button>)}
        </div>
      </Card>
      {rows.length === 0 ? <EmptyState title="No matching audit events" description="Change the filters or perform an administrative action." /> : (
        <Card className="table-card">
          <div className="data-table__scroll">
            <table className="data-table">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th key={header.id}>{header.isPlaceholder ? null : <table.FlexRender header={header} />}</th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    {row.getAllCells().map((cell) => <td key={cell.id}><table.FlexRender cell={cell} /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

function formatDetails(details?: Record<string, unknown>) {
  if (!details || Object.keys(details).length === 0) return "—";
  const value = JSON.stringify(details);
  return value.length > 180 ? `${value.slice(0, 180)}…` : value;
}
