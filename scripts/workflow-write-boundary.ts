const contentsWrite = ["contents", "write"].join(": ");
const writeCapabilities = [
  ["packages", "write"].join(": "),
  ["id-token", "write"].join(": "),
  ["pull-requests", "write"].join(": "),
  ["npm", "publish"].join(" "),
];

// auto-tag.yml may ask the hraness-release-tagger GitHub App for a token that
// can create the release tag. That single token input is its only write access:
// the workflow itself keeps contents read, and the input must sit in the one
// create-github-app-token step.
const taggerWorkflow = ".github/workflows/auto-tag.yml";
const taggerTokenAction = "actions/create-github-app-token@";
const taggerTokenInput = /^ {10}permission-contents: write\n/mu;

export function workflowWriteViolation(repositoryPath: string, contents: string): string | undefined {
  for (const capability of writeCapabilities) {
    if (contents.includes(capability)) return `${repositoryPath} contains mutating release capability ${capability}`;
  }
  let remainder = contents;
  if (repositoryPath === taggerWorkflow) {
    const steps = contents.split(/^ {6}- /mu);
    const [tokenStep, ...extraTokenSteps] = steps.filter((step) => taggerTokenInput.test(step));
    if (
      tokenStep?.includes(taggerTokenAction) === true
      && extraTokenSteps.length === 0
      && contents.split(taggerTokenAction).length === 2
      && /^permissions:\n {2}contents: read\n/mu.test(contents)
    ) {
      remainder = contents.replace(taggerTokenInput, "");
    }
  }
  if (remainder.includes(contentsWrite) && repositoryPath !== ".github/workflows/release.yml") {
    return `${repositoryPath} has unexpected contents write access`;
  }
  return undefined;
}
