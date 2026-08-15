# Contributing

Open an issue before proposing a behavior or identity change. Delivery-proof inputs, header names, environment names, and hash namespaces are compatibility contracts.

Use Bun 1.3.14 and Node 24. Install dependencies and run the complete local gate:

```sh
bun install --frozen-lockfile
bun run check
```

Add a deterministic regression test for every behavior change. Keep examples product-neutral and never add credentials, private repository names, deployment URLs, or customer data.
