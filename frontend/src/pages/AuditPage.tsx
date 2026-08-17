import { useDeferredValue, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ShieldCheck } from "lucide-react";
import { api, errorMessage } from "../api";
import { Card, EmptyState, ErrorState, LoadingState, PageHeader, StatusPill } from "../components/ui";
import { formatDate } from "../formatters";

export function AuditPage() {
  const audit = useQuery({ queryKey: ["audit"], queryFn: api.audit });
  const [search, setSearch] = useState("");
  const [outcome, setOutcome] = useState<"all" | "success" | "failure" | "denied">("all");
  const deferredSearch = useDeferredValue(search.toLowerCase());
  const events = useMemo(() => (audit.data?.events ?? []).filter((event) => {
    if (outcome !== "all" && event.outcome !== outcome) return false;
    if (!deferredSearch) return true;
    return [event.username, event.action, event.target, event.sourceIp, JSON.stringify(event.details ?? {})].join(" ").toLowerCase().includes(deferredSearch);
  }), [audit.data?.events, deferredSearch, outcome]);

  if (audit.isLoading) return <LoadingState label="Loading administrative evidence" />;
  if (audit.isError) return <ErrorState message={errorMessage(audit.error)} onRetry={() => void audit.refetch()} />;
  return (
    <>
      <PageHeader eyebrow="Administrative evidence" title="Audit log" description="The latest 200 authentication, authorization, Minecraft, world, backup, user, and integration actions." actions={<ShieldCheck aria-hidden="true" />} />
      <Card className="audit-tools">
        <label className="search-input"><Search aria-hidden="true" /><span className="sr-only">Search audit events</span><input type="search" placeholder="Search actor, action, target, or source" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <div className="segmented" aria-label="Audit outcome filter">{(["all", "success", "failure", "denied"] as const).map((value) => <button key={value} aria-pressed={outcome === value} onClick={() => setOutcome(value)}>{value}</button>)}</div>
      </Card>
      {events.length === 0 ? <EmptyState title="No matching audit events" description="Change the filters or perform an administrative action." /> : (
        <Card className="table-card">
          <div className="data-table__scroll">
            <table className="data-table">
              <thead><tr><th>Time</th><th>Outcome</th><th>Actor</th><th>Action</th><th>Target</th><th>Source</th><th>Details</th></tr></thead>
              <tbody>{events.map((event) => <tr key={event.id}><td><time dateTime={event.occurredAt}>{formatDate(event.occurredAt)}</time></td><td><StatusPill tone={event.outcome === "success" ? "good" : event.outcome === "denied" ? "warn" : "bad"}>{event.outcome}</StatusPill></td><td>{event.username || "Unauthenticated"}</td><td><code>{event.action}</code></td><td>{event.target}</td><td><code>{event.sourceIp}</code></td><td><code className="details-code">{formatDetails(event.details)}</code></td></tr>)}</tbody>
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
