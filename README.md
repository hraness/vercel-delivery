# @hraness/vercel-delivery

Fail-closed Vercel delivery proof and Preview response policy for Next.js
applications.

Wrap one Next.js configuration. Once Vercel exposes any delivery identity, the
build must present a complete deployment ID, project ID, registered project
name, and full Git object ID. Preview responses receive the same delivery-proof
header as production plus a no-index policy and a validated, display-only
Preview origin. Local Next.js execution stays unchanged when no Vercel identity
is present.

## Install

Pin the immutable `v0.1.2` GitHub release:

```json
{
  "dependencies": {
    "@hraness/vercel-delivery": "github:hraness/vercel-delivery#v0.1.2"
  }
}
```

Install with Bun 1.3.14:

```sh
bun install
```

## Preview, prove, then promote

### 1. Wrap the Next.js configuration

Use the descriptive Next config export in `next.config.ts`:

```ts
import type { NextConfig } from "next";
import { withProductionDeliveryProof } from "@hraness/vercel-delivery/next-config";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default withProductionDeliveryProof(nextConfig, {
  projectName: "example-web",
});
```

Pass the lowercase, kebab-case Vercel project name your delivery system has
registered. The package validates the name's shape and binds it into the proof,
but it does not call Vercel to confirm the registration.

### 2. Expose the provider identity

Connect the repository to a Vercel project and enable **Automatically expose
System Environment Variables** in the project's Environment Variables
settings. Vercel documents that setting and the generated values in
[System environment variables](https://vercel.com/docs/environment-variables/system-environment-variables).

The wrapper requires these build values:

- `VERCEL_DEPLOYMENT_ID`, shaped like `dpl_...`;
- `VERCEL_PROJECT_ID`, shaped like `prj_...`; and
- `VERCEL_GIT_COMMIT_SHA`, as a full 40- or 64-character lowercase hexadecimal
  Git object ID.

For a Preview build, Vercel must also supply `VERCEL_ENV=preview` and a bare,
generated `VERCEL_URL` hostname such as
`example-web-fix-copy-team.vercel.app`. The value must not contain `https://`, a
port, credentials, or a path.

### 3. Deploy a Preview and inspect the response

Push a non-production branch through the project's normal Git workflow. Vercel
describes its branch-to-Preview behavior in
[Deploying Git repositories](https://vercel.com/docs/git).

Inspect the generated Preview URL:

```sh
PREVIEW_URL=https://example-web-fix-copy-team.vercel.app
curl --silent --show-error --head "$PREVIEW_URL"
```

Every path receives headers with this shape:

```http
X-Hraness-Delivery-Proof: v1.<64 lowercase hexadecimal characters>
X-Robots-Tag: noindex, nofollow, noarchive
```

The repository's deterministic identity fixture produces this exact proof and
Next config environment value:

```text
X-Hraness-Delivery-Proof: v1.0ef5da6b39d97f0a0c74e7862729a54360330ad99b197306cfd52fb6937bdac1
NEXT_PUBLIC_HRANESS_VERCEL_PREVIEW_ORIGIN=https://example-web-fix-copy-team.vercel.app
```

Your proof changes when the deployment ID, project ID, project name, or Git
object ID changes. The Preview origin is evidence for a notice in the rendered
interface. It is not an authorization or routing input.

### 4. Promote through the existing production workflow

Merge or deploy through the Vercel project's configured production path, then
inspect the production response:

```sh
PRODUCTION_URL=https://example.com
curl --silent --show-error --head "$PRODUCTION_URL"
```

The package adds `X-Hraness-Delivery-Proof` to production. It adds the robots
policy only when `VERCEL_ENV=preview`; any other robots header remains owned by
the application. The package does not create, promote, roll back, or route a
Vercel deployment.

## Fail-closed contract

Configuration evaluation stops when Vercel identity is present but cannot form
one complete, valid proof.

| Input state | Result |
| --- | --- |
| No `VERCEL=1`, deployment ID, project ID, or Git object ID | Return the original object or function unchanged. |
| `VERCEL=1` or any one identity field | Require all three provider identity fields and a valid caller-supplied `projectName`. |
| Invalid `dpl_...`, `prj_...`, project-name, or full Git object ID shape | Throw before the wrapped config can add delivery headers. |
| Active proof with `VERCEL_ENV=preview` | Require a lowercase, bare, generated `*.vercel.app` `VERCEL_URL`. |
| Preview origin already set to another value in `nextConfig.env` | Throw because the Preview wrapper owns that display value. |
| `NEXT_PUBLIC_HRANESS_VERCEL_SURFACE_ORIGIN` set directly in `nextConfig.env` | Throw because only a separate trusted build wrapper may issue it. |

The activation rule is deliberate. A partial Vercel environment does not fall
back to local behavior, omit the proof, or emit a weaker header.

If the provider suppresses `VERCEL` and every deployment identity field, the
package cannot distinguish that build from the inert local path. Enabling
Vercel's system environment variables is therefore part of the delivery
contract, not an optional convenience. The package makes no provider request
that could infer the missing state.

The proof token is `v1.` followed by a SHA-256 digest over a versioned namespace
and the four NUL-separated identity fields. It is deterministic public metadata,
not a secret, signature, bearer token, or independent attestation from Vercel.

## Provider prerequisites

The package expects the provider and application to establish these facts
before Next.js evaluates the wrapped configuration:

| Owner | Required fact |
| --- | --- |
| Vercel project | System environment variables are exposed to the build. |
| Git-backed deployment | `VERCEL_GIT_COMMIT_SHA` names the full object that triggered the deployment. |
| Vercel deployment | `VERCEL_DEPLOYMENT_ID` and `VERCEL_PROJECT_ID` use the provider's native identifiers. |
| Preview deployment | `VERCEL_URL` is the provider-generated hostname without a scheme or path. |
| Application | `projectName` is the reviewed registered name in lowercase kebab case. |

Do not copy provider identifiers into `next.config.ts`. Let the wrapper read
`process.env` during the Vercel build. The optional `environment` argument is
for deterministic tests and trusted adapters that already own an equivalent
input boundary.

The package needs no Vercel API token and performs no provider API or network
request.

## Recover a failed deployment

Read the first thrown message, repair its named boundary, and trigger a new
deployment. Changes to Vercel environment settings do not alter an existing
deployment.

| Failure | Check | Recovery |
| --- | --- | --- |
| `requires exposed deployment, project, and Git identity` | One of the three provider identity fields is absent, or `VERCEL=1` is present without them. | Enable system environment variables, confirm the deployment has Git metadata, and redeploy. Do not synthesize a missing field. |
| `requires a valid Vercel deployment ID` or project ID | A caller or adapter changed the provider value. | Remove the override and use the exact Vercel system variable. |
| `requires a valid registered project name` | `projectName` is empty, mixed case, or not lowercase kebab case. | Pass the reviewed registered name, for example `example-web`. |
| `requires a full Git object ID` | The SHA is missing, abbreviated, uppercase, or not hexadecimal. | Restore the provider's complete Git commit value. |
| `requires VERCEL_URL to be a bare generated .vercel.app hostname` | The Preview URL contains a scheme, port, path, credentials, uppercase text, or a non-Vercel domain. | Use Vercel's generated `VERCEL_URL` without modification. |
| `is owned by the Vercel Preview notice wrapper` | `nextConfig.env` already sets the display-only Preview origin to another value. | Remove the manual assignment and consume the value issued by the wrapper. |
| `may only be issued by a trusted Vercel build wrapper` | Application config sets the trusted surface-origin variable directly. | Remove it. This package intentionally has no authority to issue that value. |
| No proof header on a Vercel deployment | The wrapper was not loaded, or Vercel exposed none of its build markers. | Confirm the exported config is wrapped, enable system environment variables, and redeploy. |
| No header during ordinary local development | No Vercel identity is present. | Treat this as the expected inert path. Inject a complete fake `environment` only in a deterministic test if proof behavior needs local coverage. |

If a corrected provider setting must take effect, Vercel requires a new
deployment. See
[Managing environment variables](https://vercel.com/docs/environment-variables/managing-environment-variables)
for the provider's redeployment rule.

## Authority boundary

| Surface | Authority and limit |
| --- | --- |
| Vercel system variables | Provider-owned build inputs. The package parses them but does not fetch or authenticate them. |
| `projectName` | Caller-owned input. The package validates its shape but cannot verify the Vercel registration. |
| `X-Hraness-Delivery-Proof` | Public deterministic receipt for one complete identity tuple. Verify it against independently known deployment facts when assurance matters. |
| `NEXT_PUBLIC_HRANESS_VERCEL_PREVIEW_ORIGIN` | UI evidence for a Preview notice. Never use it for authentication, access control, routing, fetch authority, or server policy. |
| `NEXT_PUBLIC_HRANESS_VERCEL_SURFACE_ORIGIN` | Reserved for a separate trusted Vercel build wrapper. This package rejects direct assignment and never issues it. |
| Existing Next.js headers | Application-owned. The wrapper awaits and preserves them before appending one catch-all policy. |

## Interface map

Both package entry points expose the same runtime and type surface:

- `@hraness/vercel-delivery`
- `@hraness/vercel-delivery/next-config`

| Export | Purpose |
| --- | --- |
| `withProductionDeliveryProof(nextConfig, options)` | Wrap an object, synchronous function, or asynchronous Next.js config. This is the normal application entry point. |
| `productionDeliveryProofToken(identity)` | Validate one explicit identity and return its deterministic `v1.<digest>` token. |
| `resolveProductionDeliveryProof(options)` | Return the current environment's token, return `null` for the inert local path, or throw on an active incomplete identity. |
| `resolveVercelPreviewNoticeOrigin(environment)` | Return the validated `https://...vercel.app` Preview origin, return `null` outside Preview, or throw on an invalid Preview hostname. |
| `PRODUCTION_DELIVERY_PROOF_HEADER` | `X-Hraness-Delivery-Proof`. |
| `PREVIEW_ROBOTS_HEADER` and `PREVIEW_ROBOTS_POLICY` | `X-Robots-Tag` and `noindex, nofollow, noarchive`. |
| `PREVIEW_NOTICE_ORIGIN_ENV` | The wrapper-owned, display-only Preview-origin key. |
| `TRUSTED_PREVIEW_SURFACE_ORIGIN_ENV` | The reserved trusted-wrapper key that application config may not assign. |
| `ProductionDeliveryProofIdentity`, `ProductionDeliveryProofEnvironment`, and `ProductionDeliveryProofOptions` | Readonly input contracts. |
| `NextConfigFunction` and `NextConfigExport` | Supported object and function config shapes. |

### Function configurations

The wrapper supports synchronous and asynchronous config functions. It awaits
the existing function and any existing `headers()` result before appending the
catch-all delivery policy:

```ts
import { withProductionDeliveryProof } from "@hraness/vercel-delivery/next-config";

export default withProductionDeliveryProof(async (phase, { defaultConfig }) => ({
  ...defaultConfig,
  distDir: phase === "phase-production-build" ? ".next" : ".next-local",
  async headers() {
    return [{
      source: "/api/:path*",
      headers: [{ key: "Cache-Control", value: "no-store" }],
    }];
  },
}), {
  projectName: "example-web",
});
```

The result retains the application header rule and appends a separate
`/:path*` rule for delivery proof and, on Preview, the robots policy.

## Compatibility

| Contract | Supported or verified boundary |
| --- | --- |
| Current release | Immutable GitHub tag `v0.1.2`. |
| Next.js peer range | `>=16.2.0 <17.0.0`. |
| Installed-package build fixtures | Next.js `16.2.12` and `16.3.0`. |
| Runtime | Node.js `20.9.0` or newer. |
| Release verification | Genuine Node 24 and Bun `1.3.14`. |
| Modules | ESM package with equivalent root and `./next-config` exports. |
| TypeScript consumers | Verified under Bundler and NodeNext module resolution. |
| Next config forms | Object, synchronous function, and asynchronous function. |

The peer range is the supported contract. The two exact Next.js versions name
the installed-consumer builds exercised by the current package smoke test.

## FAQ

### Does the package deploy to Vercel?

No. It wraps Next.js configuration during a build. Your Git integration,
Vercel dashboard, CLI, or existing delivery system owns deployment and
promotion.

### Can the delivery-proof header authenticate a request?

No. Anyone who knows the four input fields can compute the same digest. Use
trusted server-side state and the application's authentication system for
authorization.

### Why does local Next.js run without a proof header?

The no-identity path is intentionally inert. This keeps ordinary local builds
independent from Vercel while preventing a partial Vercel build from silently
behaving like local development.

### Can a custom Preview domain become the notice origin?

No. The notice value comes only from Vercel's bare generated `VERCEL_URL` and
must end in `.vercel.app`. Applications may serve other domains, but this
display evidence does not infer or authorize them.

### Are existing response headers replaced?

No. The wrapper awaits the application's existing `headers()` function,
preserves its rules, and appends a separate catch-all rule.

## Next action

Pin `v0.1.2`, wrap `next.config.ts`, enable Vercel's system environment
variables, and inspect one generated Preview response. Promote only after the
Preview contains both the versioned proof and the no-index policy.

## Development

Use Bun 1.3.14 and Node 24:

```sh
bun install --frozen-lockfile --ignore-scripts
bun run check
```

The complete check validates the public boundary and portfolio inventory,
lints and typechecks the source, rebuilds the committed distribution, runs
behavior tests, packs the release artifact, imports both exports with genuine
Node, typechecks installed consumers under Bundler and NodeNext resolution, and
loads the descriptive subpath from real TypeScript Next configs on Next.js
16.2.12 and 16.3.0.

Read [Security](SECURITY.md) for reporting and authority boundaries and
[Contributing](CONTRIBUTING.md) before proposing a compatibility change.

## License

MIT
