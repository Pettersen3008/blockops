import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthForm } from "./AuthForm";

function renderSetupForm(onSubmit = vi.fn()) {
  render(
    <AuthForm
      mode="setup"
      eyebrow="Secure first run"
      title="Create the first administrator"
      description="Create an account."
      submitLabel="Create administrator"
      onSubmit={onSubmit}
    />,
  );
  return onSubmit;
}

describe("AuthForm", () => {
  it("shows safe field feedback before submitting weak setup credentials", async () => {
    const user = userEvent.setup();
    const onSubmit = renderSetupForm();
    await user.type(screen.getByLabelText("Username"), "admin");
    await user.type(screen.getByLabelText("Password"), "onlylowercase");
    await user.click(screen.getByRole("button", { name: "Create administrator" }));

    expect(screen.getByText(/Password must use at least three/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits parsed credentials", async () => {
    const user = userEvent.setup();
    const onSubmit = renderSetupForm();
    await user.type(screen.getByLabelText("Username"), "admin.user");
    await user.type(screen.getByLabelText("Password"), "Strong setup pass 42!");
    await user.click(screen.getByRole("button", { name: "Create administrator" }));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      username: "admin.user",
      password: "Strong setup pass 42!",
    });
  });
});
