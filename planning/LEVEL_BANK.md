# Level bank infrastructure

Skifall's bundled downhill levels live in `src/lib/pregenerated-levels.ts` as the deploy-time seed for the Netlify Blob level bank. The editable database is stored by the Netlify Function at `/.netlify/functions/levels` in the `levels` Blob store under the `level-bank` key.

The site name is confirmed in code as `ski-fall` via `LEVEL_BANK_SITE_NAME` in `src/lib/level-bank.ts`. This matches the documented Netlify preview URL pattern, such as `deploy-preview-{PR#}--ski-fall.netlify.app`.

Each level has:

- `metadata.levelId`: a stable unique id for the level.
- `metadata.name`: the public level name.
- `metadata.image`: the full-level screenshot for menus, review tools, and the future level designer.
- `metadata.owners`: account identifiers for maintainers of the level. For now, the Blob document normalizer forces every level to `[DEFAULT_LEVEL_OWNER]`, currently `ADMIN`, so all levels remain editable/deletable by the creator tooling.
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

The first Netlify Function read seeds the Blob with all bundled levels if no Blob document exists. After that, create, save, publish, and delete operations mutate the Blob document, so level data can be changed without redeploying the site.

The level designer uses `src/lib/level-bank-client.ts` to read and write the Netlify level bank. If the function is unavailable in a local Vite-only session, it displays the bundled seed levels as a read-only fallback and reports that Netlify saving is unavailable.

Runtime levels generated from the bundled seed include the template id, owners, difficulty, and grouped level data while preserving the current `start`, `finish`, and `features` fields used by the game.

Downhill rounds select from the bank by difficulty and progress from easy to medium to hard over the configured round count.

Full-level screenshots should be stored under `public/levels/<level-id>/full-level.png`. The default `metadata.image.src` follows that path, so adding a screenshot alongside a new level does not require extra code.
