# Pilot Runner v1 safety boundaries

Pilot v1 has a fixed authority in `config/pilot-v1.json`. The runner loads that file from its own
directory and validates a closed shape. Repository root, exact origin, approved base SHA, state
root, worktree root, runtime versions, and tool locations cannot be supplied through task data or
through the public Git/Bootstrap APIs.

The only public Git context input is `{ taskId, slug }`. `taskId` must match `ATH-[0-9]+` and
`slug` must be safe kebab-case. The runner derives both values below and does not accept overrides:

```text
branch        athleta-pilot/<taskId>-<slug>
worktree path <configuredWorktreeRoot>/<taskId>-<slug>
```

Worktree creation and reopening accept only opaque contexts created by the runner. Immediately
before each mutation and before Bootstrap, the runner revalidates repository realpath/top-level,
origin, configured base, derived branch and path, worktree registration, canonical containment,
and checkout cleanliness. There is one internal `git worktree add` path and no generic public Git
executor.

The process supervisor is package-internal. Public modules expose fixed tool probes, not operation
enums, executables, argv, shells, `cwd`, repository paths, or root selectors. Executables are
canonical non-group/world-writable files, `shell` is always false, child environments are
allowlisted with a runner-controlled `PATH`, and every child owns a process group. Timeout sends
`SIGTERM` and then `SIGKILL` to that group. Bootstrap adds a PID namespace boundary described
below; generic process probes rely only on their process group. Process-tree scripts live only
under `test/fixtures`.

Bootstrap accepts one approved worktree context and always performs both `pnpm install` and Prisma
Generate in one Linux/WSL namespace. There is no public direct-Prisma operation and no option to
skip either stage. The namespace is created with:

```text
setpriv --pdeathsig SIGKILL -- \
  unshare --user --map-root-user --mount --net \
          --pid --fork --kill-child=SIGKILL --mount-proc
```

The fixed launcher verifies that its parent is still the expected supervisor before entering
`unshare`, closing the startup window before `pdeathsig` is armed. Inside the PID namespace a fixed
Bash 5.2+ init runs as PID 1, launches the Node namespace driver as its direct child, reaps adopted
orphans, forwards `SIGTERM`, and preserves the driver's exit status. When the driver finishes, PID
1 exits and the kernel kills every remaining namespace member. Descendants therefore cannot escape
Bootstrap by using `setsid`, a detached process group, reparenting, or multiple process levels. The
outer supervisor still provides its existing graceful timeout; `pdeathsig` and `--kill-child`
contain unexpected supervisor/launcher death.

For each run, the runner creates `stateRoot/bootstrap-store/run-<id>/` with private pnpm and Prisma
overlay directories plus a temporary home. It resolves the versioned pnpm 11.4.0 store, bind-mounts
that lower directory onto itself, remounts it read-only, and mounts its overlay at `merged/v11`.
The base `merged` path is passed as `--store-dir` because pnpm 11.4.0 resolves it internally to the
versioned `v11` child. The global store remains immutable while SQLite `index.db` and any other
writes copy up only as needed.

Prisma Generate resolves the engine cache from the runner UID's operating-system home, never from
an inherited `HOME`, and uses it as a second read-only lower with an ephemeral overlay at the
temporary home's `XDG_CACHE_HOME/prisma`. No other host cache is exposed. Prisma can reuse already
authorized engine artifacts and write cache metadata without changing the global engine cache.

Both pnpm stages run through `/usr/bin/setpriv` with `no_new_privs` and empty inheritable,
permitted/effective, bounding, and ambient capability sets. The install is fixed to offline,
frozen-lockfile, store-integrity verification, copy import, the ephemeral `--store-dir`, and
`--trust-lockfile` (the lockfile belongs to the revalidated approved base and this prevents
supply-chain policy metadata checks from attempting registry access). The namespace has no host or
external network interface.

Preflight exercises the real boundary: user/mount/network/PID namespaces with a private `/proc`,
the PID 1 reaper, read-only pnpm and Prisma
lowers, writable overlays, a transactional open/rollback of the overlaid pnpm SQLite index, and
the capability drop. It also verifies that the dropped process cannot create a nested namespace.
If Bash 5.2+, `unshare`, PID or mount namespace support, private `/proc`, mount, overlayfs,
`setpriv`, capability removal, or SQLite copy-up is unavailable, Bootstrap returns `BLOCKED` and
has no weaker fallback.

Missing dependencies or Prisma artifacts are reported as `DEPENDENCY_CACHE_MISS`. Bootstrap never
retries online. Populating the store is a separate, explicitly authorized operation. Namespace
exit removes the mounts; the runner then validates and deletes only its exact ephemeral run root.
A cleanup failure is itself reported and never hidden.

For durable run state, `state.json` remains authoritative and `journal.ndjson` remains a
recoverable audit projection. Mutations require the owning lock token; partial journal tails are
recovered, and non-idempotent planned operations become `outcome_unknown` after a crash.
