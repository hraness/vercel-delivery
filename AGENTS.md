# Contents

- `src/index.ts` defines the delivery-proof token, Preview-origin validation, and Next.js config wrapper.
- `src/index.test.ts` holds deterministic behavior and fail-closed regression tests.
- `scripts/` contains build, inventory, public-boundary, and installed-package checks.
- `.github/workflows/` runs read-only continuous integration and publishes an immutable release only after tag verification succeeds.

# Guidelines

- Keep the package product-neutral and safe for a public repository.
- Preserve fail-closed behavior whenever any Vercel deployment identity is present.
- Treat the Preview-origin value as UI evidence only. It must never authorize requests, routing, or data access.
- Preserve existing response headers and wrap both object and function Next.js configurations.
- Keep the root and `./next-config` exports equivalent.
- Use Bun 1.3.14 for installs, builds, and tests. Verify installed-package imports with genuine Node 24.
- Run `bun run check` before release handoff. The release workflow may write only the verified immutable GitHub Release.
