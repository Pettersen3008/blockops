import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-7 flex items-end justify-between gap-7 max-[660px]:mb-[22px] max-[660px]:flex-col max-[660px]:items-start">
      <div className="max-w-[760px]">
        {eyebrow ? <p className="mb-[7px] text-[0.72rem] font-medium tracking-[0.13em] text-primary uppercase">{eyebrow}</p> : null}
        <h1>{title}</h1>
        <p className="m-0 text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex flex-none gap-2.5 max-[660px]:w-full max-[660px]:flex-wrap [&_.button]:max-[660px]:flex-1">{actions}</div> : null}
    </header>
  );
}
