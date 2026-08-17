import { createBrowserRouter, Navigate } from "react-router-dom";
import { AuthenticationBoundary } from "@/features/auth";
import { NotFoundPage } from "./not-found-page";
import { RouteErrorPage } from "./route-error-page";
import { AppShell } from "../shell/app-shell";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AuthenticationBoundary />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/overview" replace /> },
          { path: "overview", lazy: () => import("./route-modules/overview-route") },
          { path: "console", lazy: () => import("./route-modules/console-route") },
          { path: "players", lazy: () => import("./route-modules/players-route") },
          { path: "worlds", lazy: () => import("./route-modules/worlds-route") },
          { path: "backups", lazy: () => import("./route-modules/backups-route") },
          { path: "audit", lazy: () => import("./route-modules/audit-route") },
          { path: "settings", lazy: () => import("./route-modules/settings-route") },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
