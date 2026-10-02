# Parallel agent brief template

Agents start with zero context. Fill every field.

- **Goal**: one sentence, observable outcome.
- **Owned paths**: the only files/dirs you may edit.
- **Read-only context**: `docs/contract.md`, other files to read.
- **Do not touch**: everything else.
- **Verify**: exact command(s) that prove it works.
- **Report (<=10 lines)**: what changed, what is unverified, any contract changes needed.
- **Isolation**: use a worktree if paths might overlap.
