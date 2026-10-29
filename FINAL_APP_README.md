# SHADOWSTRIKE — Final Combined Project Package

This package combines the current campaign/location and visual surface updates.

## Included
- 18 campaign operations (the original operations plus OP-05 through OP-18).
- Dedicated procedural environment layouts for urban, jungle, snowbound, dockyard, construction, mountain, rural, airfield, research-facility, and coastal-port locations.
- Procedural asphalt texture, subtle surface wear, and faded road markings.
- Existing weapons, HUD, controls, mission progression, and Three.js rendering pipeline.

## Run locally
Requirements: Node.js compatible with the Vite version in `package.json`.

```bash
npm install
npm run dev
```

For a production build:

```bash
npm run build
```

Vite outputs the production site to `dist/`.

## Deploy to Vercel
1. Extract this ZIP and push the project files to the GitHub repository connected to Vercel.
2. In Vercel, set Framework Preset to **Vite** (or allow auto-detection).
3. Build command: `npm run build`
4. Output directory: `dist`
5. Deploy and review the Build Logs if the deployment fails.

## Verification note
This package was assembled from the latest available project sources. A full dependency install, production build, and browser play-test could not be completed in this environment. Please verify `npm install` and `npm run build` before publishing. The added locations are procedural maps, not photorealistic handcrafted AAA levels; the existing game remains a Three.js browser FPS.
