import { expect, it } from "vitest";
import { DELETE } from "../../app/api/membership/connections/[id]/route";

const context = { params: Promise.resolve({ id: "grant-1" }) };

it("disconnect requires a same-origin request", async () => {
  const cases: Record<string, string>[] = [{}, { Origin: "https://evil.example" }];
  for (const headers of cases) {
    const response = await DELETE(
      new Request("https://slice.example/api/membership/connections/grant-1", {
        method: "DELETE",
        headers,
      }),
      context,
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  }
});
