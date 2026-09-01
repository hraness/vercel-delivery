import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import {
  PREVIEW_NOTICE_ORIGIN_ENV,
  PREVIEW_ROBOTS_HEADER,
  PREVIEW_ROBOTS_POLICY,
  PRODUCTION_DELIVERY_PROOF_HEADER,
  productionDeliveryProofToken,
  withProductionDeliveryProof,
  type ProductionDeliveryProofIdentity,
} from "./index";

const manifestUrl = new URL("../package.json", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);

async function documentation(): Promise<Readonly<{
  manifest: Readonly<{
    engines: Readonly<{ node: string }>;
    name: string;
    peerDependencies: Readonly<{ next: string }>;
    version: string;
  }>;
  readme: string;
}>> {
  const [manifestSource, readme] = await Promise.all([
    readFile(manifestUrl, "utf8"),
    readFile(readmeUrl, "utf8"),
  ]);
  const manifest = JSON.parse(manifestSource) as {
    readonly engines?: { readonly node?: unknown };
    readonly name?: unknown;
    readonly peerDependencies?: { readonly next?: unknown };
    readonly version?: unknown;
  };
  if (
    typeof manifest.name !== "string"
    || typeof manifest.version !== "string"
    || typeof manifest.engines?.node !== "string"
    || typeof manifest.peerDependencies?.next !== "string"
  ) {
    throw new TypeError("package.json is missing the public package contract");
  }
  return Object.freeze({
    manifest: Object.freeze({
      engines: Object.freeze({ node: manifest.engines.node }),
      name: manifest.name,
      peerDependencies: Object.freeze({ next: manifest.peerDependencies.next }),
      version: manifest.version,
    }),
    readme,
  });
}

function compact(value: string): string {
  return value.replace(/\s+/gu, " ");
}

describe("README delivery contract", () => {
  test("orders the reader path from Preview proof through production and recovery", async () => {
    const { readme } = await documentation();
    const headings = [
      "## Install",
      "## Preview, prove, then promote",
      "## Fail-closed contract",
      "## Provider prerequisites",
      "## Recover a failed deployment",
      "## Authority boundary",
      "## Interface map",
      "## Compatibility",
      "## FAQ",
      "## Next action",
      "## Development",
      "## License",
    ] as const;
    const offsets = headings.map((heading) => readme.indexOf(heading));
    expect(offsets.every((offset) => offset >= 0)).toBe(true);
    expect(offsets).toEqual([...offsets].sort((left, right) => left - right));
  });

  test("keeps install and compatibility claims aligned with the manifest", async () => {
    const { manifest, readme } = await documentation();
    expect(manifest.name).toBe("@hraness/vercel-delivery");
    expect(readme).toContain(
      `"${manifest.name}": "github:hraness/vercel-delivery#v${manifest.version}"`,
    );
    expect(readme).toContain(`Immutable GitHub tag \`v${manifest.version}\``);
    expect(readme).toContain(`\`${manifest.peerDependencies.next}\``);
    expect(readme).toContain(`Node.js \`${manifest.engines.node.replace(">=", "")}\` or newer`);
    expect(readme).toContain("Next.js `16.2.12` and `16.3.0`");
  });

  test("publishes the exact deterministic Preview fixture as executable evidence", async () => {
    const identity: ProductionDeliveryProofIdentity = {
      deploymentId: "dpl_7Gw5ZMBpQA8h9GF832KGp7nwbuh3",
      projectId: "prj_Rej9WaMNRbffVm34MfDqa4daCEvZzzE",
      projectName: "example-web",
      sha: "0123456789abcdef0123456789abcdef01234567",
    };
    const previewHostname = "example-web-fix-copy-team.vercel.app";
    const config = withProductionDeliveryProof({}, {
      environment: {
        VERCEL: "1",
        VERCEL_DEPLOYMENT_ID: identity.deploymentId,
        VERCEL_ENV: "preview",
        VERCEL_GIT_COMMIT_SHA: identity.sha,
        VERCEL_PROJECT_ID: identity.projectId,
        VERCEL_URL: previewHostname,
      },
      projectName: identity.projectName,
    });
    const { readme } = await documentation();
    const proof = productionDeliveryProofToken(identity);

    expect(await config.headers?.()).toEqual([{
      headers: [
        { key: PRODUCTION_DELIVERY_PROOF_HEADER, value: proof },
        { key: PREVIEW_ROBOTS_HEADER, value: PREVIEW_ROBOTS_POLICY },
      ],
      source: "/:path*",
    }]);
    expect(config.env?.[PREVIEW_NOTICE_ORIGIN_ENV])
      .toBe(`https://${previewHostname}`);
    expect(readme).toContain(`${PRODUCTION_DELIVERY_PROOF_HEADER}: ${proof}`);
    expect(readme).toContain(
      `${PREVIEW_NOTICE_ORIGIN_ENV}=https://${previewHostname}`,
    );
  });

  test("keeps prerequisites, recovery, interfaces, and authority explicit", async () => {
    const { readme } = await documentation();
    const compactReadme = compact(readme);
    for (const providerInput of [
      "VERCEL_DEPLOYMENT_ID",
      "VERCEL_PROJECT_ID",
      "VERCEL_GIT_COMMIT_SHA",
      "VERCEL_ENV=preview",
      "VERCEL_URL",
    ] as const) expect(readme).toContain(providerInput);

    for (const publicExport of [
      "withProductionDeliveryProof(nextConfig, options)",
      "productionDeliveryProofToken(identity)",
      "resolveProductionDeliveryProof(options)",
      "resolveVercelPreviewNoticeOrigin(environment)",
      "PRODUCTION_DELIVERY_PROOF_HEADER",
      "PREVIEW_NOTICE_ORIGIN_ENV",
      "TRUSTED_PREVIEW_SURFACE_ORIGIN_ENV",
    ] as const) expect(readme).toContain(`\`${publicExport}\``);

    expect(compactReadme).toContain(
      "A partial Vercel environment does not fall back to local behavior",
    );
    expect(compactReadme).toContain(
      "cannot distinguish that build from the inert local path",
    );
    expect(compactReadme).toContain(
      "not a secret, signature, bearer token, or independent attestation from Vercel",
    );
    expect(readme).toContain("The package needs no Vercel API token");
    expect(readme).toContain("## Recover a failed deployment");
  });
});
