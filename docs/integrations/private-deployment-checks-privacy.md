# Hraness deployment checks: privacy notice


This integration is intended only for the Hraness portfolio site and Yaptake
website projects, both owned by Hraness. There is no third-party installation or customer signup.

The intended workflow reads GitHub repository, owner, commit, branch and check
metadata, together with Vercel project, deployment, integration-configuration and
deployment-check metadata. These records can include operator or commit-author
identifiers. It compares generated website files and checks public pages and
protected previews. Anonymous browser checks do not sign in to an application or
access customer accounts, saved media, learner records or other application user
data.

During setup, a local OAuth callback receives a temporary authorization code and
exchanges it with Vercel for the installation credential. The intended persistent
credential storage is GitHub's encrypted Actions secrets, restricted to the two
private repositories responsible for these sites. The credential is supplied
only to the controller when needed. Preview access uses a separate secret for
the exact candidate host. Credentials are not intended to appear in website
output, logs or verification artifacts.

GitHub Actions runs the controller and keeps its execution logs and verification
records in the private repositories. Vercel handles API requests and deployment
metadata. Those providers' existing settings and policies govern their records;
this notice does not promise a fixed retention period. The proposed integration
adds no analytics, advertising, customer-data collection or separate database.

Authorized Hraness operators can revoke access in Vercel, remove GitHub secrets
and manage retained workflow records through the providers' controls. Questions
about this private setup should go to the Hraness owner responsible for these
projects. This notice concerns only the integration, not the products' separate
privacy practices.
