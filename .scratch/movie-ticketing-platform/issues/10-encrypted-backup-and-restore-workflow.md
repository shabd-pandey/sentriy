# 10: Backing up and restoring pilot data

**What to build:** The operator can rely on a scheduled encrypted database backup and change-triggered media backups for the pilot, retain the agreed rolling set, and demonstrate that stored backups can be restored.

**Blocked by:** 02: Managing films and showing the customer catalog; 03: Scheduling screenings and showing availability; 05: Confirming verified payments and issuing customer QR tickets; 07: Managing screening changes, cancellations, and customer updates; 08: Managing and displaying promotional banners.

**Status:** ready-for-agent

- [ ] A scheduled workflow creates a daily logical database export covering films, screenings, orders, payments, refunds, roles/assignments, activity, and notifications.
- [ ] Database exports are encrypted before storage; encryption keys are not included in artifacts, logs, or repository contents.
- [ ] Uploaded poster and banner media is included in an encrypted backup when it changes, with enough metadata to restore object references.
- [ ] The workflow retains seven daily database snapshots and prunes older snapshots according to the retention policy.
- [ ] Backup job failures are visible to the operator and do not appear as successful backups.
- [ ] A documented restore procedure successfully restores a selected database snapshot and associated media into a disposable environment.
- [ ] GitHub Actions minute, artifact-size, and artifact-retention quotas and the lack of provider-independent recovery are documented.
- [ ] End-to-end operational tests verify backup generation, encryption handling, media coverage, retention, failure reporting, and restore integrity.
