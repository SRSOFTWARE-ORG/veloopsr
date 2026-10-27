# Veloop SR Software: staged production hardening

## Scope and safeguards
- Integrate the intent of PR #1 at `da1445b97c0f8eb71c203be6ba85f597ace3b44c` into the current project, preserving its newer login, maintenance, WhatsApp and vendor changes.
- Use only this app’s connected, populated Cloud database. Inspection has confirmed 50 document records with public URLs and the public sales-document bucket.
- Make no production data changes, apply no migrations, change no bucket settings, and deploy/publish nothing.

## Implementation
1. Finish read-only inspection of actual policies, grants, triggers, storage ownership and scheduled-call configuration; review the PR for regressions before porting it.
2. Harden AI actions with authenticated administrator checks, strict inputs, server-bound expiring single-use confirmations, safe downstream identity forwarding and truthful action results.
3. Add the reviewed Edge Function guards without breaking existing authenticated app calls, maintenance/WhatsApp switches or scheduled jobs. Document any scheduler credential transition before rollout.
4. Update every sales-document upload/read/share consumer to canonical private object paths and short-lived signed URLs, supporting existing public-URL records without rewriting them. Keep the bucket public until a later, explicitly approved rollout.
5. Integrate contract creation and electronic signature capture with authorized sale access, immutable evidence, content-hash validation and safe rendering. Keep the feature unavailable until its tables exist, with a clear setup state rather than runtime failures.
6. Prepare unapplied, idempotent SQL for the reviewed RLS, profile privilege protection, confirmation ledger and contracts. Stage storage access separately; changing bucket visibility is a later Storage API action, not SQL.
7. Add focused regression/security tests and CI, run tests, check the preview’s automatic build, and provide an exact changed-file inventory plus ordered rollout/rollback guidance.

## Validation and rollout
- Locally test confirmation tampering, expiry/replay handling, input boundaries, legacy document-path compatibility and signature rules.
- Inspect actual foreign keys and duplicate external-sync triggers before changing dependent write flows; do not silently remove production triggers.
- Validate migrations and role/trigger scenarios on an isolated fixture, never against production business data.
- Authenticated production end-to-end changes are intentionally deferred because migrations/deployment are prohibited. Report this limitation explicitly.

## Technical approach
- Selectively merge PR hunks; do not copy its environment removal, generated connection files, old app entry point or bucket/data rewrite.
- Use the existing Cloud client, semantic UI components and shared maintenance/Evolution helpers.
- New public tables include explicit grants and RLS; new user IDs do not reference managed auth tables.
- Record architecture decisions and safe rollout prerequisites in project documentation.