import { createHash } from "node:crypto";

/** GitHub facts re-read by the caller using its repository-scoped read authority. */
export type VercelCheckGitSource = Readonly<{
  owner: string;
  ownerId: number;
  repository: string;
  repositoryId: number;
  ref: string;
  sha: string;
}>;

export type VercelDeploymentCheckIdentity = Readonly<{
  teamId: string;
  projectId: string;
  deploymentId: string;
  origin: string;
  git: VercelCheckGitSource;
  integrationId: string;
  configurationId: string;
  checkId: string;
  checkRunId: string;
  checkName: string;
  requiredChecks: readonly string[];
}>;

/** The adapter derives these booleans from its completed source and browser checks. */
export type VercelDeploymentCheckCompletion = Readonly<{
  deploymentId: string;
  origin: string;
  sourceSha: string;
  jobStatus?: string;
  checks: Readonly<Record<string, boolean>>;
}>;

export type VercelDeploymentCheckOptions = Readonly<{
  identity: VercelDeploymentCheckIdentity;
  /** The selected installation's credential; there is no user-token fallback. */
  token: string;
  completion?: VercelDeploymentCheckCompletion;
  readCurrentSource: () => Promise<unknown>;
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  wait?: (milliseconds: number) => Promise<void>;
}>;

export type VercelDeploymentCheckReceipt = Readonly<{
  deploymentId: string;
  checkRunId: string;
  sourceSha: string;
  conclusion: "failed" | "succeeded";
  completionId: string;
  changed: boolean;
}>;

type Stage =
  | "input"
  | "deployment"
  | "definition"
  | "run"
  | "current-source"
  | "complete"
  | "readback";
type Code =
  | "invalid-input"
  | "request-failed"
  | "invalid-response"
  | "identity-mismatch"
  | "stale-source"
  | "terminal-conflict"
  | "concurrent-update"
  | "completion-unconfirmed";

/** Messages contain structural facts only, never provider bodies or credentials. */
export class VercelDeploymentCheckError extends Error {
  constructor(
    public readonly code: Code,
    public readonly stage: Stage,
    public readonly httpStatus?: number,
  ) {
    super(
      `Vercel deployment check: ${stage}/${code}${httpStatus === undefined ? "" : ` (HTTP ${String(httpStatus)})`}`,
    );
    this.name = "VercelDeploymentCheckError";
  }
}

type JsonObject = Record<string, unknown>;
type Snapshot = Readonly<{
  deployment: JsonObject;
  definition: JsonObject;
  run: JsonObject;
}>;
const apiOrigin = "https://api.vercel.com";
const maximumResponseBytes = 1024 * 1024;
const shaPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const idPattern = /^(?:team|prj|dpl|oac|icfg|chk|ckr)_[A-Za-z0-9-]{6,100}$/u;
const checkPattern = /^[a-z][a-z0-9-]{0,63}$/u;

function need(condition: unknown, code: Code, stage: Stage): asserts condition {
  if (!condition) throw new VercelDeploymentCheckError(code, stage);
}

function object(value: unknown, stage: Stage): JsonObject {
  need(
    value !== null && typeof value === "object" && !Array.isArray(value),
    "invalid-response",
    stage,
  );
  return value as JsonObject;
}

function canonical(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b, "en"))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function generatedOrigin(value: unknown): string {
  need(typeof value === "string", "invalid-input", "input");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new VercelDeploymentCheckError("invalid-input", "input");
  }
  need(
    url.protocol === "https:" &&
      url.origin === value &&
      !url.port &&
      !url.username &&
      !url.password &&
      /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+vercel\.app$/u.test(
        url.hostname,
      ),
    "invalid-input",
    "input",
  );
  return url.origin;
}

function checkedIdentity(
  input: VercelDeploymentCheckIdentity,
): VercelDeploymentCheckIdentity {
  const value = object(input, "input"),
    git = object(value.git, "input");
  need(
    Object.keys(value).every((key) =>
      [
        "teamId",
        "projectId",
        "deploymentId",
        "origin",
        "git",
        "integrationId",
        "configurationId",
        "checkId",
        "checkRunId",
        "checkName",
        "requiredChecks",
      ].includes(key),
    ) &&
      Object.keys(git).every((key) =>
        [
          "owner",
          "ownerId",
          "repository",
          "repositoryId",
          "ref",
          "sha",
        ].includes(key),
      ),
    "invalid-input",
    "input",
  );
  for (const [field, prefix] of Object.entries({
    teamId: "team_",
    projectId: "prj_",
    deploymentId: "dpl_",
    integrationId: "oac_",
    configurationId: "icfg_",
    checkId: "chk_",
    checkRunId: "ckr_",
  })) {
    const id = value[field];
    need(
      typeof id === "string" && id.startsWith(prefix) && idPattern.test(id),
      "invalid-input",
      "input",
    );
  }
  generatedOrigin(value.origin);
  need(
    typeof value.checkName === "string" &&
      value.checkName.length > 0 &&
      value.checkName.length <= 128 &&
      !/[\r\n\0]/u.test(value.checkName),
    "invalid-input",
    "input",
  );
  need(
    Array.isArray(value.requiredChecks) &&
      value.requiredChecks.length > 0 &&
      value.requiredChecks.length <= 16 &&
      value.requiredChecks.every(
        (name: unknown) => typeof name === "string" && checkPattern.test(name),
      ) &&
      new Set(value.requiredChecks).size === value.requiredChecks.length,
    "invalid-input",
    "input",
  );
  need(
    typeof git.owner === "string" &&
      /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/u.test(git.owner) &&
      typeof git.repository === "string" &&
      /^[a-zA-Z0-9_.-]{1,100}$/u.test(git.repository) &&
      Number.isSafeInteger(git.ownerId) &&
      Number(git.ownerId) > 0 &&
      Number.isSafeInteger(git.repositoryId) &&
      Number(git.repositoryId) > 0 &&
      typeof git.ref === "string" &&
      /^[a-zA-Z0-9][a-zA-Z0-9_./-]{0,199}$/u.test(git.ref) &&
      !git.ref.includes("..") &&
      !git.ref.includes("//") &&
      !git.ref.endsWith("/") &&
      typeof git.sha === "string" &&
      shaPattern.test(git.sha),
    "invalid-input",
    "input",
  );
  // Copy caller-owned inputs before the first await so later mutation cannot
  // change the API target or the evidence used for the completion digest.
  return Object.freeze({
    ...input,
    git: Object.freeze({ ...input.git }),
    requiredChecks: Object.freeze([...input.requiredChecks].sort()),
  });
}

function completionFor(
  identity: VercelDeploymentCheckIdentity,
  input: VercelDeploymentCheckCompletion | undefined,
) {
  if (input !== undefined) {
    const value = object(input, "input"),
      checks = object(value.checks, "input");
    need(
      value.deploymentId === identity.deploymentId &&
        value.origin === identity.origin &&
        value.sourceSha === identity.git.sha,
      "identity-mismatch",
      "input",
    );
    need(
      Object.keys(checks).length <= 16 &&
        Object.entries(checks).every(
          ([name, passed]) =>
            checkPattern.test(name) && typeof passed === "boolean",
        ),
      "invalid-input",
      "input",
    );
  }
  const checks = Object.fromEntries(
    [...identity.requiredChecks]
      .sort()
      .map((name) => [name, input?.checks[name] === true]),
  );
  const conclusion =
    input?.jobStatus === "success" && Object.values(checks).every(Boolean)
      ? ("succeeded" as const)
      : ("failed" as const);
  const delivery = {
    schemaVersion: 1,
    identityHash: hash(identity),
    conclusion,
    checks,
  };
  return {
    conclusion,
    delivery,
    completionId: `vercel-delivery-v1:${hash(delivery)}`,
  };
}

async function responseJson(
  response: Response,
  stage: Stage,
): Promise<unknown> {
  need(
    response.ok && response.status !== 204 && !response.redirected,
    "request-failed",
    stage,
  );
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body?.getReader();
  need(reader, "invalid-response", stage);
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maximumResponseBytes) {
        await reader.cancel().catch(() => undefined);
        throw new VercelDeploymentCheckError("invalid-response", stage);
      }
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch (error) {
    if (error instanceof VercelDeploymentCheckError) throw error;
    throw new VercelDeploymentCheckError("invalid-response", stage);
  } finally {
    reader.releaseLock();
  }
}

function client(
  identity: VercelDeploymentCheckIdentity,
  token: string,
  fetcher: NonNullable<VercelDeploymentCheckOptions["fetch"]>,
) {
  need(
    typeof token === "string" &&
      token.length >= 16 &&
      token.length <= 4096 &&
      /^[\x21-\x7e]+$/u.test(token) &&
      !token.startsWith("vcp_"),
    "invalid-input",
    "input",
  );
  return async (
    path: string,
    stage: Stage,
    body?: JsonObject,
  ): Promise<unknown> => {
    const url = new URL(path, apiOrigin);
    url.searchParams.set("teamId", identity.teamId);
    let response: Response;
    try {
      response = await fetcher(url.href, {
        method: body === undefined ? "GET" : "PATCH",
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new VercelDeploymentCheckError("request-failed", stage);
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new VercelDeploymentCheckError(
        "request-failed",
        stage,
        response.status,
      );
    }
    return responseJson(response, stage);
  };
}

function integrationSource(
  value: unknown,
  identity: VercelDeploymentCheckIdentity,
  stage: Stage,
): void {
  const source = object(value, stage);
  need(
    source.kind === "integration" &&
      source.integrationId === identity.integrationId &&
      source.integrationConfigurationId === identity.configurationId &&
      Object.keys(source).every((key) =>
        ["kind", "integrationId", "integrationConfigurationId"].includes(key),
      ),
    "identity-mismatch",
    stage,
  );
}

function checkedSnapshot(
  snapshot: Snapshot,
  identity: VercelDeploymentCheckIdentity,
): void {
  const { deployment, definition, run } = snapshot;
  need(
    deployment.id === identity.deploymentId &&
      deployment.ownerId === identity.teamId &&
      deployment.projectId === identity.projectId &&
      deployment.target === "production" &&
      typeof deployment.url === "string" &&
      `https://${deployment.url}` === identity.origin,
    "identity-mismatch",
    "deployment",
  );
  const git = object(deployment.gitSource, "deployment");
  need(
    git.type === "github" &&
      String(git.repoId) === String(identity.git.repositoryId) &&
      git.sha === identity.git.sha &&
      git.ref === identity.git.ref &&
      (git.prId === undefined || git.prId === null) &&
      (git.org === undefined || git.org === identity.git.owner) &&
      (git.repo === undefined || git.repo === identity.git.repository),
    "identity-mismatch",
    "deployment",
  );
  const meta =
    deployment.meta === undefined ? {} : object(deployment.meta, "deployment");
  for (const [key, expected] of Object.entries({
    githubCommitOrg: identity.git.owner,
    githubCommitRepo: identity.git.repository,
    githubCommitSha: identity.git.sha,
    githubCommitRef: identity.git.ref,
    githubRepoId: String(identity.git.repositoryId),
  })) {
    const actual = meta[key];
    need(
      actual === undefined ||
        ((typeof actual === "string" || typeof actual === "number") &&
          String(actual) === expected),
      "identity-mismatch",
      "deployment",
    );
  }
  need(
    definition.id === identity.checkId &&
      definition.ownerId === identity.teamId &&
      definition.projectId === identity.projectId &&
      definition.name === identity.checkName &&
      definition.sourceKind === "integration" &&
      definition.requires === "deployment-url" &&
      definition.blocks === "deployment-alias" &&
      canonical(definition.targets) === '["production"]' &&
      definition.isRerequestable === false &&
      Number.isSafeInteger(definition.timeout) &&
      Number(definition.timeout) > 0 &&
      Number(definition.timeout) <= 3600,
    "identity-mismatch",
    "definition",
  );
  integrationSource(definition.source, identity, "definition");
  need(
    run.id === identity.checkRunId &&
      run.deploymentId === identity.deploymentId &&
      run.checkId === identity.checkId &&
      run.ownerId === identity.teamId &&
      (run.projectId === undefined || run.projectId === identity.projectId) &&
      run.name === identity.checkName &&
      run.timeout === definition.timeout &&
      (run.requires === undefined || run.requires === definition.requires) &&
      (run.blocks === undefined || run.blocks === definition.blocks) &&
      (run.targets === undefined ||
        canonical(run.targets) === canonical(definition.targets)) &&
      ["queued", "running", "completed"].includes(String(run.status)) &&
      Number.isSafeInteger(run.createdAt) &&
      Number(run.createdAt) > 0 &&
      Number.isSafeInteger(run.updatedAt) &&
      Number(run.updatedAt) >= Number(run.createdAt),
    "identity-mismatch",
    "run",
  );
  integrationSource(run.source, identity, "run");
  if (run.status !== "completed")
    need(
      run.conclusion === undefined && run.completedAt === undefined,
      "terminal-conflict",
      "run",
    );
}

async function currentSource(
  read: () => Promise<unknown>,
  identity: VercelDeploymentCheckIdentity,
): Promise<void> {
  let value: JsonObject;
  try {
    value = object(await read(), "current-source");
  } catch {
    throw new VercelDeploymentCheckError("stale-source", "current-source");
  }
  need(
    value.protected === true &&
      Object.entries(identity.git).every(
        ([key, expected]) => value[key] === expected,
      ),
    "stale-source",
    "current-source",
  );
}

function terminal(
  run: JsonObject,
  expected: ReturnType<typeof completionFor>,
): boolean {
  if (run.status !== "completed") {
    need(
      run.externalId === undefined || run.externalId === expected.completionId,
      "concurrent-update",
      "run",
    );
    return false;
  }
  need(
    run.conclusion === expected.conclusion &&
      run.externalId === expected.completionId,
    "terminal-conflict",
    "run",
  );
  need(
    run.output !== null &&
      typeof run.output === "object" &&
      !Array.isArray(run.output),
    "terminal-conflict",
    "run",
  );
  const output = run.output as JsonObject;
  need(
    canonical(output.delivery) === canonical(expected.delivery) &&
      Number.isSafeInteger(run.completedAt) &&
      Number(run.completedAt) >= Number(run.createdAt),
    "terminal-conflict",
    "run",
  );
  return true;
}

/**
 * Complete one integration-backed production check run, never a commit status.
 * The caller serializes writers by deployment/check-run ID. The provider's PATCH
 * API has no documented compare-and-swap; read-before-write is not an atomic lock.
 */
export async function completeVercelDeploymentCheck(
  options: VercelDeploymentCheckOptions,
): Promise<VercelDeploymentCheckReceipt> {
  const identity = checkedIdentity(options.identity);
  const expected = completionFor(identity, options.completion);
  const request = client(
    identity,
    options.token,
    options.fetch ?? ((url, init) => globalThis.fetch(url, init)),
  );
  const deploymentPath = `/v13/deployments/${identity.deploymentId}`;
  const definitionPath = `/v2/projects/${identity.projectId}/checks/${identity.checkId}`;
  const runPath = `/v2/deployments/${identity.deploymentId}/check-runs/${identity.checkRunId}`;
  const readSnapshot = async (): Promise<Snapshot> => {
    const results = await Promise.allSettled([
      request(deploymentPath, "deployment"),
      request(definitionPath, "definition"),
      request(runPath, "run"),
    ]);
    const values: unknown[] = [];
    let failed = false;
    let failure: unknown;
    for (const result of results) {
      if (result.status === "fulfilled") values.push(result.value);
      else {
        failed = true;
        failure = result.reason as unknown;
      }
    }
    if (failed)
      throw failure instanceof VercelDeploymentCheckError
        ? failure
        : new VercelDeploymentCheckError("request-failed", "readback");
    const snapshot = {
      deployment: object(values[0], "deployment"),
      definition: object(values[1], "definition"),
      run: object(values[2], "run"),
    };
    checkedSnapshot(snapshot, identity);
    return snapshot;
  };
  const receipt = (changed: boolean): VercelDeploymentCheckReceipt =>
    Object.freeze({
      deploymentId: identity.deploymentId,
      checkRunId: identity.checkRunId,
      sourceSha: identity.git.sha,
      conclusion: expected.conclusion,
      completionId: expected.completionId,
      changed,
    });
  const before = await readSnapshot();
  await currentSource(options.readCurrentSource, identity);
  if (terminal(before.run, expected)) return receipt(false);
  const latest = await readSnapshot();
  await currentSource(options.readCurrentSource, identity);
  if (terminal(latest.run, expected)) return receipt(false);
  need(
    latest.run.updatedAt === before.run.updatedAt &&
      latest.run.status === before.run.status &&
      canonical(latest.definition) === canonical(before.definition),
    "concurrent-update",
    "run",
  );
  if (expected.conclusion === "succeeded")
    need(
      latest.deployment.readyState === "READY" &&
        latest.deployment.readySubstate === "STAGED",
      "identity-mismatch",
      "deployment",
    );
  try {
    await request(runPath, "complete", {
      status: "completed",
      conclusion: expected.conclusion,
      completedAt: Date.now(),
      externalId: expected.completionId,
      output: { delivery: expected.delivery },
    });
  } catch (error) {
    // A lost response can follow a committed PATCH. Never send a second PATCH.
    if (
      error instanceof VercelDeploymentCheckError &&
      error.httpStatus !== undefined &&
      error.httpStatus >= 400 &&
      error.httpStatus < 500
    )
      throw error;
  }
  const wait =
    options.wait ??
    (async (milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await wait(100 * attempt);
    try {
      const after = await readSnapshot();
      if (terminal(after.run, expected)) {
        await currentSource(options.readCurrentSource, identity);
        return receipt(true);
      }
    } catch (error) {
      if (
        error instanceof VercelDeploymentCheckError &&
        [
          "identity-mismatch",
          "terminal-conflict",
          "concurrent-update",
          "stale-source",
        ].includes(error.code)
      )
        throw error;
    }
  }
  throw new VercelDeploymentCheckError("completion-unconfirmed", "readback");
}
