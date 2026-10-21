# Owl garden assets

Original generated artwork for the English learning reward garden.

- garden.png: opaque landscape background; keep the center available for the owl and earned decorations.
- owl-sprites.png: transparent 4 × 4 sprite sheet; four frames per row.
- preview.html: standalone interactive animation preview (not yet connected to learning progress).

Rows, top to bottom: idle/blink; celebrate; hop; sleep. Columns run left to right.
Use background-size: 400% 400%; x/y offsets are 0%, 33.333333%, 66.666667%, 100%.
Do not interpolate between cells. Each sequence uses four discrete frames.
The preview supports pause and prefers-reduced-motion. A production celebration
should play briefly after earned progress, then return to idle. Sleep is an
optional calm animation, never a penalty for missing practice.

Reward persistence, earning rules, and unlockable decorations are not wired up
in this asset preview.
