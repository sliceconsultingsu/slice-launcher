import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  define: {
    "process.env.SLICE_RELEASE_SHA": JSON.stringify(process.env.SLICE_RELEASE_SHA ?? "development"),
  },
  plugins: [
    // No image optimizer: the app serves its few images as static files, and an optimizer would
    // add a public resizing endpoint nothing uses.
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
