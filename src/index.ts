import { createHash } from "node:crypto";

import type { NextConfig } from "next";

const deploymentIdPattern = /^dpl_[A-Za-z0-9]+$/u;
const objectIdPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const projectIdPattern = /^prj_[A-Za-z0-9]+$/u;
const projectNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const vercelPreviewHostnamePattern =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+vercel\.app$/u;

export const PRODUCTION_DELIVERY_PROOF_HEADER = "X-Hraness-Delivery-Proof";

/**
 * UI-only evidence that a page was built for a generated Vercel Preview URL.
 * Never use it as an origin authority for authentication, routing, or server policy.
 */
export const PREVIEW_NOTICE_ORIGIN_ENV =
  "NEXT_PUBLIC_HRANESS_VERCEL_PREVIEW_ORIGIN";

export const TRUSTED_PREVIEW_SURFACE_ORIGIN_ENV =
  "NEXT_PUBLIC_HRANESS_VERCEL_SURFACE_ORIGIN";

export const PREVIEW_ROBOTS_HEADER = "X-Robots-Tag";
export const PREVIEW_ROBOTS_POLICY = "noindex, nofollow, noarchive";

export type ProductionDeliveryProofIdentity = Readonly<{
  deploymentId: string;
  projectId: string;
  projectName: string;
  sha: string;
}>;

export type ProductionDeliveryProofEnvironment = Readonly<
  Record<string, string | undefined>
>;

export type ProductionDeliveryProofOptions = Readonly<{
  environment?: ProductionDeliveryProofEnvironment;
  projectName: string;
}>;

export type NextConfigFunction = (
  phase: string,
  context: Readonly<{ defaultConfig: NextConfig }>,
) => NextConfig | Promise<NextConfig>;

export type NextConfigExport = NextConfig | NextConfigFunction;

function checkedIdentity(
  identity: ProductionDeliveryProofIdentity,
): ProductionDeliveryProofIdentity {
  if (!deploymentIdPattern.test(identity.deploymentId)) {
    throw new Error(
      "production delivery proof requires a valid Vercel deployment ID",
    );
  }
  if (!projectIdPattern.test(identity.projectId)) {
    throw new Error(
      "production delivery proof requires a valid Vercel project ID",
    );
  }
  if (!projectNamePattern.test(identity.projectName)) {
    throw new Error(
      "production delivery proof requires a valid registered project name",
    );
  }
  if (!objectIdPattern.test(identity.sha)) {
    throw new Error(
      "production delivery proof requires a full Git object ID",
    );
  }
  return identity;
}

export function productionDeliveryProofToken(
  identity: ProductionDeliveryProofIdentity,
): string {
  const checked = checkedIdentity(identity);
  const digest = createHash("sha256")
    .update("hraness-production-delivery-proof-v1\0")
    .update(checked.deploymentId)
    .update("\0")
    .update(checked.projectId)
    .update("\0")
    .update(checked.projectName)
    .update("\0")
    .update(checked.sha)
    .digest("hex");
  return `v1.${digest}`;
}

export function resolveProductionDeliveryProof(
  options: ProductionDeliveryProofOptions,
): string | null {
  const environment = options.environment ?? process.env;
  const identity = {
    deploymentId: environment.VERCEL_DEPLOYMENT_ID,
    projectId: environment.VERCEL_PROJECT_ID,
    projectName: options.projectName,
    sha: environment.VERCEL_GIT_COMMIT_SHA,
  };
  const isVercelBuild = environment.VERCEL === "1"
    || identity.deploymentId !== undefined
    || identity.projectId !== undefined
    || identity.sha !== undefined;

  if (!isVercelBuild) return null;
  if (
    identity.deploymentId === undefined
    || identity.projectId === undefined
    || identity.sha === undefined
  ) {
    throw new Error(
      "Vercel production delivery proof requires exposed deployment, project, and Git identity",
    );
  }

  return productionDeliveryProofToken({
    deploymentId: identity.deploymentId,
    projectId: identity.projectId,
    projectName: identity.projectName,
    sha: identity.sha,
  });
}

export function resolveVercelPreviewNoticeOrigin(
  environment: ProductionDeliveryProofEnvironment,
): string | null {
  if (environment.VERCEL_ENV !== "preview") return null;

  const hostname = environment.VERCEL_URL;
  if (hostname === undefined || !vercelPreviewHostnamePattern.test(hostname)) {
    throw new Error(
      "Vercel Preview requires VERCEL_URL to be a bare generated .vercel.app hostname",
    );
  }
  return `https://${hostname}`;
}

function withDeliveryHeaders(
  nextConfig: NextConfig,
  proof: string,
  previewNoticeOrigin: string | null,
): NextConfig {
  const existingHeaders = nextConfig.headers;
  const headers = [{ key: PRODUCTION_DELIVERY_PROOF_HEADER, value: proof }];
  if (previewNoticeOrigin !== null) {
    headers.push({ key: PREVIEW_ROBOTS_HEADER, value: PREVIEW_ROBOTS_POLICY });
  }

  if (nextConfig.env?.[TRUSTED_PREVIEW_SURFACE_ORIGIN_ENV] !== undefined) {
    throw new Error(
      `${TRUSTED_PREVIEW_SURFACE_ORIGIN_ENV} may only be issued by a trusted Vercel build wrapper`,
    );
  }

  const existingMarker = nextConfig.env?.[PREVIEW_NOTICE_ORIGIN_ENV];
  if (existingMarker !== undefined && existingMarker !== previewNoticeOrigin) {
    throw new Error(
      `${PREVIEW_NOTICE_ORIGIN_ENV} is owned by the Vercel Preview notice wrapper`,
    );
  }

  return {
    ...nextConfig,
    ...(previewNoticeOrigin === null
      ? {}
      : {
          env: {
            ...nextConfig.env,
            [PREVIEW_NOTICE_ORIGIN_ENV]: previewNoticeOrigin,
          },
        }),
    async headers() {
      const existing = await existingHeaders?.() ?? [];
      return [
        ...existing,
        {
          headers,
          source: "/:path*",
        },
      ];
    },
  };
}

export function withProductionDeliveryProof(
  nextConfig: NextConfig,
  options: ProductionDeliveryProofOptions,
): NextConfig;
export function withProductionDeliveryProof(
  nextConfig: NextConfigFunction,
  options: ProductionDeliveryProofOptions,
): NextConfigFunction;
export function withProductionDeliveryProof(
  nextConfig: NextConfigExport,
  options: ProductionDeliveryProofOptions,
): NextConfigExport {
  const proof = resolveProductionDeliveryProof(options);
  if (proof === null) return nextConfig;

  const environment = options.environment ?? process.env;
  const previewNoticeOrigin = resolveVercelPreviewNoticeOrigin(environment);
  if (typeof nextConfig !== "function") {
    return withDeliveryHeaders(nextConfig, proof, previewNoticeOrigin);
  }

  return async (phase, context) => withDeliveryHeaders(
    await nextConfig(phase, context),
    proof,
    previewNoticeOrigin,
  );
}
