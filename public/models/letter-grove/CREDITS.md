# Letter Grove asset manifest

All third-party models in this folder are licensed under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Attribution is not required, but the sources are recorded here so every shipped asset remains auditable.

## Characters

| Runtime file | Creator and source | Size | Approx. triangles | Used animation clips |
| --- | --- | ---: | ---: | --- |
| `hero/adventurer.glb` | Quaternius, [Adventurer](https://poly.pizza/m/5EGWBMpuXq) | 1,944,116 bytes | 10,198 | `Idle`, `Interact`, `Wave` |
| `creature/pop-blob.glb` | Quaternius, [Green Blob](https://poly.pizza/m/y4kJh8EeYS) | 74,812 bytes | 1,520 | `Idle`, `Yes`, `No`, `Dance` |

The runtime names are project-specific. The original model names and source pages above carry the CC0 declarations. Friendly encounter code intentionally does not use the blob's attack or death clips.

## Environment

Creator/source: Kenney, [Nature Kit 2.1](https://kenney.nl/assets/nature-kit), CC0 1.0.

| Runtime file | Size | Approx. triangles | Scene role |
| --- | ---: | ---: | --- |
| `nature/bridge_stoneRound.glb` | 22,552 bytes | 360 | Stream crossing |
| `nature/flower_purpleB.glb` | 8,084 bytes | 98 | Clearing detail |
| `nature/mushroom_redGroup.glb` | 14,960 bytes | 144 | Clearing detail |
| `nature/path_stoneCircle.glb` | 13,100 bytes | 164 | Rune pedestals |
| `nature/plant_bushDetailed.glb` | 10,172 bytes | 104 | Forest undergrowth |
| `nature/platform_stone.glb` | 13,632 bytes | 192 | Portal shrine |
| `nature/rock_largeB.glb` | 8,560 bytes | 85 | Forest detail |
| `nature/statue_column.glb` | 10,472 bytes | 122 | Portal shrine |
| `nature/statue_columnDamaged.glb` | 8,824 bytes | 108 | Portal shrine |
| `nature/stump_roundDetailed.glb` | 8,188 bytes | 96 | Forest detail |
| `nature/tree_default.glb` | 9,428 bytes | 114 | Forest canopy |
| `nature/tree_oak.glb` | 14,644 bytes | 196 | Forest canopy |
| `nature/tree_pineRoundA.glb` | 14,488 bytes | 204 | Forest canopy |

Total runtime model payload: 2,176,032 bytes (about 2.08 MiB), approximately 13,705 triangles. The hero contains unused bundled animations and is the first candidate for a later animation-pruning/compression pass.
