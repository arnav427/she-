# SHADOWSTRIKE — Expanded Combat Locations

## Added campaign operations

The campaign now includes ten additional location-specific operations after the existing campaign missions:

- OP-09 Broken City — urban warzone
- OP-10 Green Veil — jungle valley
- OP-11 Whiteout — snowbound base
- OP-12 Deep Harbor — naval dockyard
- OP-13 Highrise — construction site
- OP-14 Stone Crown — mountain fortress
- OP-15 Last Acre — rural battlefield
- OP-16 Runway Ghost — airfield assault
- OP-17 Black Glass — research facility
- OP-18 Tidebreaker — coastal port

Each new operation has its own map identifier, mission briefing, atmosphere choice, campaign unlock dependency, and a location-specific architectural/cover layout in `EnvironmentBuilder.ts`. Snow and jungle terrain texture palettes were added so those locations are not only recolored mission titles.

## Important scope note

These are additional procedural Three.js maps built from the project's existing building/cover primitives. They are distinct layouts and terrain palettes, not photogrammetry-quality or externally sourced AAA assets. More detailed licensed GLB/GLTF assets and animation work would be a separate upgrade.

## Deploy

1. Extract this ZIP and replace the files in the GitHub repository connected to Vercel.
2. Commit and push the changes.
3. Vercel should rebuild automatically.
4. Build command: `npm run build`; output directory: `dist`.

## Verification status

A production build has not been verified in this environment because dependency installation timed out. Run `npm install`, then `npm run build` locally or inspect the Vercel build logs before relying on this update.
