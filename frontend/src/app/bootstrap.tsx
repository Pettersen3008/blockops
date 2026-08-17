import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { AppProviders } from "./providers/app-providers";

export function bootstrap() {
  const root = document.getElementById("root");
  if (!root) throw new Error("BlockOps root element is missing.");

  createRoot(root).render(
    <StrictMode>
      <AppProviders>
        <App />
      </AppProviders>
    </StrictMode>,
  );
}
