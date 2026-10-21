# Owl garden assets

Original generated artwork for the English learning reward garden.

- garden.png: opaque landscape background; keep the center available for the owl and earned decorations.
- owl-sprites.png: transparent 4 × 4 sprite sheet; four frames per row.
- preview.html: standalone interactive animation preview (not yet connected to learning progress).

Rows, top to bottom: idle/blink; celebrate; hop; sleep. Columns run left to right.
The source is 1254 × 1254 and the artwork does not fit an exact uniform grid.
Use the measured frame rectangles in preview.html, with four pixels of padding.
Nested SVG viewports isolate each pose without modifying the source PNG.
Each pose is horizontally centered and aligned to a shared foot baseline; hop
frames intentionally rise above it.
Do not interpolate between cells. Each sequence uses four discrete frames.
The preview supports pause and prefers-reduced-motion. A production celebration
should play briefly after earned progress, then return to idle. Sleep is an
optional calm animation, never a penalty for missing practice.

Reward persistence, earning rules, and unlockable decorations are not wired up
in this asset preview.
