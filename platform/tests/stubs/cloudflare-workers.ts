// Node test stand-in for the Workers runtime module. Only unit tests use it; workerd tests and
// production builds resolve the real "cloudflare:workers".
export class WorkerEntrypoint {
  constructor(
    protected ctx: unknown,
    protected env: unknown,
  ) {}
}
export const env = {};
