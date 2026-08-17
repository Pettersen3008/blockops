import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { authKeys } from "@/features/auth";
import type { Session } from "@/features/auth";
import { configureCsrfToken } from "@/lib/api/api";
import { App } from "./app";
import { AppProviders } from "./providers/app-providers";
import { queryClient } from "./providers/query-provider";

export function bootstrap() {
  const root = document.getElementById("root");
  if (!root) throw new Error("BlockOps root element is missing.");
  configureCsrfToken(() => queryClient.getQueryData<Session>(authKeys.session())?.csrfToken);

  createRoot(root).render(
    <StrictMode>
      <AppProviders>
        <App />
      </AppProviders>
    </StrictMode>,
  );
}
