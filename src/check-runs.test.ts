import { describe, expect, test } from "bun:test";

import {
  completeVercelDeploymentCheck,
  VercelDeploymentCheckError,
  type VercelDeploymentCheckCompletion,
  type VercelDeploymentCheckIdentity,
  type VercelDeploymentCheckOptions,
} from "./check-runs";

const identity: VercelDeploymentCheckIdentity = {
  teamId: "team_example123456",
  projectId: "prj_example123456",
  deploymentId: "dpl_candidate123456",
  origin: "https://example-candidate123-team.vercel.app",
  git: {
    owner: "example-org",
    ownerId: 12345,
    repository: "example-web",
    repositoryId: 67890,
    ref: "main",
    sha: "a".repeat(40),
  },
  integrationId: "oac_example123456",
  configurationId: "icfg_example123456",
  checkId: "chk_example123456",
  checkRunId: "ckr_candidate123456",
  checkName: "Production verification",
  requiredChecks: ["source", "static", "browser", "routing"],
};
const completion: VercelDeploymentCheckCompletion = {
  deploymentId: identity.deploymentId,
  origin: identity.origin,
  sourceSha: identity.git.sha,
  jobStatus: "success",
  checks: { source: true, static: true, browser: true, routing: true },
};
type Row = Record<string, unknown>;
const clone = <T>(value: T): T => structuredClone(value);

async function refuses(
  operation: Promise<unknown>,
  expected?: Row,
): Promise<void> {
  let failure: unknown;
  try {
    await operation;
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(VercelDeploymentCheckError);
  if (expected !== undefined) expect(failure).toMatchObject(expected);
}

function fixture() {
  const now = Date.now();
  const source = {
    kind: "integration",
    integrationId: identity.integrationId,
    integrationConfigurationId: identity.configurationId,
  };
  const deployment: Row = {
    id: identity.deploymentId,
    ownerId: identity.teamId,
    projectId: identity.projectId,
    target: "production",
    url: new URL(identity.origin).hostname,
    readyState: "READY",
    readySubstate: "STAGED",
    gitSource: {
      type: "github",
      repoId: identity.git.repositoryId,
      ref: identity.git.ref,
      sha: identity.git.sha,
      org: identity.git.owner,
      repo: identity.git.repository,
    },
  };
  const definition: Row = {
    id: identity.checkId,
    ownerId: identity.teamId,
    projectId: identity.projectId,
    name: identity.checkName,
    sourceKind: "integration",
    source,
    requires: "deployment-url",
    blocks: "deployment-alias",
    targets: ["production"],
    isRerequestable: false,
    timeout: 1800,
  };
  const run: Row = {
    id: identity.checkRunId,
    deploymentId: identity.deploymentId,
    projectId: identity.projectId,
    ownerId: identity.teamId,
    name: identity.checkName,
    checkId: identity.checkId,
    source,
    status: "running",
    timeout: 1800,
    createdAt: now - 1000,
    updatedAt: now - 500,
  };
  const sibling = {
    ...clone(run),
    id: "ckr_sibling123456",
    deploymentId: "dpl_sibling123456",
  };
  const calls: { method: string; path: string; body?: Row }[] = [];
  let runReads = 0,
    patchMode:
      | "normal"
      | "lost-after-commit"
      | "lost-before-commit"
      | "delayed-read"
      | "forbidden"
      | "contradiction" = "normal";
  let runResponse: ((read: number) => Response | undefined) | undefined;
  let beforeRead: ((path: string, count: number) => void) | undefined;
  const fetcher: NonNullable<VercelDeploymentCheckOptions["fetch"]> = async (
    input,
    init,
  ) => {
    await Promise.resolve();
    const url = new URL(input);
    expect(url.origin).toBe("https://api.vercel.com");
    expect([...url.searchParams]).toEqual([["teamId", identity.teamId]]);
    expect(init.redirect).toBe("error");
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer installation-test-credential",
    );
    const method = init.method ?? "GET";
    const call: { method: string; path: string; body?: Row } = {
      method,
      path: url.pathname,
    };
    calls.push(call);
    if (method === "PATCH") {
      expect(url.pathname).toBe(
        `/v2/deployments/${identity.deploymentId}/check-runs/${identity.checkRunId}`,
      );
      expect(typeof init.body).toBe("string");
      const body = JSON.parse(init.body as string) as Row;
      call.body = body;
      if (patchMode === "forbidden")
        return Response.json(
          { secret: "provider-error-not-for-logs" },
          { status: 403 },
        );
      if (patchMode === "lost-before-commit")
        throw new Error("private-token-value and provider body");
      if (patchMode === "contradiction")
        Object.assign(run, body, { conclusion: "failed" });
      else Object.assign(run, body);
      if (patchMode === "lost-after-commit")
        throw new Error("private-token-value and provider body");
      return Response.json(clone(run));
    }
    beforeRead?.(url.pathname, calls.length);
    if (url.pathname === `/v13/deployments/${identity.deploymentId}`)
      return Response.json(clone(deployment));
    if (
      url.pathname ===
      `/v2/projects/${identity.projectId}/checks/${identity.checkId}`
    )
      return Response.json(clone(definition));
    if (
      url.pathname ===
      `/v2/deployments/${identity.deploymentId}/check-runs/${identity.checkRunId}`
    ) {
      runReads += 1;
      const replacement = runResponse?.(runReads);
      if (replacement !== undefined) return replacement;
      if (
        patchMode === "delayed-read" &&
        runReads < 5 &&
        run.status === "completed"
      )
        return Response.json({
          ...clone(run),
          status: "running",
          conclusion: undefined,
          completedAt: undefined,
        });
      return Response.json(clone(run));
    }
    throw new Error("Unexpected API path");
  };
  const options: VercelDeploymentCheckOptions = {
    identity,
    completion,
    token: "installation-test-credential",
    fetch: fetcher,
    readCurrentSource: () =>
      Promise.resolve({ ...identity.git, protected: true }),
    wait: () => Promise.resolve(),
  };
  return {
    options,
    deployment,
    definition,
    run,
    sibling,
    calls,
    patches: () => calls.filter((call) => call.method === "PATCH"),
    mode: (value: typeof patchMode) => {
      patchMode = value;
    },
    runResponse: (value: typeof runResponse) => {
      runResponse = value;
    },
    beforeRead: (value: typeof beforeRead) => {
      beforeRead = value;
    },
  };
}

describe("deployment-specific integration completion", () => {
  test("check ordering preserves completion identity and caller mutation cannot retarget a request", async () => {
    const f = fixture();
    const receipt = await completeVercelDeploymentCheck(f.options);
    for (let offset = 0; offset < identity.requiredChecks.length; offset += 1) {
      const reordered = [
        ...identity.requiredChecks.slice(offset),
        ...identity.requiredChecks.slice(0, offset),
      ];
      const repeat = await completeVercelDeploymentCheck({
        ...f.options,
        identity: { ...identity, requiredChecks: reordered },
        completion: {
          ...completion,
          checks: Object.fromEntries(
            Object.entries(completion.checks).reverse(),
          ),
        },
      });
      expect(repeat).toEqual({ ...receipt, changed: false });
    }
    expect(f.patches()).toHaveLength(1);

    const mutable = clone(identity) as {
      -readonly [
        K in keyof VercelDeploymentCheckIdentity
      ]: VercelDeploymentCheckIdentity[K];
    };
    const second = fixture();
    const fetcher = second.options.fetch;
    if (fetcher === undefined) throw new Error("Missing test transport");
    const result = await completeVercelDeploymentCheck({
      ...second.options,
      identity: mutable,
      fetch: (url, init) => {
        mutable.deploymentId = "dpl_sibling123456";
        mutable.git = { ...mutable.git, sha: "b".repeat(40) };
        return fetcher(url, init);
      },
    });
    expect(result.deploymentId).toBe(identity.deploymentId);
    expect(result.sourceSha).toBe(identity.git.sha);
    expect(second.patches()).toHaveLength(1);
  });

  test("a verified deployment completes only its own check, leaving a same-SHA sibling untouched", async () => {
    const f = fixture(),
      sibling = clone(f.sibling);
    const receipt = await completeVercelDeploymentCheck(f.options);
    expect(receipt).toMatchObject({
      changed: true,
      conclusion: "succeeded",
      deploymentId: identity.deploymentId,
      checkRunId: identity.checkRunId,
      sourceSha: identity.git.sha,
    });
    expect(f.patches()).toHaveLength(1);
    expect(f.run.status).toBe("completed");
    expect(f.sibling).toEqual(sibling);
    expect(
      f.calls.every(
        (call) =>
          !call.path.includes("sibling") && !call.path.includes("statuses"),
      ),
    ).toBe(true);
    const again = await completeVercelDeploymentCheck(f.options);
    expect(again).toEqual({ ...receipt, changed: false });
    expect(f.patches()).toHaveLength(1);
  });

  test("cancellation, missing completion, missing checks and incomplete success all finish failed", async () => {
    for (const jobStatus of [
      "failure",
      "cancelled",
      "timed_out",
      "skipped",
      "unknown",
      "Success",
    ]) {
      const f = fixture();
      const result = await completeVercelDeploymentCheck({
        ...f.options,
        completion: { ...completion, jobStatus },
      });
      expect(result.conclusion).toBe("failed");
    }
    const omittedStatus = fixture();
    const { jobStatus: _jobStatus, ...incomplete } = completion;
    void _jobStatus;
    expect(
      (
        await completeVercelDeploymentCheck({
          ...omittedStatus.options,
          completion: incomplete,
        })
      ).conclusion,
    ).toBe("failed");
    const missing = fixture();
    const { completion: _completion, ...options } = missing.options;
    void _completion;
    expect((await completeVercelDeploymentCheck(options)).conclusion).toBe(
      "failed",
    );
    for (const checks of [
      { source: true },
      { ...completion.checks, browser: false },
    ]) {
      const f = fixture();
      expect(
        (
          await completeVercelDeploymentCheck({
            ...f.options,
            completion: { ...completion, checks },
          })
        ).conclusion,
      ).toBe("failed");
    }
  });

  test("every current GitHub owner, repository, ref and protected-source mismatch refuses a write", async () => {
    for (const change of [
      { owner: "other-org" },
      { ownerId: 54321 },
      { repository: "other-web" },
      { repositoryId: 98765 },
      { ref: "other" },
      { sha: "b".repeat(40) },
      { protected: false },
    ]) {
      const f = fixture();
      await refuses(
        completeVercelDeploymentCheck({
          ...f.options,
          readCurrentSource: () =>
            Promise.resolve({ ...identity.git, protected: true, ...change }),
        }),
        { code: "stale-source" },
      );
      expect(f.patches()).toHaveLength(0);
    }
    const f = fixture();
    let reads = 0;
    await refuses(
      completeVercelDeploymentCheck({
        ...f.options,
        readCurrentSource: () =>
          Promise.resolve({
            ...identity.git,
            protected: true,
            sha: ++reads > 1 ? "b".repeat(40) : identity.git.sha,
          }),
      }),
      { code: "stale-source" },
    );
    expect(f.patches()).toHaveLength(0);
  });

  test("foreign deployment, integration, installation, check and run facts never reach PATCH", async () => {
    const changes: readonly ["deployment" | "definition" | "run", Row][] = [
      ["deployment", { ownerId: "team_foreign123456" }],
      ["deployment", { projectId: "prj_foreign123456" }],
      ["deployment", { id: "dpl_sibling123456" }],
      ["deployment", { target: null }],
      ["deployment", { url: "foreign.vercel.app" }],
      [
        "deployment",
        {
          gitSource: undefined,
          meta: {
            githubCommitSha: identity.git.sha,
            githubCommitRef: identity.git.ref,
            githubRepoId: identity.git.repositoryId,
          },
        },
      ],
      [
        "deployment",
        {
          gitSource: {
            type: "github",
            repoId: identity.git.repositoryId,
            ref: "other",
            sha: identity.git.sha,
          },
        },
      ],
      ["deployment", { meta: { githubCommitOrg: "foreign-org" } }],
      [
        "definition",
        {
          source: {
            kind: "integration",
            integrationId: "oac_foreign123456",
            integrationConfigurationId: identity.configurationId,
          },
        },
      ],
      [
        "definition",
        {
          source: {
            kind: "integration",
            integrationId: identity.integrationId,
            integrationConfigurationId: "icfg_foreign123456",
          },
        },
      ],
      ["definition", { sourceKind: "git-provider" }],
      ["definition", { targets: ["all"] }],
      ["definition", { blocks: "none" }],
      ["definition", { isRerequestable: true }],
      ["run", { deploymentId: "dpl_sibling123456" }],
      ["run", { checkId: "chk_foreign123456" }],
      ["run", { projectId: "prj_foreign123456" }],
      [
        "run",
        {
          source: {
            kind: "git-provider",
            provider: "github",
            externalCheckName: identity.checkName,
          },
        },
      ],
    ];
    for (const [kind, change] of changes) {
      const f = fixture();
      Object.assign(f[kind], change);
      await refuses(completeVercelDeploymentCheck(f.options));
      expect(f.patches()).toHaveLength(0);
    }
  });

  test("every observed completed contradiction and concurrent update is preserved without overwrite", async () => {
    for (const conclusion of [
      "failed",
      "canceled",
      "timeout",
      "neutral",
      "succeeded",
    ]) {
      const f = fixture();
      Object.assign(f.run, {
        status: "completed",
        conclusion,
        completedAt: Date.now(),
        externalId: "some-other-writer",
        output: {},
      });
      await refuses(completeVercelDeploymentCheck(f.options), {
        code: "terminal-conflict",
      });
      expect(f.patches()).toHaveLength(0);
    }
    const f = fixture();
    f.beforeRead((path, count) => {
      if (count > 3 && path.includes("check-runs"))
        f.run.updatedAt = Date.now();
    });
    await refuses(completeVercelDeploymentCheck(f.options), {
      code: "concurrent-update",
    });
    expect(f.patches()).toHaveLength(0);
  });

  test("lost PATCH responses and delayed visibility reconcile the exact run without a second write", async () => {
    for (const mode of ["lost-after-commit", "delayed-read"] as const) {
      const f = fixture();
      f.mode(mode);
      expect((await completeVercelDeploymentCheck(f.options)).conclusion).toBe(
        "succeeded",
      );
      expect(f.patches()).toHaveLength(1);
    }
    const lost = fixture();
    lost.mode("lost-before-commit");
    await refuses(completeVercelDeploymentCheck(lost.options), {
      code: "completion-unconfirmed",
      stage: "readback",
    });
    expect(lost.patches()).toHaveLength(1);
    expect(lost.run.status).toBe("running");
    expect(lost.calls.length).toBeLessThanOrEqual(16);
    const contradictory = fixture();
    contradictory.mode("contradiction");
    await refuses(completeVercelDeploymentCheck(contradictory.options), {
      code: "terminal-conflict",
    });
    expect(contradictory.patches()).toHaveLength(1);
  });

  test("redirects, oversized/invalid bodies and provider errors are bounded and log safe", async () => {
    for (const response of [
      () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://foreign.example/secret" },
        }),
      () => new Response("x".repeat(1024 * 1024 + 1)),
      () => new Response('{"secret":"private-token-value"'),
      () => Response.json({ secret: "private-token-value" }, { status: 503 }),
    ]) {
      const f = fixture();
      f.runResponse(() => response());
      try {
        await completeVercelDeploymentCheck(f.options);
        throw new Error("Expected refusal");
      } catch (error) {
        expect(error).toBeInstanceOf(VercelDeploymentCheckError);
        expect(String(error)).not.toContain("private-token-value");
        expect(String(error)).not.toContain("foreign.example");
      }
      expect(f.patches()).toHaveLength(0);
    }
    const f = fixture();
    f.mode("forbidden");
    await refuses(completeVercelDeploymentCheck(f.options), {
      stage: "complete",
      httpStatus: 403,
    });
    expect(f.patches()).toHaveLength(1);
  });

  test("known personal tokens, target injection and borrowed evidence fail before any request", async () => {
    const f = fixture();
    for (const token of [
      "vcp_personal-token-value",
      "secret\nheader",
      "short",
    ]) {
      await refuses(completeVercelDeploymentCheck({ ...f.options, token }), {
        code: "invalid-input",
      });
    }
    for (const badIdentity of [
      { ...identity, deploymentId: "dpl_123456/other" },
      { ...identity, origin: "https://foreign.example" },
      { ...identity, origin: identity.origin + "/" },
      { ...identity, requiredChecks: [] },
      { ...identity, requiredChecks: ["source", "source"] },
    ])
      await refuses(
        completeVercelDeploymentCheck({ ...f.options, identity: badIdentity }),
        { code: "invalid-input" },
      );
    await refuses(
      completeVercelDeploymentCheck({
        ...f.options,
        completion: { ...completion, deploymentId: "dpl_sibling123456" },
      }),
      { code: "identity-mismatch" },
    );
    expect(f.calls).toHaveLength(0);
  });

  test("success requires a ready, staged candidate and detects source drift after uncertain completion", async () => {
    for (const change of [
      { readyState: "CANCELED" },
      { readySubstate: "PROMOTED" },
    ]) {
      const f = fixture();
      Object.assign(f.deployment, change);
      await refuses(completeVercelDeploymentCheck(f.options), {
        code: "identity-mismatch",
      });
      expect(f.patches()).toHaveLength(0);
    }
    const f = fixture();
    let reads = 0;
    await refuses(
      completeVercelDeploymentCheck({
        ...f.options,
        readCurrentSource: () =>
          Promise.resolve({
            ...identity.git,
            protected: true,
            sha: ++reads > 2 ? "b".repeat(40) : identity.git.sha,
          }),
      }),
      { code: "stale-source" },
    );
    expect(f.patches()).toHaveLength(1);
  });
});
