# Pilot Runner v1 safety boundaries

Build 1 exposes only named technical operations. Callers cannot select an executable, shell,
argument vector, or structural command flag from task/model data. Executables are resolved to
canonical, executable, non-group/world-writable files and child processes receive a minimal
environment with a runner-controlled `PATH`.

Each operation starts in its own process group. A timeout sends `SIGTERM` to that group, waits
briefly, then sends `SIGKILL` to the same group. This prevents descendants from surviving into a
resume without targeting processes outside the runner-owned group.

Bootstrap is Linux/WSL-only in Pilot v1. Every Bootstrap command runs in a fresh user and network
namespace created by `/usr/bin/unshare --user --map-current-user --net`. The namespace has no host
or external network interface. If namespaces or `unshare` are unavailable, Bootstrap reports
`NETWORK_ISOLATION_CAPABILITY_MISSING`; it never falls back to network-enabled execution. Populating
the pnpm store and required engines remains a separate human-controlled operation.

Git mutation requires an immutable approved context binding repository root, Athleta origin,
worktree root, approved base SHA, and task branch. Bootstrap accepts only the opaque worktree
context produced by that boundary and revalidates the registered worktree, identity, branch, HEAD,
location, and cleanliness immediately before running pnpm.

For run state, `state.json` is the durable authority and `journal.ndjson` is a recoverable audit
projection. Every mutation requires the owning run-lock token. A partial journal tail is truncated
durably before append; a snapshot event missing from the journal is restored from the authoritative
snapshot. A non-idempotent operation left `planned` at resume becomes `outcome_unknown` and requires
external reconciliation before any future retry.
