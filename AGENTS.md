<!-- kb:context scopes/repository--cdb4ee2aea69 -->
# Contents

- `src/index.ts` defines the delivery-proof token, Preview-origin validation, and Next.js config wrapper.
- `src/index.test.ts` holds deterministic behavior and fail-closed regression tests.
- `scripts/` contains build, inventory, public-boundary, and installed-package checks.
- `.github/workflows/` runs read-only continuous integration and publishes an immutable release only after tag verification succeeds.
- `.agents/skills/` contains portable cross-repository KB and phased-execution workflows.
- `kb/` contains authored repository rationale, maintained synthesis, and implementation plans.
- `WRITING.md` and `STYLE.md` define the internal and public prose contracts.

# Guidelines

- Keep the package product-neutral and safe for a public repository.
- Follow `WRITING.md` for internal prose and `STYLE.md` for public prose.
- Apply unreasonably robust programming when agent work is cheap. Model invalid states out of existence, parse deployment and framework values from `unknown`, and pair readable deterministic regressions with property tests for parsers, wrappers, ordering, and round trips.
- Deliver changes to `main` through a current-head pull request. Keep the stable `Required` CI job green, resolve every review thread, and serialize merges. Human approval stays optional while one regular maintainer would otherwise self-review. Never force-push or bypass the gate.
- Pin Hraness dependencies to reviewed immutable releases or full commits. Never connect repositories through sibling paths, Git submodules, or coordinated `main` assumptions; upgrade each consumer independently.
- Extract a shared package only after two concrete consumers require the same stable interface. Keep every shared package product-neutral and free of product imports.
- Keep this delivery boundary headless and styling-agnostic. Consumer interfaces may layer `@hraness/ui`, optional `@hraness/design-kit`, and product-owned composition without coupling either design package to delivery proof.
- Keep Direct deterministic compositions and adapters development-only and outside every production dependency graph and published export.
- Freeze package interfaces before parallel lanes begin. Give exports, manifests, lockfiles, generated output, and other convergence surfaces one owner while lanes edit disjoint paths.
- Keep mandatory rules in the closest `AGENTS.md`, current procedures in `docs/`, executable contracts in types and tests, and pull-based rationale, evidence, synthesis, and plans in `kb/`.
- Preserve fail-closed behavior whenever any Vercel deployment identity is present.
- Treat the Preview-origin value as UI evidence only. It must never authorize requests, routing, or data access.
- Preserve existing response headers and wrap both object and function Next.js configurations.
- Keep the root and `./next-config` exports equivalent.
- Use Bun 1.3.14 for installs, builds, and tests. Verify installed-package imports with genuine Node 24.
- Run `bun run check` before release handoff. The release workflow may write only the verified immutable GitHub Release.

<!-- hra-local-efficiency:start -->
- Preserve useful reasoning fan-out, but avoid unnecessary checkout fan-out. Prefer subagents in the current task for bounded research, review, diagnosis, and focused checks when they can safely share one working tree; create a separate task or worktree only for independently deliverable divergent edits, an isolated verification tree, or a different execution environment.
- Give each expensive focused validation command and external wait one owner. The integration owner reviews that evidence and runs the repository-required aggregate or final gate once after convergence. Reuse evidence only for the exact Git tree, command, lockfiles, toolchain, relevant environment, and validity period, and never to skip a required final integration, merge, release, deployment, or production-verification gate.
- On Hraness development machines, use `$hra-local-efficiency` and the installed host scheduler for heavyweight top-level commands when available. Keep ordinary work in the compute lane; give authenticated browser/dev-server/Chromium work one `browser-auth` owner and Mac-only validation one `mac-native` owner.
- When a CI or policy gate scans complete Git history, check out the exact governed SHA and fetch only the fully qualified governed refs before scanning. Preserve the complete-history gate and reject unexpected refs instead of importing unrelated concurrent heads.
- At closeout, record applicable branch, PR, check, merge, release, deployment, and production evidence. Archive only conclusively finished tasks, never from silence alone, and reclaim only freshly revalidated clean merged worktrees through the guarded exact-path flow.
<!-- hra-local-efficiency:end -->
