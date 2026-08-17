import { Link } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button-variants";

export function NotFoundPage() {
  return (
    <div className="restricted-page">
      <p className="eyebrow">Page not found</p>
      <h1>There is nothing here</h1>
      <p>The requested BlockOps route does not exist.</p>
      <Link className={buttonVariants()} to="/overview">Return to overview</Link>
    </div>
  );
}
