import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "..");
const ignoredDirectories = new Set([".git", "dist", "node_modules"]);
const textExtensions = new Set([
  "", ".json", ".md", ".mjs", ".ts", ".yml", ".yaml",
]);
const writeCapabilities = [
  ["packages", "write"].join(": "),
  ["id-token", "write"].join(": "),
  ["pull-requests", "write"].join(": "),
  ["npm", "publish"].join(" "),
];
const privateIdentityDigest = "91ed2ef15eee7102873d33d852cae9a195eff25e758269de6457723b1d8dc29a";

async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await files(path));
    else if (entry.isFile() && textExtensions.has(extname(entry.name))) {
      paths.push(path);
    }
  }
  return paths;
}

for (const path of await files(repositoryRoot)) {
  const contents = await readFile(path, "utf8");
  const normalized = contents.toLocaleLowerCase("en-US");
  for (let index = 0; index <= normalized.length - 6; index += 1) {
    const digest = createHash("sha256")
      .update(normalized.slice(index, index + 6))
      .digest("hex");
    if (digest === privateIdentityDigest) {
      throw new Error(
        `${relative(repositoryRoot, path)} contains a private product identity`,
      );
    }
  }
  if (path.includes(`${join(".github", "workflows")}${String.raw`/`}`)) {
    for (const capability of writeCapabilities) {
      if (contents.includes(capability)) {
        throw new Error(
          `${relative(repositoryRoot, path)} contains mutating release capability ${capability}`,
        );
      }
    }
    if (
      contents.includes(["contents", "write"].join(": "))
      && relative(repositoryRoot, path) !== ".github/workflows/release.yml"
    ) {
      throw new Error(`${relative(repositoryRoot, path)} has unexpected contents write access`);
    }
  }
}

const releaseWorkflow = await readFile(
  join(repositoryRoot, ".github/workflows/release.yml"),
  "utf8",
);
for (const required of [
  "needs: verify",
  "verified_tag:",
  "contents: write",
  "gh release create",
  "isImmutable",
]) {
  if (!releaseWorkflow.includes(required)) {
    throw new Error(`release workflow is missing ${required}`);
  }
}
if ([...releaseWorkflow.matchAll(/contents: write/gu)].length !== 1) {
  throw new Error("release workflow must scope contents write to one publisher");
}

const manifest = JSON.parse(
  await readFile(join(repositoryRoot, "package.json"), "utf8"),
) as { exports?: unknown; peerDependencies?: unknown };
const expectedExports = {
  ".": {
    types: "./src/index.ts",
    import: "./dist/index.js",
    default: "./dist/index.js",
  },
  "./next-config": {
    types: "./src/index.ts",
    import: "./dist/index.js",
    default: "./dist/index.js",
  },
};
if (JSON.stringify(manifest.exports) !== JSON.stringify(expectedExports)) {
  throw new Error("package exports must expose equivalent root and next-config entries");
}
if (JSON.stringify(manifest.peerDependencies) !== JSON.stringify({
  next: ">=16.2.0 <17.0.0",
})) {
  throw new Error("package must declare the supported Next.js peer range");
}
