import { Link } from "react-router-dom";
import { ButtonLink } from "@blockops/ui";

export function NotFoundPage() {
  return (
    <div className="flex min-h-[540px] flex-col items-center justify-center text-center">
      <p className="mb-[7px] text-[0.72rem] font-medium tracking-[0.13em] text-primary uppercase">Page not found</p>
      <h1 className="mb-[14px]">There is nothing here</h1>
      <p className="max-w-[560px] text-muted-foreground">The requested BlockOps route does not exist.</p>
      <ButtonLink render={<Link to="/overview" />}>Return to overview</ButtonLink>
    </div>
  );
}
