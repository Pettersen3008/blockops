import { type ChangeEvent, useRef, useState } from "react";
import { Download, FileArchive, ShieldAlert, Upload, X } from "lucide-react";
import { hasPermission } from "@/features/auth";
import type { Session } from "@/features/auth";
import { ConfirmDialog } from "@/components/common/ActionDialog";
import { Notice } from "@/components/common/Notice";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/formatters";
import { safeErrorMessage } from "@/lib/api/ApiError";
import { WORLD_DOWNLOAD_URL } from "./worlds.api";
import { useReplaceWorld } from "./worlds.hooks";
import { worldFileSchema } from "./world.schemas";

export function WorldsPage({ session }: { session: Session }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const replace = useReplaceWorld(session.csrfToken, () => {
    setFile(null);
    setFileError(null);
    setConfirmOpen(false);
    if (inputRef.current) inputRef.current.value = "";
  });
  const canReplace = hasPermission(session.user.role, "world.replace");

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) {
      setFile(null);
      setFileError(null);
      return;
    }
    const parsed = worldFileSchema.safeParse(selected);
    if (!parsed.success) {
      setFile(null);
      setFileError(parsed.error.issues[0]?.message ?? "Choose a valid world ZIP.");
      event.target.value = "";
      return;
    }
    setFile(parsed.data);
    setFileError(null);
  };

  const removeFile = () => {
    setFile(null);
    setFileError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <>
      <PageHeader eyebrow="Controlled world data" title="Worlds" description="Export a consistent archive or stage a validated ZIP replacement. This is intentionally not a general file manager." />
      {replace.isError ? <Notice tone="danger">{safeErrorMessage(replace.error)}</Notice> : null}
      {replace.isSuccess ? <Notice tone="success">World replacement completed and the configured server was started.</Notice> : null}
      <div className="two-column-grid">
        <Card className="world-card">
          <div className="world-card__art world-card__art--download"><FileArchive aria-hidden="true" /></div>
          <p className="eyebrow">Consistent export</p>
          <h2>Download current world</h2>
          <p>BlockOps disables saves, flushes the world, archives the primary and dimension directories, then re-enables saves. A stopped server is archived directly.</p>
          <a className={cn(buttonVariants({ variant: "secondary" }))} href={WORLD_DOWNLOAD_URL}><Download aria-hidden="true" /> Prepare download</a>
        </Card>
        <Card className="world-card">
          <div className="world-card__art world-card__art--upload"><Upload aria-hidden="true" /></div>
          <p className="eyebrow">Administrator only</p>
          <h2>Replace world from ZIP</h2>
          <p>The ZIP must contain exactly one <code>level.dat</code>. Paths, links, expanded size, staging, rollback, and container restart are validated server-side.</p>
          {canReplace ? (
            <>
              <label className="drop-zone" htmlFor="world-file"><Upload aria-hidden="true" /><strong>Choose a world ZIP</strong><span>Compressed ZIP only; the server limit is enforced during upload.</span></label>
              <input ref={inputRef} className="sr-only" id="world-file" type="file" accept=".zip,application/zip" aria-describedby={fileError ? "world-file-error" : undefined} aria-invalid={Boolean(fileError)} onChange={selectFile} />
              {fileError ? <Notice tone="danger"><span id="world-file-error">{fileError}</span></Notice> : null}
              {file ? <div className="selected-file"><FileArchive aria-hidden="true" /><div><strong>{file.name}</strong><span>{formatBytes(file.size)}</span></div><Button variant="ghost" className="icon-button" aria-label="Remove selected file" onClick={removeFile}><X aria-hidden="true" /></Button></div> : null}
              <Button variant="destructive" disabled={!file || replace.isPending} onClick={() => setConfirmOpen(true)}><ShieldAlert aria-hidden="true" /> Replace current world</Button>
            </>
          ) : <Notice>Only administrators can upload or replace world data.</Notice>}
        </Card>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="Replace the current world?"
        description="BlockOps will stop the configured Minecraft container, move the existing worlds into a temporary rollback directory, install this ZIP, and start the server. Players will be disconnected."
        confirmLabel="Replace world"
        dangerous
        busy={replace.isPending}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => file && replace.mutate(file)}
      />
    </>
  );
}
