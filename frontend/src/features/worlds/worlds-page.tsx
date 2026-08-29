import { type ChangeEvent, useRef, useState } from "react";
import { Download, FileArchive, ShieldAlert, Upload, X } from "lucide-react";
import { hasPermission } from "@/features/auth";
import type { Session } from "@/features/auth";
import { Button, ButtonLink, Card, ConfirmDialog, Notice, PageHeader } from "@blockops/ui";
import { formatBytes } from "@/formatters";
import { safeErrorMessage } from "@/lib/api/api-error";
import { worldDownloadUrl } from "./api/download-world";
import { useReplaceWorld } from "./use-replace-world";
import { worldFileSchema } from "./world-schemas";

export function WorldsPage({ session }: { session: Session }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const replace = useReplaceWorld();
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

  const replaceSelectedWorld = () => {
    if (!file) return;

    replace.mutate(file, {
      onSuccess: () => {
        setFile(null);
        setFileError(null);
        setConfirmOpen(false);
        if (inputRef.current) inputRef.current.value = "";
      },
    });
  };

  return (
    <>
      <PageHeader eyebrow="Controlled world data" title="Worlds" description="Export a consistent archive or stage a validated ZIP replacement. This is intentionally not a general file manager." />
      {replace.isError ? <Notice tone="danger">{safeErrorMessage(replace.error)}</Notice> : null}
      {replace.isSuccess ? <Notice tone="success">World replacement completed and the configured server was started.</Notice> : null}
      <div className="grid grid-cols-2 gap-[18px] max-[800px]:grid-cols-1">
        <Card className="relative overflow-hidden p-[26px] max-[660px]:p-5">
          <div className="mb-12 grid size-[72px] rotate-3 place-items-center rounded-[20px] bg-information-muted text-information max-[660px]:mb-[30px] [&_svg]:w-[31px]"><FileArchive aria-hidden="true" /></div>
          <p className="mb-[7px] text-[0.72rem] font-medium tracking-[0.13em] text-primary uppercase">Consistent export</p>
          <h2 className="mb-2.5 text-[1.35rem]">Download current world</h2>
          <p className="max-w-[650px] text-muted-foreground">BlockOps disables saves, flushes the world, archives the primary and dimension directories, then re-enables saves. A stopped server is archived directly.</p>
          <ButtonLink variant="secondary" href={worldDownloadUrl()}><Download aria-hidden="true" /> Prepare download</ButtonLink>
        </Card>
        <Card className="relative overflow-hidden p-[26px] max-[660px]:p-5">
          <div className="mb-12 grid size-[72px] rotate-3 place-items-center rounded-[20px] bg-warning-muted text-warning max-[660px]:mb-[30px] [&_svg]:w-[31px]"><Upload aria-hidden="true" /></div>
          <p className="mb-[7px] text-[0.72rem] font-medium tracking-[0.13em] text-primary uppercase">Administrator only</p>
          <h2 className="mb-2.5 text-[1.35rem]">Replace world from ZIP</h2>
          <p className="max-w-[650px] text-muted-foreground">The ZIP must contain exactly one <code>level.dat</code>. Paths, links, expanded size, staging, rollback, and container restart are validated server-side.</p>
          {canReplace ? (
            <>
              <label className="my-[22px] mb-3 flex min-h-[130px] cursor-pointer flex-col items-center justify-center gap-[5px] rounded-[14px] border-[1.5px] border-dashed border-input bg-[var(--surface-raised)] text-muted-foreground hover:border-primary-hover hover:bg-accent [&_svg]:w-6 [&_svg]:text-primary-hover [&_span]:text-center [&_span]:text-xs [&_strong]:text-foreground" htmlFor="world-file"><Upload aria-hidden="true" /><strong>Choose a world ZIP</strong><span>Compressed ZIP only; the server limit is enforced during upload.</span></label>
              <input ref={inputRef} className="sr-only" id="world-file" type="file" accept=".zip,application/zip" aria-describedby={fileError ? "world-file-error" : undefined} aria-invalid={Boolean(fileError)} onChange={selectFile} />
              {fileError ? <Notice tone="danger"><span id="world-file-error">{fileError}</span></Notice> : null}
              {file ? <div className="mb-3 grid min-h-[60px] grid-cols-[28px_1fr_42px] items-center gap-2.5 rounded-xl border border-border py-2 pr-2 pl-3 [&>svg]:text-primary-hover"><FileArchive aria-hidden="true" /><div className="grid min-w-0 gap-0.5"><strong className="overflow-hidden text-ellipsis whitespace-nowrap">{file.name}</strong><span className="text-xs text-muted-foreground">{formatBytes(file.size)}</span></div><Button variant="ghost" className="size-[42px] min-w-[42px] p-0" aria-label="Remove selected file" onClick={removeFile}><X aria-hidden="true" /></Button></div> : null}
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
        onConfirm={replaceSelectedWorld}
      />
    </>
  );
}
