---
title: Repository seams
type: concept
tags:
  - architecture
  - dependencies
  - repositories
repository_scopes:
  - AGENTS.md
  - package.json
  - src
---

# Repository seams

Vercel Delivery owns fail-closed deployment-proof parsing, Preview-origin evidence, and the product-neutral Next.js configuration wrapper. Authorization, routing, data access, deployment credentials, and product-specific interface behavior remain with consumers.

The package currently declares no Hraness runtime dependency. Any future shared dependency must use a reviewed immutable release or full commit so consumers can upgrade independently. Do not connect development through sibling paths, Git submodules, or coordinated `main` workflows. Extract another shared package only after two concrete consumers need the same stable, product-neutral interface.

This package stays headless. Consumer interfaces may layer accessible primitives from `@hraness/ui`, optional stable composition from `@hraness/design-kit`, and product-owned layout and content without coupling either design package to delivery proof. Direct compositions are development-only and must never enter published exports or production dependency graphs.

Freeze delivery and export contracts before parallel lanes. Give the package manifest, export map, generated output, and lockfile one owner while independent lanes change disjoint implementation and test paths.

## Related

The normative rules remain in the root `AGENTS.md`. [[documentation-ownership|Documentation ownership]] explains how those rules relate to executable contracts and this pull-based context.
