# Architecture rules
- Both login pages use the shared bounded authentication flow; auth event callbacks defer database work until the SDK lock is released to avoid session deadlocks.
- Login diagnostics store only categorical outcomes locally and sync to the existing audit table after verified authentication; they are client diagnostics, not authoritative security logs.