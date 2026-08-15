import { describe, expect, test } from "bun:test";

import {
  PREVIEW_NOTICE_ORIGIN_ENV,
  PREVIEW_ROBOTS_HEADER,
  PREVIEW_ROBOTS_POLICY,
  PRODUCTION_DELIVERY_PROOF_HEADER,
  TRUSTED_PREVIEW_SURFACE_ORIGIN_ENV,
  productionDeliveryProofToken,
  resolveProductionDeliveryProof,
  resolveVercelPreviewNoticeOrigin,
  withProductionDeliveryProof,
  type ProductionDeliveryProofIdentity,
} from "./index";

const identity: ProductionDeliveryProofIdentity = {
  deploymentId: "dpl_7Gw5ZMBpQA8h9GF832KGp7nwbuh3",
  projectId: "prj_Rej9WaMNRbffVm34MfDqa4daCEvZzzE",
  projectName: "example-web",
  sha: "0123456789abcdef0123456789abcdef01234567",
};

const previewHostname = "example-web-fix-copy-team.vercel.app";

describe("production delivery proof", () => {
  test("uses the public header, environment, and hash identities", () => {
    expect(PRODUCTION_DELIVERY_PROOF_HEADER).toBe("X-Hraness-Delivery-Proof");
    expect(PREVIEW_NOTICE_ORIGIN_ENV)
      .toBe("NEXT_PUBLIC_HRANESS_VERCEL_PREVIEW_ORIGIN");
    expect(TRUSTED_PREVIEW_SURFACE_ORIGIN_ENV)
      .toBe("NEXT_PUBLIC_HRANESS_VERCEL_SURFACE_ORIGIN");
    expect(productionDeliveryProofToken(identity))
      .toBe("v1.0ef5da6b39d97f0a0c74e7862729a54360330ad99b197306cfd52fb6937bdac1");
  });

  test("binds every deployment identity field deterministically", () => {
    const proof = productionDeliveryProofToken(identity);
    expect(proof).toMatch(/^v1\.[0-9a-f]{64}$/u);
    expect(productionDeliveryProofToken(identity)).toBe(proof);

    for (const changed of [
      { ...identity, deploymentId: "dpl_Other123" },
      { ...identity, projectId: "prj_Other123" },
      { ...identity, projectName: "another-web" },
      { ...identity, sha: "f".repeat(40) },
    ]) {
      expect(productionDeliveryProofToken(changed)).not.toBe(proof);
    }
  });

  test("rejects malformed deployment identities", () => {
    for (const changed of [
      { ...identity, deploymentId: "deployment-123" },
      { ...identity, projectId: "project-123" },
      { ...identity, projectName: "Example Web" },
      { ...identity, sha: "short" },
    ]) {
      expect(() => productionDeliveryProofToken(changed)).toThrow();
    }
  });

  test("stays inert locally and fails closed on incomplete Vercel identity", () => {
    const localConfig = { reactStrictMode: true };
    expect(withProductionDeliveryProof(localConfig, {
      environment: {},
      projectName: identity.projectName,
    })).toBe(localConfig);
    expect(resolveProductionDeliveryProof({
      environment: {},
      projectName: identity.projectName,
    })).toBeNull();
    expect(() => resolveProductionDeliveryProof({
      environment: { VERCEL: "1", VERCEL_DEPLOYMENT_ID: identity.deploymentId },
      projectName: identity.projectName,
    })).toThrow("requires exposed deployment, project, and Git identity");
  });

  test("adds the exact proof header after existing Next response headers", async () => {
    const config = withProductionDeliveryProof({
      headers: () => Promise.resolve([{
        headers: [{ key: "Cache-Control", value: "no-store" }],
        source: "/api/:path*",
      }]),
    }, {
      environment: {
        VERCEL: "1",
        VERCEL_DEPLOYMENT_ID: identity.deploymentId,
        VERCEL_GIT_COMMIT_SHA: identity.sha,
        VERCEL_PROJECT_ID: identity.projectId,
      },
      projectName: identity.projectName,
    });

    expect(await config.headers?.()).toEqual([
      {
        headers: [{ key: "Cache-Control", value: "no-store" }],
        source: "/api/:path*",
      },
      {
        headers: [{
          key: PRODUCTION_DELIVERY_PROOF_HEADER,
          value: productionDeliveryProofToken(identity),
        }],
        source: "/:path*",
      },
    ]);
  });

  test("adds a no-index policy to every Vercel Preview response", async () => {
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

    expect(await config.headers?.()).toEqual([{
      headers: [
        {
          key: PRODUCTION_DELIVERY_PROOF_HEADER,
          value: productionDeliveryProofToken(identity),
        },
        { key: PREVIEW_ROBOTS_HEADER, value: PREVIEW_ROBOTS_POLICY },
      ],
      source: "/:path*",
    }]);
    expect(config.env).toEqual({
      [PREVIEW_NOTICE_ORIGIN_ENV]: `https://${previewHostname}`,
    });
    expect(config.env?.[TRUSTED_PREVIEW_SURFACE_ORIGIN_ENV]).toBeUndefined();
  });

  test("parses only a bare generated Vercel Preview hostname", () => {
    expect(resolveVercelPreviewNoticeOrigin({ VERCEL_ENV: "production" }))
      .toBeNull();
    expect(resolveVercelPreviewNoticeOrigin({
      VERCEL_ENV: "preview",
      VERCEL_URL: "project-git-topic-team.vercel.app",
    })).toBe("https://project-git-topic-team.vercel.app");

    for (const VERCEL_URL of [
      undefined,
      "https://project.vercel.app",
      "project.vercel.app/path",
      "project.vercel.app:443",
      "user@project.vercel.app",
      "project.example.com",
      "Project.vercel.app",
      "-project.vercel.app",
    ]) {
      expect(() => resolveVercelPreviewNoticeOrigin({
        VERCEL_ENV: "preview",
        VERCEL_URL,
      })).toThrow("bare generated .vercel.app hostname");
    }
  });

  test("refuses manually configured wrapper-owned environment values", () => {
    const options = {
      environment: {
        VERCEL: "1",
        VERCEL_DEPLOYMENT_ID: identity.deploymentId,
        VERCEL_ENV: "preview",
        VERCEL_GIT_COMMIT_SHA: identity.sha,
        VERCEL_PROJECT_ID: identity.projectId,
        VERCEL_URL: previewHostname,
      },
      projectName: identity.projectName,
    } as const;

    expect(() => withProductionDeliveryProof({
      env: { [PREVIEW_NOTICE_ORIGIN_ENV]: "https://foreign.vercel.app" },
    }, options)).toThrow("owned by the Vercel Preview notice wrapper");
    expect(() => withProductionDeliveryProof({
      env: {
        [TRUSTED_PREVIEW_SURFACE_ORIGIN_ENV]: `https://${previewHostname}`,
      },
    }, options)).toThrow("may only be issued by a trusted Vercel build wrapper");
  });

  test("preserves an async Next config function from an outer plugin", async () => {
    const wrapped = withProductionDeliveryProof((phase, context) => Promise.resolve({
      ...context.defaultConfig,
      distDir: phase,
    }), {
      environment: {
        VERCEL: "1",
        VERCEL_DEPLOYMENT_ID: identity.deploymentId,
        VERCEL_GIT_COMMIT_SHA: identity.sha,
        VERCEL_PROJECT_ID: identity.projectId,
      },
      projectName: identity.projectName,
    });

    const config = await wrapped("workflow-build", {
      defaultConfig: { reactStrictMode: true },
    });
    expect(config).toMatchObject({
      distDir: "workflow-build",
      reactStrictMode: true,
    });
    expect(await config.headers?.()).toEqual([{
      headers: [{
        key: PRODUCTION_DELIVERY_PROOF_HEADER,
        value: productionDeliveryProofToken(identity),
      }],
      source: "/:path*",
    }]);
  });
});
