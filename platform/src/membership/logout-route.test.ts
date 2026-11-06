import { expect, it } from "vitest";
import { POST } from "../../app/api/auth/logout/route";

it("sign-out requires a same-origin request", async () => {
  const cases: Record<string, string>[] = [{}, { Origin: "https://evil.example" }];
  for (const headers of cases) {
    const response = await POST(
      new Request("https://slice.example/api/auth/logout", { method: "POST", headers }),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  }
});
