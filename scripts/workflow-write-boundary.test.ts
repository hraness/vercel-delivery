import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { workflowWriteViolation } from "./workflow-write-boundary.js";

const taggerPath = ".github/workflows/auto-tag.yml";
const tagger = readFileSync(join(import.meta.dir, "..", taggerPath), "utf8");
const writeInput = "          permission-contents: write\n";

test("auto-tag may request a contents-write token only from create-github-app-token", () => {
  expect(workflowWriteViolation(taggerPath, tagger)).toBeUndefined();
});

test("every other contents write still fails the boundary", () => {
  const cases: [string, string][] = [
    // The same token input in any other workflow.
    [".github/workflows/ci.yml", tagger],
    // A second write grant in auto-tag.yml beside the token input.
    [taggerPath, tagger.replace("permissions:\n  contents: read\n", "permissions:\n  contents: write\n")],
    [taggerPath, `${tagger}\n  extra:\n    permissions:\n      contents: write\n`],
    // The token input moved to a step that is not create-github-app-token.
    [taggerPath, tagger.replace(writeInput, "").replace("          ref: ${{ github.event.workflow_run.head_sha }}\n", `          ref: \${{ github.event.workflow_run.head_sha }}\n${writeInput}`)],
    // Two token steps, or the token input repeated.
    [taggerPath, tagger.replace(writeInput, `${writeInput}${writeInput}`)],
  ];
  for (const [path, contents] of cases) {
    expect(workflowWriteViolation(path, contents)).toContain("unexpected contents write access");
  }
  expect(workflowWriteViolation(taggerPath, `${tagger}\n# packages: write\n`)).toContain("mutating release capability");
});

test("the release workflow keeps its single publisher grant", () => {
  expect(workflowWriteViolation(".github/workflows/release.yml", "permissions:\n  contents: write\n")).toBeUndefined();
});
