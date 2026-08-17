import { TriangleAlert } from "lucide-react";

export function Unavailable({ message }: { message?: string }) {
  return <div className="unavailable"><TriangleAlert aria-hidden="true" /><p>{message ?? "This metric is unavailable."}</p></div>;
}
