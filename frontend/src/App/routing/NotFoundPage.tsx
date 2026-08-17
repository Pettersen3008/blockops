import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="restricted-page">
      <p className="eyebrow">Page not found</p>
      <h1>There is nothing here</h1>
      <p>The requested BlockOps route does not exist.</p>
      <Link className="button button--primary" to="/overview">Return to overview</Link>
    </div>
  );
}
