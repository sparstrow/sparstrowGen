# design-brief — working artifacts

Direction boards built during the `design-brief` interview. **Disposable** —
decision aids, not deliverables. Once `DESIGN.md` is written the boards' job is
done and the doctrine carries forward; they are kept only as evidence of why a
direction was chosen (see `design-system/DECISIONS.md`).

## Viewing

The boards render via JS, so they need serving rather than opening from disk:

```bash
node .claude/skills/design-system/scripts/ds.mjs serve --root design-brief --port 4322
```

Then open <http://localhost:4322/character-board.html>.

## Boards

| Board | Question it answers | Status |
|---|---|---|
| `character-board.html` | Overall character for Chat — the owner's key screen | awaiting pick |
