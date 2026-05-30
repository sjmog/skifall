# Level bank infrastructure

Skifall's official downhill levels live in `src/lib/pregenerated-levels.ts`.

Each level template has:

- `metadata.levelId`: a stable unique id for the level.
- `metadata.name`: the public level name.
- `metadata.image`: the full-level screenshot for menus, review tools, and the future level designer.
- `metadata.owners`: account identifiers for maintainers of the level. If omitted through the `levelTemplate` helper, this defaults to `[DEFAULT_LEVEL_OWNER]`, currently `ADMIN`.
- `metadata.difficulty`: one of `easy`, `medium`, or `hard`.
- `metadata.status`: one of `draft`, `published`, or `archived`.
- `metadata.version`: the level revision number.
- `metadata.tags`: searchable tags for grouping and discovery.
- `metadata.createdAt` and `metadata.updatedAt`: ISO date strings for database sorting and auditing.
- `features`: the game-ready level lines. `solid` features are the black playable lines, and `scenery` features are the grey decorative lines.

The helper `getLevelData(template)` exposes the same level data in editor-friendly groups:

- `blackLines`
- `greyLines`
- `start`
- `finish`

Runtime levels generated from the bank include the template id, owners, difficulty, and grouped level data while preserving the current `start`, `finish`, and `features` fields used by the game.

Downhill rounds select from the bank by difficulty and progress from easy to medium to hard over the configured round count.

Full-level screenshots should be stored under `public/levels/<level-id>/full-level.png`. The default `metadata.image.src` follows that path, so adding a screenshot alongside a new level does not require extra code.
