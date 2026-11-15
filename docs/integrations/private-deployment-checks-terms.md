# Hraness deployment checks: private-use terms


This integration is intended only for the Hraness portfolio site and Yaptake
website projects, both owned by Hraness. It is not offered for installation by third parties and does
not provide a service to third-party customers. Only authorized Hraness operators
may install or manage it for those selected projects.

Its permitted functions are to read deployment metadata, read its own integration
configuration, and read or complete its own deployment checks. Completion must
refer to the verified deployment and source. A successful blocking check may let
Vercel assign production domains under the project's existing configuration.

The integration is not authorized to create or modify deployments, change
project settings or domains, manage accounts or billing, or read application
user data. Its verification workflow may read generated website files and
protected preview pages for the selected projects.

The public `@hraness/vercel-delivery` SDK has its own
[MIT license](https://github.com/hraness/vercel-delivery/blob/main/LICENSE).
These private-use terms do not replace or change that license. Vercel and GitHub
remain subject to their separate agreements with Hraness.

An authorized Hraness operator may revoke the integration's access through Vercel
and remove its GitHub credentials.
