# AI Safety Boundaries

## NEVER do these, even if the user asks

1. **Never delete or recreate the database** (`tools.db`) — soft-delete only
2. **Never delete or overwrite the clone repo directory** (`~/.tool-orchestrator/repos/`)
3. **Never run `rm -rf` on project directories**
4. **Never delete backup files** — they are insurance against mistakes
5. **Never modify files in cloned repos** — read-only analysis only

## ALWAYS do these

1. **Backup before any data-affecting operation**
2. **Soft-delete instead of hard-delete** (status = 'inactive', never DELETE FROM)
3. **Check the lockfile** (`~/.tool-orchestrator/PROTECTED`) before writing to DB
4. **Verify data integrity** — confirm DB still has records after an operation
5. **Log all destructive operations** with timestamps

## Lockfile Protocol

If `~/.tool-orchestrator/PROTECTED` exists, the database is IMMUTABLE:
- No schema changes
- No deletions (even soft)
- No clearing of cached data
- Only reads and INSERTs are allowed

Remove the lockfile with `rm ~/.tool-orchestrator/PROTECTED` to allow write operations.

## Recycle Bin

All soft-deleted records go to the `recycle_bin` table or get `status = 'inactive'`.
They can be restored via the API:
- `GET /api/tools/deleted` — list deleted tools
- `POST /api/tools/:id/restore` — restore a tool
