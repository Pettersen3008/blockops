import { Archive, Download, RotateCcw, Trash2 } from "lucide-react";
import { StatusPill } from "@/components/common/status-pill";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card } from "@/components/ui/card";
import { formatBytes, formatDate } from "@/formatters";
import { cn } from "@/lib/utils";
import { backupDownloadUrl } from "../api/backup-download-url";
import type { Backup } from "../backup-schema";

export function BackupRow({
  backup,
  canDelete,
  canDownload,
  canRestore,
  onDelete,
  onRestore,
}: {
  backup: Backup;
  canDelete: boolean;
  canDownload: boolean;
  canRestore: boolean;
  onDelete: () => void;
  onRestore: () => void;
}) {
  return (
    <li className="min-w-0">
      <Card className="grid min-h-[100px] min-w-0 grid-cols-[50px_minmax(220px,1fr)_auto] items-center gap-[15px] px-[18px] py-[15px] max-[1180px]:grid-cols-[50px_minmax(0,1fr)] max-[660px]:grid-cols-[42px_minmax(0,1fr)] max-[660px]:p-[14px]">
        <div className="grid size-[46px] place-items-center rounded-xl bg-accent text-primary-hover max-[660px]:size-[42px] [&_svg]:w-[21px]" aria-hidden="true">
          <Archive />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-[9px]">
            <h2 className="m-0 text-[0.95rem]">{formatDate(backup.createdAt)}</h2>
            <StatusPill tone="good">{backup.status}</StatusPill>
          </div>
          <p className="my-1 text-[0.78rem] text-muted-foreground">Created by {backup.createdBy} · {formatBytes(backup.sizeBytes)}</p>
          <code className="block break-all text-muted-foreground">{backup.id}</code>
        </div>
        <div className="flex flex-wrap justify-end gap-[7px] max-[1180px]:col-start-2 max-[1180px]:justify-start max-[660px]:col-[1/-1] max-[660px]:[&_.button]:flex-1">
          {canDownload ? (
            <a className={cn(buttonVariants({ variant: "secondary" }))} href={backupDownloadUrl(backup.id)}>
              <Download aria-hidden="true" />Download
            </a>
          ) : null}
          {canRestore ? <Button variant="secondary" onClick={onRestore}><RotateCcw aria-hidden="true" />Restore</Button> : null}
          {canDelete ? <Button variant="destructive" onClick={onDelete}><Trash2 aria-hidden="true" />Delete</Button> : null}
        </div>
      </Card>
    </li>
  );
}
