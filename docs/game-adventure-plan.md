# Adventure game foundation

## Product shift

**Today:** answer → feedback → next question.

**Target:** explore → encounter → use English as an ability → change the world → earn a personal reward → choose the next adventure.

The curriculum remains the source of truth. Game systems never decide whether an answer is correct; they receive a small event such as `answer.correct`, `word.completed`, or `sentence.built` and turn it into a visible action.

## The first playable loop

1. Walk to an encounter on the map.
2. A friendly, non-scary creature blocks the way with a language problem.
3. Recognising a sound charges a rune; spelling a word casts a spell; ordering a sentence repairs a bridge.
4. The world reacts in under one second: a shield cracks, fog clears, or a bridge grows.
5. The child earns stars **and** one tangible item/cosmetic/material.
6. They choose either a new route or a short replay for another cosmetic chance.

No child loses progress, health, or an item for an incorrect answer. Incorrect answers create a softer retry state and the game offers an assist.

## Four launch zones

| Zone | Curriculum | Verb | Encounter | Reward family |
| --- | --- | --- | --- | --- |
| Letter Grove | letter names and sounds | charge runes | confusion fog | wands, rune badges |
| Word Cove | spelling and word building | cast | crab/sea-mist puzzles | compasses, boots, shells |
| Sentence Peaks | ordering sentences | repair | cloud gates | capes, climbing gear |
| Conversation City | chat and speaking | help | NPC quests | crowns, room decorations |

## Architecture

- `lib/curriculum/*`: content and mastery; unchanged authority.
- `lib/game-world.ts`: zone themes, encounter vocabulary, reward taxonomy.
- `components/worldlab/*`: isolated, discardable visual prototype. It is deliberately **not** wired into progress yet.
- Future `lib/game-events.ts`: typed events from lesson components to scenes.
- Future `lib/inventory.ts`: cosmetic-only inventory stored next to existing local progress.

Use the existing Three.js runtime for the first vertical slice. Add React Three Fiber only if the lab proves that many small, independently-owned scenes would be simpler declaratively; it pairs with React 19 and provides JSX scene composition and pointer events. [React Three Fiber documentation](https://r3f.docs.pmnd.rs/getting-started/introduction)

## Asset pipeline

Start with **CC0-only** assets, checked into `public/models/<pack>/` with the source URL and licence in `public/models/CREDITS.md`.

- [Kenney](https://kenney.nl/support): strongest first source for readable UI, low-poly characters, icons, and sound; official support confirms asset-page packs are CC0 and attribution is not required.
- [Quaternius](https://quaternius.com/faq.html): strong for low-poly zones, creatures, props, and animation; its FAQ says all models are CC0 and can be modified or used commercially.
- [Poly Pizza](https://poly.pizza/): use only models explicitly tagged CC0; do not mix CC-BY assets unless we add author/title/URL credit metadata to the catalogue.

**Import rule:** prefer `.glb`, keep a source `.blend` outside the served app, target under 2 MB per hero asset, combine materials, use 1K-or-smaller textures on mobile, and create a low-detail fallback. Before merging an asset, capture: source URL, creator, licence, file size, triangle count, and target zone.

## Three collaboration workflow

`/world-lab` is our shared review surface. It is intentionally safe: it shows procedural placeholders, lets us switch zones, test a spell, and preview an avatar colour without touching child progress. The next iteration should add an asset shelf that loads only vetted local `.glb` files and emits a shareable query string for a chosen zone/avatar.

## Vertical-slice milestone

Build **one 90-second Letter Grove encounter** before attempting an open world:

1. One avatar and one friendly monster.
2. Three letter-sound questions.
3. Each correct answer charges a visible rune; the third clears fog.
4. Completion grants one cosmetic wand and unlocks the next pedestal.
5. Test on phone, low-end tablet, keyboard-only, reduced-motion, and no-WebGL fallback.

This proves the feeling of the game while preserving the learning mechanics that already work.
