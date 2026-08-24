import { Activity, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Overview } from "../overview-schema";

export function WarningsSection({ warnings }: { warnings: Overview["recentWarnings"] }) {
  return (
    <section className="mt-[34px]" aria-labelledby="warnings-heading">
      <div className="mb-[13px] flex items-end justify-between gap-5 [&_h2]:m-0 [&>svg]:w-5 [&>svg]:text-muted-foreground">
        <div><p className="eyebrow">Recent signals</p><h2 id="warnings-heading">Console warnings</h2></div>
        <Activity aria-hidden="true" />
      </div>
      <Card>
        {warnings.length === 0 ? <p className="m-0 p-6 text-center text-muted-foreground">No recent warnings are present in the bounded console buffer.</p> : (
          <ol className="m-0 list-none p-0">
            {warnings.map((line) => (
              <li className="grid min-h-[49px] grid-cols-[20px_minmax(0,1fr)] items-center gap-[11px] border-b border-border px-4 py-2 last:border-b-0 [&_code]:[overflow-wrap:anywhere] [&_svg]:w-4 [&_svg]:text-warning" key={line.sequence}>
                <TriangleAlert aria-hidden="true" /><code>{line.text}</code>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </section>
  );
}
