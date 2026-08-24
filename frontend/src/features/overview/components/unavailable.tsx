import { TriangleAlert } from "lucide-react";

export function Unavailable({ message }: { message?: string }) {
  return (
    <div className="flex min-h-[70px] items-center gap-2.5 text-muted-foreground [&_svg]:w-[19px] [&_svg]:shrink-0 [&_svg]:text-warning [&_p]:m-0">
      <TriangleAlert aria-hidden="true" />
      <p>{message ?? "This metric is unavailable."}</p>
    </div>
  );
}
