import { describe, expect, it, vi } from "vitest";
import { createGoogleAuthCoordinator } from "./oauth-flow.js";

describe("Google OAuth coordination", () => {
  it("allows only one web auth flow and unlocks after it settles", async () => {
    let finish!: () => void;
    const run = vi.fn(() => new Promise<{ ok: true; data: null }>((resolve) => {
      finish = () => resolve({ ok: true, data: null });
    }));
    const connect = createGoogleAuthCoordinator(run);

    const first = connect(false);
    await expect(connect(true)).resolves.toMatchObject({ ok: false, error: { code: "OAUTH_IN_PROGRESS" } });
    expect(run).toHaveBeenCalledTimes(1);

    finish();
    await first;
    void connect(true);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
