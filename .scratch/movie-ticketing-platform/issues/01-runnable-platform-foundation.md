# 01: Creating the runnable platform foundation and role-safe sign-in

**What to build:** The operator can deploy and open customer, admin, and staff web surfaces backed by the shared application and database. Users can sign in with Google, public registrations receive customer access only, and the owner account is granted admin access through an explicit allowlist.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Customer, owner/admin, and staff entry points are available as responsive web experiences sharing one backend.
- [ ] Clerk Google sign-in works for public customers and supported admin/staff accounts.
- [ ] New public accounts receive customer permissions only; no public action can grant admin or staff roles.
- [ ] An explicitly allowlisted owner account can access owner/admin features.
- [ ] Neon Postgres connectivity is configured without exposing credentials to browser clients.
- [ ] Role checks are enforced on server-side operations, not only by hiding frontend navigation.
- [ ] End-to-end tests verify signed-in customer access, owner access, and denial of privileged operations to an ordinary customer.

The catalog implementation adds customer/admin surfaces and server-side Clerk JWT role checks in `prototype/functions/api/[[path]].ts`. Deployment, allowlisted role assignment, staff surfaces, and end-to-end identity tests still require provider configuration and remain open.
