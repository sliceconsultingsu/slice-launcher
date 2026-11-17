import { describe, expect, it } from "vitest";
import { imageEndpoint } from "./oauth";

describe("the framework's image endpoint", () => {
  it("is recognized however it is spelled", () => {
    for (const path of [
      "/_next/image",
      "/_vinext/image",
      "/_next/image/",
      "/_next//image",
      "//_next/image",
      "///_next///image///",
      "/_next/%69mage",
      "/%5Fnext/image",
      "/_next%2Fimage",
      "/_next/image%2F",
      "/_NEXT/IMAGE",
    ])
      expect(imageEndpoint(path), path).toBe(true);
  });

  it("leaves every other path alone, including badly encoded ones", () => {
    for (const path of [
      "/",
      "/account",
      "/_next/static/app.js",
      "/_next/images",
      "/_next/image.png",
      "/_next/image/extra",
      "/apps/_next/image",
      "/_next/image%",
      "/%E0%A4%A",
    ])
      expect(imageEndpoint(path), path).toBe(false);
  });
});
