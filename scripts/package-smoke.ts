import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";

const packageName = "@hraness/vercel-delivery";
const importSpecifiers = [
  packageName,
  `${packageName}/next-config`,
];
const verifiedNextVersions = ["16.2.12", "16.3.0"] as const;
const verificationPackages = [
  "@types/node@^24.10.0",
  "@types/react@^19.2.14",
  "@types/react-dom@^19.2.3",
  "react@19.2.3",
  "react-dom@19.2.3",
  "typescript@^6.0.3",
];

const repository = process.cwd();
const work = await mkdtemp(join(tmpdir(), "vercel-delivery-package-smoke-"));
const cache = join(work, "cache");
const temporary = join(work, "tmp");
const environment = {
  ...process.env,
  BUN_INSTALL_CACHE_DIR: cache,
  BUN_TMPDIR: temporary,
  TMPDIR: temporary,
};

async function run(command: string[], cwd: string): Promise<void> {
  const child = Bun.spawn(command, {
    cwd,
    env: environment,
    stderr: "inherit",
    stdout: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(
      `Command failed (${String(exitCode)}): ${command.join(" ")}`,
    );
  }
}

function resolveGenuineNodeExecutable(): string {
  const executableName = process.platform === "win32" ? "node.exe" : "node";
  const identityProbe = [
    "if (typeof Bun !== 'undefined'",
    "|| process.versions.bun !== undefined",
    "|| !process.versions.node?.startsWith('24.')) process.exit(1)",
  ].join(" ");
  const candidates = [...new Set(
    (process.env.PATH ?? "")
      .split(delimiter)
      .filter((directory) => directory.length > 0)
      .map((directory) => resolve(directory, executableName)),
  )];

  for (const executable of candidates) {
    try {
      const probe = Bun.spawnSync([
        executable,
        "--input-type=commonjs",
        "-e",
        identityProbe,
      ], {
        env: environment,
        stderr: "ignore",
        stdin: "ignore",
        stdout: "ignore",
      });
      if (probe.exitCode === 0) return executable;
    } catch {
      // Continue past absent, inaccessible, or incompatible PATH candidates.
    }
  }

  throw new Error("package smoke requires a genuine Node 24 executable on PATH");
}

try {
  const archive = join(work, "package.tgz");
  await mkdir(cache, { mode: 0o700 });
  await mkdir(temporary, { mode: 0o700 });
  const nodeExecutable = resolveGenuineNodeExecutable();

  await run([
    process.execPath,
    "pm",
    "pack",
    "--filename",
    archive,
    "--ignore-scripts",
    "--quiet",
  ], repository);
  const sharedCompilerOptions = {
    target: "ES2024",
    lib: ["ES2024", "DOM", "DOM.Iterable"],
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: ["node"],
  };

  for (const nextVersion of verifiedNextVersions) {
    const consumer = join(work, `consumer-next-${nextVersion}`);
    await mkdir(consumer);
    await writeFile(
      join(consumer, "package.json"),
      JSON.stringify({ private: true, type: "module" }),
    );
    await run([
      process.execPath,
      "add",
      archive,
      `next@${nextVersion}`,
      ...verificationPackages,
      "--ignore-scripts",
    ], consumer);

    await run([
      nodeExecutable,
      "--input-type=module",
      "-e",
      `await Promise.all(${JSON.stringify(importSpecifiers)}.map((specifier) => import(specifier)))`,
    ], consumer);

    const installedRoot = join(
      consumer,
      "node_modules",
      "@hraness",
      "vercel-delivery",
    );
    if (await Bun.file(join(installedRoot, "src", "index.test.ts")).exists()) {
      throw new Error("installed package must not contain source tests");
    }

    await writeFile(
      join(consumer, "index.ts"),
      [
        "import type { NextConfig } from \"next\";",
        "import { withProductionDeliveryProof } from \"@hraness/vercel-delivery\";",
        "import { PRODUCTION_DELIVERY_PROOF_HEADER } from \"@hraness/vercel-delivery/next-config\";",
        "const config: NextConfig = withProductionDeliveryProof({}, { projectName: \"example-web\", environment: {} });",
        "void [config, PRODUCTION_DELIVERY_PROOF_HEADER];",
        "",
      ].join("\n"),
    );
    await writeFile(
      join(consumer, "tsconfig.bundler.json"),
      JSON.stringify({
        compilerOptions: {
          ...sharedCompilerOptions,
          module: "Preserve",
          moduleResolution: "Bundler",
        },
        include: ["index.ts"],
      }, null, 2),
    );
    await writeFile(
      join(consumer, "tsconfig.nodenext.json"),
      JSON.stringify({
        compilerOptions: {
          ...sharedCompilerOptions,
          module: "NodeNext",
          moduleResolution: "NodeNext",
        },
        include: ["index.ts"],
      }, null, 2),
    );
    await run(
      [process.execPath, "x", "tsc", "-p", "./tsconfig.bundler.json"],
      consumer,
    );
    await run(
      [process.execPath, "x", "tsc", "-p", "./tsconfig.nodenext.json"],
      consumer,
    );

    await mkdir(join(consumer, "app"));
    await writeFile(
      join(consumer, "next.config.ts"),
      [
        'import { withProductionDeliveryProof } from "@hraness/vercel-delivery/next-config";',
        "export default withProductionDeliveryProof({ output: \"export\" }, {",
        "  environment: {},",
        '  projectName: "package-smoke",',
        "});",
        "",
      ].join("\n"),
    );
    await writeFile(
      join(consumer, "app", "layout.js"),
      "export default function Layout({ children }) { return <html><body>{children}</body></html>; }\n",
    );
    await writeFile(
      join(consumer, "app", "page.js"),
      "export default function Page() { return <main>Delivery package smoke</main>; }\n",
    );
    await run([
      nodeExecutable,
      join(consumer, "node_modules", "next", "dist", "bin", "next"),
      "build",
    ], consumer);
  }
} finally {
  await rm(work, { force: true, recursive: true });
}
