# Quest Forge

A browser app for writing your own campaigns and quests for Sword & Sorcery–style dungeon-crawl board games, with a built-in grid map maker.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

## Using tiles from the Quest Editor

If you have the Sword & Sorcery Quest Editor's `SwordSorceryMapEditor_Data` folder, its tiles have been extracted to
`local-assets/sns-quest-editor-tiles.json` (110 tile sides, 1A–55B, with artwork, exact shapes and joint points) and
`local-assets/sns-quest-editor-markers.json` (46 markers: doors, chests, spawns, story events, waypoints…).
and `local-assets/sns-quest-editor-art.json` (enemy cards and portraits, parchment/leather textures, wax seals, icons).
Load all three via **Tile Library → Import library** (multi-select). Tiles snap together joint-to-joint, markers and
enemy portraits appear under the Tokens tool, enemy cards appear in each quest's Enemies list, and the app uses the game's
textures for its chrome. Rebuild the packs with `.venv/bin/python scripts/extract_quest_editor.py`.

## Play (companion)

**Play** in the sidebar is the Sword & Sorcery Companion built into the app: games, heroes, equipment, skills, inventory,
status effects, soul pool, stash, turn order and notes. Link a game to a campaign to see the current quest's map, objectives,
enemy cards and events, and press **Victory** / **Defeat** to move along the campaign's branches. Backups from the
standalone companion can be restored under **Play → Backup**.

## Releases

Each campaign targets a core box (Immortal Souls or Ancient Chronicles) plus expansions. A quest can override that target.
Assign tiles to releases in the Tile Library (e.g. tiles 1–19 → Immortal Souls). The map editor then only offers tiles from the
quest's target, warns about tiles from other boxes, and the quest sheet prints what's required.
Both folders are gitignored: they contain Ares Games' artwork and are for personal use only.

## Features

- **Campaigns**: name, synopsis, private GM notes, an ordered list of quests, and branching (where to go next on victory or defeat).
- **Quests**: introduction, objectives, setup, special rules, numbered events (trigger → effect), rewards, and victory/defeat epilogues.
- **Tile Library** (sidebar): generate the game's numbered tiles (e.g. 1A–19B for *Immortal Souls*) as placeholders, set each tile's size in map squares (both sides share one size), and optionally attach scans or photos of your own tiles. Bulk image import matches files to tiles by name (`7B.jpg` → 7B). Stored in IndexedDB; export or import the library as JSON.
- **Map maker** (Map tab):
  - `L` Tiles: place game tiles, `Q` / `Shift+Q` rotates, drag to move; the map grows to fit
  - `B` Brush, `R` Room (drag a rectangle; hold Shift to wall it in), `G` Fill (stops at walls), `E` Erase
  - `W` Walls: click or drag along grid lines to place a wall, door, locked door or secret door
  - `T` Tokens: hero starts, enemies, boss, NPC, chest, portal, trap, objective, numbered event markers, key, altar, exit, pillar, area labels
  - `V` Select: drag tokens to move them, edit the label or note, `Del` to remove
  - Undo/redo (`Ctrl+Z` / `Ctrl+Shift+Z`), zoom, resize, **Auto-walls**, export as PNG
- **Quest sheet / Campaign book**: printable layout with the map, legend and map key. Use *Print → Save as PDF*.
- **Storage**: autosaves to browser localStorage. Use *Export JSON* / *Import* to back up or share campaigns.

This is an unofficial fan tool. It doesn't include any of the official game's art or text. Tile images are ones you add from your own copy, and they stay in your browser. Campaign exports include tile names and sizes but no images.
