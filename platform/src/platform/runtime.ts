import { env } from "cloudflare:workers";
import { identify } from "../membership/current";
import { Repository } from "../membership/repository";
import { apps } from "../lib/apps";
import { modules } from "./registry.generated";
import { createPlatform } from "./dispatch";

export function platform() {
  const dependencies = {
    catalog: apps,
    modules,
    verify: identify,
    loadState: () => new Repository(env.MEMBERSHIP_DB).load(),
  };
  return createPlatform(dependencies);
}
