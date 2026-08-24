import { Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { AuditFilters } from "./audit-filters";
import type { AuditOutcomeFilter } from "./audit-schema";

const outcomes = ["all", "success", "failure", "denied"] as const;

export function AuditFilterControls({
  filters,
  onChange,
}: {
  filters: AuditFilters;
  onChange: (query: string, outcome: AuditOutcomeFilter) => void;
}) {
  return (
    <Card className="mb-4 flex min-w-0 flex-col items-stretch gap-2.5 p-3.5 sm:flex-row sm:items-center">
      <label className="relative flex min-w-0 flex-1 items-center sm:min-w-[220px]">
        <Search className="pointer-events-none absolute left-3 size-[17px] text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Search audit events</span>
        <Input
          className="h-11 pl-[38px]!"
          type="search"
          placeholder="Search actor, action, target, source, or details"
          value={filters.query}
          onChange={(event) => onChange(event.target.value, filters.outcome)}
        />
      </label>
      <div className="flex min-h-[42px] max-w-full overflow-x-auto rounded-[10px] border border-input bg-card p-[3px]" role="group" aria-label="Audit outcome filter">
        {outcomes.map((outcome) => (
          <button
            className="min-h-9 shrink-0 cursor-pointer rounded-[7px] border-0 bg-transparent px-3 text-sm text-muted-foreground capitalize aria-pressed:bg-muted aria-pressed:font-bold aria-pressed:text-foreground"
            key={outcome}
            type="button"
            aria-pressed={filters.outcome === outcome}
            onClick={() => onChange(filters.query, outcome)}
          >
            {outcome}
          </button>
        ))}
      </div>
    </Card>
  );
}
