import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { Card, EmptyState, StatusPill, Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@blockops/ui";
import { formatDate } from "@/formatters";
import type { AuditEvent } from "./audit-schema";

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
    cell: ({ getValue }) => <code className="block max-w-[260px] overflow-hidden text-ellipsis text-muted-foreground">{formatDetails(getValue())}</code>,
  }),
]);

export function AuditResults({ events, filtered }: { events: AuditEvent[]; filtered: boolean }) {
  const table = useTable({ data: events, columns, features });
  const rows = table.getRowModel().rows;

  if (events.length === 0) {
    return filtered
      ? <EmptyState title="No matching audit events" description="Change the filters or perform an administrative action." />
      : <EmptyState title="No audit events yet" description="Administrative actions will appear here." />;
  }

  return (
    <Card className="min-w-0 max-w-full overflow-hidden">
      <Table className="border-collapse text-[0.79rem]">
        <TableCaption className="sr-only">Most recent administrative audit events in server order</TableCaption>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead className="h-[46px] bg-[var(--surface-raised)] px-3.5 text-[0.7rem] tracking-[0.06em] text-muted-foreground uppercase" key={header.id}>
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              {row.getAllCells().map((cell) => (
                <TableCell className="min-h-[54px] px-3.5 py-2.5" key={cell.id}>
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function formatDetails(details?: Record<string, unknown>) {
  if (!details || Object.keys(details).length === 0) return "—";
  const value = JSON.stringify(details);
  return value.length > 180 ? `${value.slice(0, 180)}…` : value;
}
