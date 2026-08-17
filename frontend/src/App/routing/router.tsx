import { createBrowserRouter, Navigate } from "react-router-dom";
import { AuthenticationBoundary } from "./AuthenticationBoundary";
import { NotFoundPage } from "./NotFoundPage";
import { RouteErrorPage } from "./RouteErrorPage";
import { AppShell } from "../shell/AppShell";

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
          { path: "overview", lazy: () => import("./route-modules/OverviewRoute") },
          { path: "console", lazy: () => import("./route-modules/ConsoleRoute") },
          { path: "players", lazy: () => import("./route-modules/PlayersRoute") },
          { path: "worlds", lazy: () => import("./route-modules/WorldsRoute") },
          { path: "backups", lazy: () => import("./route-modules/BackupsRoute") },
          { path: "audit", lazy: () => import("./route-modules/AuditRoute") },
          { path: "settings", lazy: () => import("./route-modules/SettingsRoute") },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
