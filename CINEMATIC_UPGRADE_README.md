# SHADOWSTRIKE Cinematic Campaign Upgrade

This build adds a cinematic mission deployment/loading overlay and four additional campaign operations:
- OP-05 Black Dagger (night raid)
- OP-06 Red Harvest (golden-hour freight terminal)
- OP-07 Storm Breaker (overcast forward base)
- OP-08 Last Light (night final operation)

It preserves the existing Three.js game engine, articulated procedural enemy soldier rigs, weapon systems (including the existing SRS-99 Longbow precision rifle), missions, HUD, and graphics-quality controls.

## Deploy to Vercel
- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Root directory: repository root (or the folder containing this package.json)

## Verification status
The source changes were applied to the uploaded project. A full production build was not verified because dependency installation timed out in this environment. Please run `npm install` and `npm run build` locally or inspect Vercel Build Logs before treating the deployment as verified.

The cinematic loading sequence is an animated briefing/loading overlay, not a prerendered video cutscene. The added operations reuse the existing tested map layouts and dynamic mission generation rather than introducing external asset packs. For more realistic humans and true AAA visuals, import licensed rigged character models and animation clips, and optimize large GLB/KTX2 assets for web delivery.
