# @hraness/vercel-delivery

Fail-closed Vercel delivery proof and Preview response policy for Next.js applications.

The package wraps a Next.js configuration with a deterministic response header that binds a Vercel deployment ID, project ID, registered project name, and full Git object ID. Preview deployments also receive a no-index policy and a validated, UI-only Preview origin.

## Install

Pin the immutable GitHub release:

```json
{
  "dependencies": {
    "@hraness/vercel-delivery": "github:hraness/vercel-delivery#v0.1.1"
  }
}
```

Then install with Bun:

```sh
bun install
```

The package supports Next.js 16.2.x. It runs under Node.js 20.9 or newer.

## Use

```ts
import type { NextConfig } from "next";
import { withProductionDeliveryProof } from "@hraness/vercel-delivery";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default withProductionDeliveryProof(nextConfig, {
  projectName: "example-web",
});
```

`@hraness/vercel-delivery/next-config` is an equivalent compatibility export for Next config files that prefer a descriptive subpath.

On Vercel, the wrapper requires all of these values and throws when any is absent or malformed:

- `VERCEL_DEPLOYMENT_ID`
- `VERCEL_PROJECT_ID`
- `VERCEL_GIT_COMMIT_SHA`
- the registered `projectName` supplied by the caller

Local execution remains unchanged when no Vercel identity is present. Supplying even one deployment identity field activates fail-closed validation.

## Response policy

Every verified deployment receives `X-Hraness-Delivery-Proof`. Its value is a versioned SHA-256 digest over the four deployment identity fields. The digest proves internal consistency; it is not a secret or an authentication credential.

When `VERCEL_ENV=preview`, `VERCEL_URL` must be a bare generated `*.vercel.app` hostname. The wrapper then:

- adds `X-Robots-Tag: noindex, nofollow, noarchive`;
- exposes `NEXT_PUBLIC_HRANESS_VERCEL_PREVIEW_ORIGIN` for UI notices;
- rejects attempts to set that wrapper-owned value to a different origin; and
- rejects direct Next config assignment of `NEXT_PUBLIC_HRANESS_VERCEL_SURFACE_ORIGIN`, which is reserved for a trusted build wrapper.

Do not use either public origin variable as authority for authentication, routing, access control, or server policy.

## Function configs

Async and synchronous Next config functions are supported. Existing headers are awaited and preserved before the package appends its catch-all response policy.

```ts
import { withProductionDeliveryProof } from "@hraness/vercel-delivery";

export default withProductionDeliveryProof(async (phase, { defaultConfig }) => ({
  ...defaultConfig,
  distDir: phase === "phase-production-build" ? ".next" : ".next-local",
}), {
  projectName: "example-web",
});
```

## Development

Use Bun 1.3.14 and Node 24, then run:

```sh
bun install --frozen-lockfile
bun run check
```

The complete check validates the portfolio inventory, lints and typechecks the source, rebuilds the committed distribution, runs behavior tests, packs the release artifact, imports both exports with genuine Node, typechecks an installed consumer under Bundler and NodeNext resolution, and loads the descriptive subpath from a real TypeScript Next config during a production build.

## License

MIT
