import { render, screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "bun:test";
import type { Session } from "@/features/auth";
import { server } from "@/test/setup";
import { Component as AuditRoute } from "./audit-route";

const operatorSession: Session = {
  user: {
    id: "operator-1",
    username: "operator",
    role: "operator",
    disabled: false,
    createdAt: "2026-08-17T12:00:00Z",
  },
  csrfToken: "csrf-token",
  expiresAt: "2026-08-18T00:00:00Z",
  serverId: "test-server",
};

describe("audit route", () => {
  it("protects the page with audit.read before requesting events", async () => {
    let requests = 0;
    server.use(http.get("/api/v1/fleet/audit", () => {
      requests += 1;
      return HttpResponse.json({ events: [] });
    }));
    render(
      <MemoryRouter initialEntries={["/audit"]}>
        <Routes>
          <Route element={<Outlet context={operatorSession} />}>
            <Route path="/audit" element={<AuditRoute />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Restricted area")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Audit log" })).toBeVisible();
    expect(requests).toBe(0);
  });
});
