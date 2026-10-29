# SHADOWSTRIKE — Visual Surface Upgrade

## Implemented
- Replaced the stretched concrete texture used for road slabs with a dedicated generated asphalt material.
- Added subtle aggregate grain and low-contrast weathering/crack detail to the asphalt texture.
- Added separate road texture scaling for the north-south road and crossroad to reduce stretched UV appearance.
- Added faded road-edge paint and broken centre-line markings to improve scene scale and navigation cues.
- Used map-sensitive asphalt base tones for snow/mountain, desert, jungle/rural, and standard industrial environments.
- Kept these details procedural and local (no external asset downloads), so they do not add a large network dependency or inflate the deployed bundle with heavyweight textures.

## Scope / limitations
This is a focused rendering/material improvement, not a complete photorealistic asset replacement. Buildings and soldiers still use the existing procedural Three.js models. High-end character models, motion-captured animations, bespoke handcrafted maps, and external PBR texture packs would require a separate asset integration pass.

## Verification
The edited `EnvironmentBuilder.ts` passed TypeScript transpilation syntax diagnostics. A complete Vite production build and browser performance test were not run in this environment. After replacing files in the Vercel-connected GitHub repository, check the Vercel Build Logs and compare the in-game FPS and road appearance.
