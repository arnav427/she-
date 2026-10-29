import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AtmospherePresetId, MapEnvironmentId, MissionDefinition } from '../types/game';
import { CollisionWorld } from './CollisionWorld';
import {
  createContactShadowPlane,
  createPBRPhysicalMaterial,
  createPBRStandardMaterial,
  ensureGeometryUV2ForAO,
  ProceduralTextures,
} from './ProceduralModels';

export interface ExplosiveBarrelProp {
  id: string;
  mesh: THREE.Group;
  position: THREE.Vector3;
  exploded: boolean;
}

export interface EnvironmentBuildResult {
  environmentGroup: THREE.Group;
  extractionRing: THREE.Mesh;
  explosiveBarrels: ExplosiveBarrelProp[];
  keyLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
  dustParticles: THREE.Points | null;
}

interface AtmosphereConfig {
  zenithColor: string;
  horizonColor: string;
  groundBounceColor: string;
  sunColor: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  fogHex: number;
  fogDensity: number;
  sunDirection: [number, number, number];
  cloudOpacity: number;
}

const ATMOSPHERE_PRESETS: Record<AtmospherePresetId, AtmosphereConfig> = {
  clear_daylight: {
    zenithColor: '#1d4ed8',
    horizonColor: '#bae6fd',
    groundBounceColor: '#64748b',
    sunColor: 0xfffbeb,
    sunIntensity: 3.1,
    hemiSky: 0x93c5fd,
    hemiGround: 0x475569,
    hemiIntensity: 1.25,
    fogHex: 0x94a3b8,
    fogDensity: 0.0042,
    sunDirection: [42, 68, 30],
    cloudOpacity: 0.35,
  },
  golden_sunset: {
    zenithColor: '#1e1b4b',
    horizonColor: '#fb923c',
    groundBounceColor: '#451a03',
    sunColor: 0xfdba74,
    sunIntensity: 2.8,
    hemiSky: 0xfdba74,
    hemiGround: 0x3f2e21,
    hemiIntensity: 1.05,
    fogHex: 0xd97706,
    fogDensity: 0.0055,
    sunDirection: [64, 26, -35],
    cloudOpacity: 0.45,
  },
  overcast_industrial: {
    zenithColor: '#475569',
    horizonColor: '#cbd5e1',
    groundBounceColor: '#334155',
    sunColor: 0xe2e8f0,
    sunIntensity: 2.1,
    hemiSky: 0xcbd5e1,
    hemiGround: 0x334155,
    hemiIntensity: 1.35,
    fogHex: 0x94a3b8,
    fogDensity: 0.0065,
    sunDirection: [-30, 58, 25],
    cloudOpacity: 0.65,
  },
  dusty_desert: {
    zenithColor: '#0284c7',
    horizonColor: '#fde68a',
    groundBounceColor: '#78350f',
    sunColor: 0xffedd5,
    sunIntensity: 3.4,
    hemiSky: 0xfde68a,
    hemiGround: 0x78350f,
    hemiIntensity: 1.25,
    fogHex: 0xd6b485,
    fogDensity: 0.0058,
    sunDirection: [38, 65, -24],
    cloudOpacity: 0.25,
  },
  night_operation: {
    zenithColor: '#040914',
    horizonColor: '#1e293b',
    groundBounceColor: '#09101d',
    sunColor: 0x93c5fd,
    sunIntensity: 1.45,
    hemiSky: 0x3b82f6,
    hemiGround: 0x0f172a,
    hemiIntensity: 0.85,
    fogHex: 0x0f172a,
    fogDensity: 0.0075,
    sunDirection: [-35, 52, -30],
    cloudOpacity: 0.22,
  },
};

/**
 * Encodes linear floating-point RGB values `[r, g, b]` into a 4-byte Radiance RGBE `[r, g, b, e]` pixel.
 */
function floatToRGBE(r: number, g: number, b: number, out: Uint8Array, offset: number): void {
  const maxComp = Math.max(r, g, b);
  if (maxComp < 1e-32) {
    out[offset] = 0;
    out[offset + 1] = 0;
    out[offset + 2] = 0;
    out[offset + 3] = 0;
    return;
  }
  const exp = Math.ceil(Math.log2(maxComp));
  const scale = Math.pow(2, -exp) * 256.0;
  out[offset] = Math.min(255, Math.max(0, Math.floor(r * scale)));
  out[offset + 1] = Math.min(255, Math.max(0, Math.floor(g * scale)));
  out[offset + 2] = Math.min(255, Math.max(0, Math.floor(b * scale)));
  out[offset + 3] = Math.min(255, Math.max(0, exp + 128));
}

/**
 * Generates an in-memory Radiance `.hdr` (`FORMAT=32-bit_rle_rgbe`) equirectangular skybox binary Blob URL
 * matching the atmosphere preset so `RGBELoader` loads genuine HDR environment data without external 404s.
 */
function createProceduralRadianceHDRUrl(atmo: AtmosphereConfig): string {
  const width = 64;
  const height = 32;
  const header = `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`;
  const encoder = new TextEncoder();
  const headerBytes = encoder.encode(header);
  const pixelBytes = new Uint8Array(width * height * 4);

  const zenith = new THREE.Color(atmo.zenithColor);
  const horizon = new THREE.Color(atmo.horizonColor);
  const ground = new THREE.Color(atmo.groundBounceColor);
  const sunCol = new THREE.Color(atmo.sunColor);
  const sunDir = new THREE.Vector3(...atmo.sunDirection).normalize();
  const dir = new THREE.Vector3();
  const c = new THREE.Color();

  for (let y = 0; y < height; y++) {
    const v = 1.0 - (y + 0.5) / height;
    const theta = (1.0 - v) * Math.PI; // 0 at top, PI at bottom
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const phi = u * Math.PI * 2.0;

      dir.set(-sinTheta * Math.sin(phi), cosTheta, -sinTheta * Math.cos(phi)).normalize();

      if (dir.y >= 0) {
        c.copy(horizon).lerp(zenith, Math.pow(dir.y, 0.6));
      } else {
        c.copy(horizon).lerp(ground, Math.min(1.0, -dir.y * 2.5));
      }

      // Add high-dynamic-range solar radiance hotspot (up to 12.0 HDR luminance)
      const sunDot = Math.max(0, dir.dot(sunDir));
      const sunGlow = Math.pow(sunDot, 16) * 2.5 + Math.pow(sunDot, 128) * 9.5;
      const hdrR = c.r * 1.35 + sunCol.r * sunGlow;
      const hdrG = c.g * 1.35 + sunCol.g * sunGlow;
      const hdrB = c.b * 1.35 + sunCol.b * sunGlow;

      const idx = (y * width + x) * 4;
      floatToRGBE(hdrR, hdrG, hdrB, pixelBytes, idx);
    }
  }

  const combined = new Uint8Array(headerBytes.length + pixelBytes.length);
  combined.set(headerBytes, 0);
  combined.set(pixelBytes, headerBytes.length);

  const blob = new Blob([combined], { type: 'application/octet-stream' });
  return URL.createObjectURL(blob);
}

export class EnvironmentBuilder {
  public static resolveAtmospherePreset(mission: MissionDefinition): AtmospherePresetId {
    if (mission.atmosphere) return mission.atmosphere;
    switch (mission.mapId) {
      case 'training_compound':
        return 'clear_daylight';
      case 'industrial_facility':
        return 'overcast_industrial';
      case 'desert_outpost':
        return 'dusty_desert';
      case 'night_infiltration':
      case 'research_facility':
      case 'coastal_port':
        return 'night_operation';
      case 'snowbound_base':
      case 'mountain_fortress':
        return 'overcast_industrial';
      case 'urban_warzone':
      case 'construction_site':
      case 'naval_dockyard':
      case 'airfield_assault':
        return 'overcast_industrial';
      case 'jungle_valley':
      case 'rural_battlefield':
        return 'clear_daylight';
      default:
        return 'clear_daylight';
    }
  }

  /**
   * Image-Based Lighting (IBL): Loads an HDR equirectangular skybox using `RGBELoader` and
   * `PMREMGenerator`, applying it to `scene.environment` for realistic metallic reflections
   * and physically based ambient illumination.
   *
   * Supports passing a custom external `.hdr` file URL via `customHdrUrl`, or automatically
   * generates a Radiance `.hdr` skybox stream tailored to the mission's atmosphere preset.
   */
  public static loadHDREnvironment(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    presetId: AtmospherePresetId = 'clear_daylight',
    customHdrUrl?: string,
    applyAsBackground = false
  ): void {
    const atmo = ATMOSPHERE_PRESETS[presetId] || ATMOSPHERE_PRESETS.clear_daylight;

    // Immediate first-frame PMREM fallback so metallic surfaces never appear black during async HDR load
    const fallbackPmrem = new THREE.PMREMGenerator(renderer);
    const immediateEnv = fallbackPmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = immediateEnv;
    fallbackPmrem.dispose();

    const isGeneratedBlob = !customHdrUrl;
    const hdrUrl = customHdrUrl || createProceduralRadianceHDRUrl(atmo);

    const rgbeLoader = new RGBELoader();
    rgbeLoader.load(
      hdrUrl,
      (hdrTexture) => {
        hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        pmremGenerator.compileEquirectangularShader();
        const envMap = pmremGenerator.fromEquirectangular(hdrTexture).texture;

        scene.environment = envMap;
        if (applyAsBackground) {
          scene.background = envMap;
        }

        hdrTexture.dispose();
        pmremGenerator.dispose();
        if (isGeneratedBlob) {
          URL.revokeObjectURL(hdrUrl);
        }
      },
      undefined,
      () => {
        if (isGeneratedBlob) {
          URL.revokeObjectURL(hdrUrl);
        }
      }
    );
  }

  public static build(
    scene: THREE.Scene,
    collisionWorld: CollisionWorld,
    mission: MissionDefinition,
    maxAnisotropy: number,
    graphicsQuality: 'low' | 'medium' | 'high' | 'ultra' = 'high'
  ): EnvironmentBuildResult {
    collisionWorld.clear();
    const envGroup = new THREE.Group();
    envGroup.name = 'tactical_environment';

    const mapId: MapEnvironmentId = mission.mapId;
    const atmoId = this.resolveAtmospherePreset(mission);
    const atmo = ATMOSPHERE_PRESETS[atmoId];
    const explosiveBarrels: ExplosiveBarrelProp[] = [];

    scene.background = new THREE.Color(atmo.fogHex);
    scene.fog = new THREE.FogExp2(atmo.fogHex, atmo.fogDensity);

    // 1. Procedural Sky Dome with Horizon Gradient, Sun Disc, and Multi-Octave Cloud Layer
    const skySunDir = new THREE.Vector3(...atmo.sunDirection).normalize();
    const skyGeo = new THREE.SphereGeometry(235, 32, 20);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uZenithColor: { value: new THREE.Color(atmo.zenithColor) },
        uHorizonColor: { value: new THREE.Color(atmo.horizonColor) },
        uGroundColor: { value: new THREE.Color(atmo.groundBounceColor) },
        uSunDir: { value: skySunDir },
        uSunColor: { value: new THREE.Color(atmo.sunColor) },
        uCloudOpacity: { value: atmo.cloudOpacity },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPos;
        uniform vec3 uZenithColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uGroundColor;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform float uCloudOpacity;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        void main() {
          vec3 dir = normalize(vWorldPos);
          float y = dir.y;
          vec3 skyCol = mix(uHorizonColor, uZenithColor, pow(clamp(y, 0.0, 1.0), 0.56));
          if (y < 0.0) {
            skyCol = mix(uHorizonColor, uGroundColor, clamp(-y * 3.0, 0.0, 1.0));
          }

          // Multi-octave stratocumulus clouds with solar silver-lining
          if (y > 0.04) {
            vec2 uv = dir.xz / (dir.y + 0.16) * 2.1;
            float n = noise(uv) * 0.58 + noise(uv * 2.4) * 0.28 + noise(uv * 5.2) * 0.14;
            float cloudMask = smoothstep(0.46, 0.78, n) * smoothstep(0.04, 0.24, y);
            float sunLit = pow(max(dot(dir, uSunDir), 0.0), 4.0);
            vec3 cloudCol = mix(uHorizonColor, vec3(0.97, 0.98, 1.0), 0.65) + uSunColor * sunLit * 0.22;
            skyCol = mix(skyCol, cloudCol, cloudMask * uCloudOpacity);
          }

          // Solar / Lunar disc & atmospheric mie scattering halo
          float sunAmt = max(dot(dir, uSunDir), 0.0);
          skyCol += uSunColor * pow(sunAmt, 14.0) * 0.34;
          skyCol += uSunColor * smoothstep(0.996, 0.9992, sunAmt) * 1.45;

          gl_FragColor = vec4(skyCol, 1.0);
        }
      `,
    });
    const skyDome = new THREE.Mesh(skyGeo, skyMat);
    envGroup.add(skyDome);

    // 2. Physically Plausible 3-Point Lighting Rig & High-Resolution PCFSoftShadowMap Sun Light
    const hemiLight = new THREE.HemisphereLight(
      atmo.hemiSky,
      atmo.hemiGround,
      atmo.hemiIntensity
    );
    hemiLight.position.set(0, 60, 0);
    envGroup.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(atmo.sunColor, atmo.sunIntensity);
    keyLight.position.set(...atmo.sunDirection);
    keyLight.target.position.set(0, 0, 0);
    envGroup.add(keyLight.target);

    keyLight.castShadow = graphicsQuality !== 'low';
    const shadowRes =
      graphicsQuality === 'ultra' ? 4096 : graphicsQuality === 'high' ? 2048 : 1024;
    keyLight.shadow.mapSize.set(shadowRes, shadowRes);

    // Tight orthographic shadow frustum covering the tactical compound bounds
    const d = 56;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 165;
    keyLight.shadow.radius = 3.5; // Soft penumbra filtering for PCFSoftShadowMap
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.normalBias = 0.02;
    envGroup.add(keyLight);

    const fillLight = new THREE.DirectionalLight(atmo.hemiSky, 0.65);
    fillLight.position.set(-atmo.sunDirection[0], 28, -atmo.sunDirection[2]);
    envGroup.add(fillLight);

    // 3. Realistic Multi-Material Ground Terrain + Concrete Compound Roads with Albedo, Normal, Roughness & AO Maps
    const terrainTheme: 'temperate' | 'industrial' | 'desert' | 'night' | 'snow' | 'jungle' =
      mapId === 'desert_outpost'
        ? 'desert'
        : mapId === 'snowbound_base' || mapId === 'mountain_fortress'
          ? 'snow'
          : mapId === 'jungle_valley'
            ? 'jungle'
            : mapId === 'industrial_facility' || mapId === 'urban_warzone' || mapId === 'construction_site' || mapId === 'naval_dockyard' || mapId === 'airfield_assault' || mapId === 'coastal_port'
              ? 'industrial'
              : mapId === 'night_infiltration' || mapId === 'research_facility'
                ? 'night'
                : 'temperate';
    const groundTex = ProceduralTextures.getRealisticTerrainTexture(terrainTheme, maxAnisotropy);
    groundTex.repeat.set(36, 36);

    const concreteBump = ProceduralTextures.getSurfaceBumpTexture('concrete', maxAnisotropy);
    concreteBump.repeat.set(36, 36);
    const concreteNormal = ProceduralTextures.getSurfaceNormalTexture('concrete', maxAnisotropy);
    concreteNormal.repeat.set(36, 36);
    const terrainAO = ProceduralTextures.getSurfaceAOTexture('terrain', maxAnisotropy);

    const groundMat = createPBRStandardMaterial({
      albedoMap: groundTex,
      normalMap: concreteNormal,
      normalScale: 0.65,
      roughnessMap: concreteBump,
      roughness: 0.92,
      metalness: 0.04,
      aoMap: terrainAO,
      aoMapIntensity: 0.5,
    });
    const groundMesh = new THREE.Mesh(
      ensureGeometryUV2ForAO(new THREE.PlaneGeometry(320, 320)),
      groundMat
    );
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    envGroup.add(groundMesh);

    // Shared PBR Architectural Materials with Albedo, Normal, Roughness & Ambient Occlusion Maps
    const wallBump = ProceduralTextures.getSurfaceBumpTexture('concrete', maxAnisotropy);
    wallBump.repeat.set(2, 1);
    const wallNormal = ProceduralTextures.getSurfaceNormalTexture('concrete', maxAnisotropy);
    wallNormal.repeat.set(2, 1);
    const metalBump = ProceduralTextures.getSurfaceBumpTexture('metal', maxAnisotropy);
    metalBump.repeat.set(2, 1);
    const metalNormal = ProceduralTextures.getSurfaceNormalTexture('metal', maxAnisotropy);
    metalNormal.repeat.set(2, 1);
    const archAO = ProceduralTextures.getSurfaceAOTexture('architectural', maxAnisotropy);
    const propAO = ProceduralTextures.getSurfaceAOTexture('prop', maxAnisotropy);

    const concreteTex = ProceduralTextures.getWeatheredConcreteTexture(
      mapId === 'desert_outpost' ? '#9a7b56' : mapId === 'snowbound_base' || mapId === 'mountain_fortress' ? '#aeb8c2' : mapId === 'jungle_valley' || mapId === 'rural_battlefield' ? '#52634a' : '#64748b',
      mapId === 'desert_outpost' ? '#6b4f32' : mapId === 'snowbound_base' || mapId === 'mountain_fortress' ? '#64717d' : mapId === 'jungle_valley' || mapId === 'rural_battlefield' ? '#293c2b' : '#334155',
      maxAnisotropy
    );
    concreteTex.repeat.set(2, 1);

    const concreteWallMat = createPBRStandardMaterial({
      albedoMap: concreteTex,
      normalMap: wallNormal,
      normalScale: 0.75,
      roughnessMap: wallBump,
      roughness: 0.85,
      metalness: 0.08,
      aoMap: archAO,
      aoMapIntensity: 0.75,
    });

    const metalSidingTex = ProceduralTextures.getCorrugatedMetalTexture(
      mapId === 'industrial_facility'
        ? '#334155'
        : mapId === 'desert_outpost'
          ? '#78350f'
          : '#3f4756',
      maxAnisotropy
    );
    metalSidingTex.repeat.set(2, 1);

    const metalSidingMat = createPBRPhysicalMaterial({
      albedoMap: metalSidingTex,
      normalMap: metalNormal,
      normalScale: 0.65,
      roughnessMap: metalBump,
      roughness: 0.48,
      metalness: 0.68,
      aoMap: archAO,
      aoMapIntensity: 0.7,
      clearcoat: 0.2,
      clearcoatRoughness: 0.35,
      anisotropy: 0.4,
    });

    const darkSteelMat = createPBRPhysicalMaterial({
      color: 0x1e293b,
      normalMap: metalNormal,
      normalScale: 0.45,
      roughnessMap: metalBump,
      roughness: 0.34,
      metalness: 0.85,
      aoMap: propAO,
      aoMapIntensity: 0.6,
      anisotropy: 0.6,
    });

    const glassWindowMat = createPBRPhysicalMaterial({
      color: atmoId === 'night_operation' ? 0x38bdf8 : 0x0f172a,
      emissive: atmoId === 'night_operation' ? 0x0284c7 : 0x000000,
      emissiveIntensity: atmoId === 'night_operation' ? 0.55 : 0,
      roughness: 0.08,
      metalness: 0.2,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      ior: 1.52,
      reflectivity: 0.92,
    });

    const hescoTex = ProceduralTextures.getSandbagTexture(maxAnisotropy);
    const hescoMat = createPBRStandardMaterial({
      albedoMap: hescoTex,
      normalMap: wallNormal,
      normalScale: 0.7,
      roughnessMap: wallBump,
      roughness: 0.88,
      metalness: 0.12,
      aoMap: propAO,
      aoMapIntensity: 0.7,
    });

    const crateTex = ProceduralTextures.getCratePanelTexture(
      mapId === 'desert_outpost' ? '#713f12' : '#365314',
      '#f59e0b'
    );
    const crateMat = createPBRStandardMaterial({
      albedoMap: crateTex,
      normalMap: metalNormal,
      normalScale: 0.5,
      roughnessMap: metalBump,
      roughness: 0.62,
      metalness: 0.28,
      aoMap: propAO,
      aoMapIntensity: 0.65,
    });

    // Weathered asphalt roads. Use dedicated asphalt texture instead of stretching
    // the concrete wall atlas over a box (the old mapping produced blue streaks).
    const asphaltCanvas = document.createElement('canvas');
    asphaltCanvas.width = 512;
    asphaltCanvas.height = 512;
    const asphaltCtx = asphaltCanvas.getContext('2d')!;
    const asphaltBase = mapId === 'snowbound_base' || mapId === 'mountain_fortress'
      ? '#555e66'
      : mapId === 'desert_outpost'
        ? '#514538'
        : mapId === 'jungle_valley' || mapId === 'rural_battlefield'
          ? '#393d32'
          : '#292d31';
    asphaltCtx.fillStyle = asphaltBase;
    asphaltCtx.fillRect(0, 0, 512, 512);
    // Fine aggregate and subtle broad wear, kept deliberately low contrast.
    for (let i = 0; i < 11500; i++) {
      const shade = 32 + Math.floor(Math.random() * 54);
      asphaltCtx.fillStyle = `rgba(${shade},${shade},${shade},${0.08 + Math.random() * 0.16})`;
      const size = Math.random() < 0.88 ? 1 : 2;
      asphaltCtx.fillRect(Math.random() * 512, Math.random() * 512, size, size);
    }
    asphaltCtx.globalAlpha = 0.18;
    asphaltCtx.strokeStyle = '#0c0d0e';
    asphaltCtx.lineWidth = 1;
    for (let i = 0; i < 22; i++) {
      let x = Math.random() * 512;
      let y = Math.random() * 512;
      asphaltCtx.beginPath();
      asphaltCtx.moveTo(x, y);
      for (let j = 0; j < 5; j++) {
        x += (Math.random() - 0.5) * 28;
        y += (Math.random() - 0.5) * 28;
        asphaltCtx.lineTo(x, y);
      }
      asphaltCtx.stroke();
    }
    asphaltCtx.globalAlpha = 1;
    const asphaltTexture = new THREE.CanvasTexture(asphaltCanvas);
    asphaltTexture.colorSpace = THREE.SRGBColorSpace;
    asphaltTexture.wrapS = THREE.RepeatWrapping;
    asphaltTexture.wrapT = THREE.RepeatWrapping;
    asphaltTexture.repeat.set(2, 16);
    asphaltTexture.anisotropy = maxAnisotropy;
    const roadSlabMat = new THREE.MeshStandardMaterial({
      map: asphaltTexture,
      color: 0xffffff,
      roughness: 0.94,
      metalness: 0.015,
    });
    const mainRoad = new THREE.Mesh(
      new THREE.PlaneGeometry(10.5, 84),
      roadSlabMat
    );
    mainRoad.rotation.x = -Math.PI / 2;
    mainRoad.position.set(0, 0.035, 0);
    mainRoad.receiveShadow = true;
    envGroup.add(mainRoad);

    const crossTexture = asphaltTexture.clone();
    crossTexture.repeat.set(14, 2);
    crossTexture.needsUpdate = true;
    const crossRoad = new THREE.Mesh(
      new THREE.PlaneGeometry(68, 8.5),
      new THREE.MeshStandardMaterial({ map: crossTexture, roughness: 0.94, metalness: 0.015 })
    );
    crossRoad.rotation.x = -Math.PI / 2;
    crossRoad.position.set(0, 0.038, 0);
    crossRoad.receiveShadow = true;
    envGroup.add(crossRoad);

    // Faded road-edge paint and broken centre markings add scale cues without
    // introducing a heavy post-processing cost.
    const edgePaintMat = new THREE.MeshStandardMaterial({ color: 0xb8b6a6, roughness: 0.9 });
    const centrePaintMat = new THREE.MeshStandardMaterial({ color: 0xd4bd76, roughness: 0.88 });
    for (const x of [-5.05, 5.05]) {
      const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 82), edgePaintMat);
      edge.rotation.x = -Math.PI / 2;
      edge.position.set(x, 0.047, 0);
      envGroup.add(edge);
    }
    for (let z = -37; z <= 37; z += 7) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 3.2), centrePaintMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(0, 0.049, z);
      envGroup.add(dash);
    }

    // Helper: Detailed Multi-Part Architectural Building with Windows, Doors, Pilasters, Roof Overhang & HVAC
    const addArchitecturalBuilding = (
      id: string,
      cx: number,
      cz: number,
      sx: number,
      sy: number,
      sz: number,
      style: 'concrete_bunker' | 'corrugated_hall' | 'shipping_container' = 'concrete_bunker'
    ) => {
      const group = new THREE.Group();
      group.position.set(cx, 0, cz);

      const primaryMat = style === 'concrete_bunker' ? concreteWallMat : metalSidingMat;

      // Ground contact shadow plane under building footprint
      group.add(createContactShadowPlane(sx + 1.8, sz + 1.8));

      // Foundation concrete plinth
      const plinth = new THREE.Mesh(
        ensureGeometryUV2ForAO(new THREE.BoxGeometry(sx + 0.28, 0.34, sz + 0.28)),
        concreteWallMat
      );
      plinth.position.y = 0.17;
      plinth.castShadow = true;
      plinth.receiveShadow = true;
      group.add(plinth);

      // Main structural volume
      const core = new THREE.Mesh(
        ensureGeometryUV2ForAO(new THREE.BoxGeometry(sx, sy, sz)),
        primaryMat
      );
      core.position.y = sy / 2;
      core.castShadow = true;
      core.receiveShadow = true;
      group.add(core);

      // Corner structural steel pilasters / buttress columns for architectural depth
      if (sx >= 3.2 && sz >= 3.2) {
        const colGeo = ensureGeometryUV2ForAO(new THREE.BoxGeometry(0.28, sy + 0.04, 0.28));
        [
          [-sx / 2, -sz / 2],
          [sx / 2, -sz / 2],
          [-sx / 2, sz / 2],
          [sx / 2, sz / 2],
        ].forEach(([px, pz]) => {
          const pilaster = new THREE.Mesh(colGeo, darkSteelMat);
          pilaster.position.set(px, sy / 2, pz);
          pilaster.castShadow = true;
          pilaster.receiveShadow = true;
          group.add(pilaster);
        });
      }

      // Upper corrugated cladding band on tall concrete buildings
      if (style === 'concrete_bunker' && sy >= 3.6) {
        const upperBand = new THREE.Mesh(
          ensureGeometryUV2ForAO(new THREE.BoxGeometry(sx + 0.08, sy * 0.36, sz + 0.08)),
          metalSidingMat
        );
        upperBand.position.y = sy * 0.78;
        upperBand.castShadow = true;
        upperBand.receiveShadow = true;
        group.add(upperBand);
      }

      // Roof Parapet Overhang & Trim
      const roofCap = new THREE.Mesh(
        ensureGeometryUV2ForAO(new THREE.BoxGeometry(sx + 0.38, 0.26, sz + 0.38)),
        darkSteelMat
      );
      roofCap.position.y = sy + 0.13;
      roofCap.castShadow = true;
      roofCap.receiveShadow = true;
      group.add(roofCap);

      // Architectural Details for larger buildings (Doors, Window Frames, Rooftop HVAC, Pipes & Antennas)
      if (sx >= 5.5 || sz >= 5.5) {
        const doorW = Math.min(1.6, sx * 0.35);
        const doorH = Math.min(2.3, sy * 0.65);
        const doorFrame = new THREE.Mesh(
          ensureGeometryUV2ForAO(new THREE.BoxGeometry(doorW + 0.18, doorH + 0.12, 0.16)),
          darkSteelMat
        );
        doorFrame.position.set(0, doorH / 2 + 0.15, sz / 2 + 0.04);
        doorFrame.castShadow = true;
        doorFrame.receiveShadow = true;
        group.add(doorFrame);

        if (sx >= 6.5 && sy >= 3.2) {
          [-sx * 0.28, sx * 0.28].forEach((wx) => {
            const winFrame = new THREE.Mesh(
              ensureGeometryUV2ForAO(new THREE.BoxGeometry(1.34, 0.88, sz + 0.14)),
              darkSteelMat
            );
            winFrame.position.set(wx, sy * 0.62, 0);
            winFrame.castShadow = true;
            winFrame.receiveShadow = true;
            const winGlass = new THREE.Mesh(
              new THREE.BoxGeometry(1.14, 0.68, sz + 0.18),
              glassWindowMat
            );
            winGlass.position.set(wx, sy * 0.62, 0);
            const winSill = new THREE.Mesh(
              ensureGeometryUV2ForAO(new THREE.BoxGeometry(1.46, 0.1, sz + 0.24)),
              concreteWallMat
            );
            winSill.position.set(wx, sy * 0.62 - 0.46, 0);
            winSill.castShadow = true;
            winSill.receiveShadow = true;
            group.add(winFrame, winGlass, winSill);
          });
        }

        // Rooftop HVAC Ventilation Unit & Communications Mast
        const hvac = new THREE.Mesh(
          ensureGeometryUV2ForAO(
            new THREE.BoxGeometry(Math.min(1.8, sx * 0.35), 0.78, Math.min(1.4, sz * 0.35))
          ),
          darkSteelMat
        );
        hvac.position.set(sx * 0.2, sy + 0.62, -sz * 0.15);
        hvac.castShadow = true;
        hvac.receiveShadow = true;
        group.add(hvac);

        const roofAntenna = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.05, 2.4, 8),
          darkSteelMat
        );
        roofAntenna.position.set(-sx * 0.25, sy + 1.35, sz * 0.2);
        roofAntenna.castShadow = true;
        group.add(roofAntenna);

        // Exterior warning/security wall fixture above door (PBR Emissive Standard Material)
        const fixtureGlowColor = atmoId === 'night_operation' ? 0x38bdf8 : 0xfef08a;
        const fixture = new THREE.Mesh(
          new THREE.BoxGeometry(0.38, 0.16, 0.22),
          createPBRStandardMaterial({
            color: fixtureGlowColor,
            emissive: fixtureGlowColor,
            emissiveIntensity: 1.65,
            roughness: 0.2,
            metalness: 0.2,
          })
        );
        fixture.position.set(0, doorH + 0.45, sz / 2 + 0.08);
        group.add(fixture);
      }

      envGroup.add(group);
      collisionWorld.addBox(id, cx, sy / 2, cz, sx, sy, sz, {
        isCover: false,
        blocksVision: sy >= 1.15,
        surfaceType: style === 'concrete_bunker' ? 'concrete' : 'metal',
      });
    };

    // Helper: Tactical Cover (HESCO Bastions, Sandbag Emplacements & Military Supply Crates)
    const addTacticalCover = (
      id: string,
      cx: number,
      cz: number,
      sx: number,
      sy: number,
      sz: number,
      coverStyle: 'hesco' | 'crate' | 'jersey_barrier' = 'hesco'
    ) => {
      const group = new THREE.Group();
      group.position.set(cx, 0, cz);
      group.add(createContactShadowPlane(sx + 0.9, sz + 0.9));

      if (coverStyle === 'jersey_barrier') {
        const base = new THREE.Mesh(
          ensureGeometryUV2ForAO(new THREE.BoxGeometry(sx, sy * 0.45, sz * 1.15)),
          concreteWallMat
        );
        base.position.y = sy * 0.225;
        const upper = new THREE.Mesh(
          ensureGeometryUV2ForAO(new THREE.BoxGeometry(sx * 0.96, sy * 0.55, sz * 0.65)),
          concreteWallMat
        );
        upper.position.y = sy * 0.725;
        base.castShadow = true;
        base.receiveShadow = true;
        upper.castShadow = true;
        upper.receiveShadow = true;
        group.add(base, upper);
      } else {
        const mat = coverStyle === 'hesco' ? hescoMat : crateMat;
        const core = new THREE.Mesh(
          ensureGeometryUV2ForAO(new THREE.BoxGeometry(sx, sy, sz)),
          mat
        );
        core.position.y = sy / 2;
        core.castShadow = true;
        core.receiveShadow = true;
        group.add(core);

        const rim = new THREE.Mesh(
          ensureGeometryUV2ForAO(new THREE.BoxGeometry(sx + 0.08, 0.12, sz + 0.08)),
          darkSteelMat
        );
        rim.position.y = sy + 0.02;
        rim.castShadow = true;
        rim.receiveShadow = true;
        group.add(rim);
      }

      envGroup.add(group);
      collisionWorld.addBox(id, cx, sy / 2, cz, sx, sy, sz, {
        isCover: true,
        blocksVision: sy >= 1.15,
        surfaceType:
          coverStyle === 'crate'
            ? 'wood'
            : coverStyle === 'jersey_barrier'
              ? 'concrete'
              : 'dirt',
      });
    };

    // Helper: 6x6 Tactical Military Truck Prop
    const addMilitaryTruck = (id: string, cx: number, cz: number, rotY = 0) => {
      const truck = new THREE.Group();
      truck.position.set(cx, 0, cz);
      truck.rotation.y = rotY;
      truck.add(createContactShadowPlane(3.6, 7.6));

      const oliveMat = createPBRPhysicalMaterial({
        color: mapId === 'desert_outpost' ? 0x856846 : 0x364428,
        normalMap: metalNormal,
        normalScale: 0.45,
        roughnessMap: metalBump,
        roughness: 0.58,
        metalness: 0.42,
        aoMap: propAO,
        aoMapIntensity: 0.65,
        clearcoat: 0.35,
        clearcoatRoughness: 0.28,
      });
      const tireMat = createPBRStandardMaterial({
        color: 0x171717,
        normalMap: wallNormal,
        normalScale: 0.5,
        roughness: 0.9,
        metalness: 0.1,
      });

      const chassis = new THREE.Mesh(
        ensureGeometryUV2ForAO(new THREE.BoxGeometry(2.5, 0.5, 6.6)),
        darkSteelMat
      );
      chassis.position.set(0, 0.75, 0);
      chassis.castShadow = true;
      chassis.receiveShadow = true;
      truck.add(chassis);

      const cab = new THREE.Mesh(
        ensureGeometryUV2ForAO(new THREE.BoxGeometry(2.45, 1.55, 2.1)),
        oliveMat
      );
      cab.position.set(0, 1.75, 2.1);
      cab.castShadow = true;
      cab.receiveShadow = true;
      truck.add(cab);

      const bumper = new THREE.Mesh(
        ensureGeometryUV2ForAO(new THREE.BoxGeometry(2.55, 0.34, 0.28)),
        darkSteelMat
      );
      bumper.position.set(0, 0.85, 3.25);
      bumper.castShadow = true;
      bumper.receiveShadow = true;
      truck.add(bumper);

      const windshield = new THREE.Mesh(
        new THREE.BoxGeometry(2.15, 0.65, 0.1),
        glassWindowMat
      );
      windshield.position.set(0, 2.05, 3.16);
      truck.add(windshield);

      const canopy = new THREE.Mesh(
        ensureGeometryUV2ForAO(new THREE.BoxGeometry(2.5, 1.85, 4.1)),
        hescoMat
      );
      canopy.position.set(0, 1.9, -1.1);
      canopy.castShadow = true;
      canopy.receiveShadow = true;
      truck.add(canopy);

      const wheelGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.38, 16);
      wheelGeo.rotateZ(Math.PI / 2);
      [
        [-1.25, 2.1],
        [1.25, 2.1],
        [-1.25, -0.6],
        [1.25, -0.6],
        [-1.25, -2.1],
        [1.25, -2.1],
      ].forEach(([wx, wz]) => {
        const wheel = new THREE.Mesh(wheelGeo, tireMat);
        wheel.position.set(wx, 0.52, wz);
        wheel.castShadow = true;
        wheel.receiveShadow = true;
        truck.add(wheel);
      });

      envGroup.add(truck);
      const isRotated = Math.abs(Math.sin(rotY)) > 0.7;
      const bx = isRotated ? 6.6 : 2.6;
      const bz = isRotated ? 2.6 : 6.6;
      collisionWorld.addBox(id, cx, 1.4, cz, bx, 2.8, bz, {
        isCover: true,
        blocksVision: true,
        surfaceType: 'metal',
      });
    };

    // Helper: Destructible Explosive Red Fuel Barrel
    const addExplosiveBarrel = (id: string, cx: number, cz: number) => {
      const barrelGroup = new THREE.Group();
      barrelGroup.position.set(cx, 0, cz);
      barrelGroup.add(createContactShadowPlane(1.05, 1.05));

      const barrelMat = createPBRPhysicalMaterial({
        color: 0xdc2626,
        normalMap: metalNormal,
        normalScale: 0.45,
        roughnessMap: metalBump,
        roughness: 0.38,
        metalness: 0.68,
        aoMap: propAO,
        aoMapIntensity: 0.6,
        clearcoat: 0.45,
        clearcoatRoughness: 0.22,
      });
      const stripeMat = createPBRStandardMaterial({
        color: 0xfacc15,
        normalMap: metalNormal,
        normalScale: 0.3,
        roughness: 0.48,
        metalness: 0.32,
      });

      const cyl = new THREE.Mesh(
        ensureGeometryUV2ForAO(new THREE.CylinderGeometry(0.34, 0.34, 1.05, 16)),
        barrelMat
      );
      cyl.position.y = 0.525;
      cyl.castShadow = true;
      cyl.receiveShadow = true;

      const band = new THREE.Mesh(
        ensureGeometryUV2ForAO(new THREE.CylinderGeometry(0.35, 0.35, 0.16, 16)),
        stripeMat
      );
      band.position.y = 0.62;
      band.castShadow = true;
      band.receiveShadow = true;
      barrelGroup.add(cyl, band);

      envGroup.add(barrelGroup);
      collisionWorld.addBox(id, cx, 0.525, cz, 0.72, 1.05, 0.72, {
        isCover: false,
        blocksVision: false,
        surfaceType: 'explosive_barrel',
      });

      explosiveBarrels.push({
        id,
        mesh: barrelGroup,
        position: new THREE.Vector3(cx, 0.55, cz),
        exploded: false,
      });
    };

    // 4. Perimeter Security Compound Walls, Utility Poles & Watchtowers
    addArchitecturalBuilding('perim_north_w', -26, -46, 40, 3.8, 1.6, 'concrete_bunker');
    addArchitecturalBuilding('perim_north_e', 26, -46, 40, 3.8, 1.6, 'concrete_bunker');
    addArchitecturalBuilding('perim_north_gate', 0, -46, 14, 2.8, 1.4, 'corrugated_hall');

    addArchitecturalBuilding('perim_south_w', -26, 46, 40, 3.8, 1.6, 'concrete_bunker');
    addArchitecturalBuilding('perim_south_e', 26, 46, 40, 3.8, 1.6, 'concrete_bunker');
    addArchitecturalBuilding('perim_south_gate', 0, 46, 14, 2.8, 1.4, 'corrugated_hall');

    addArchitecturalBuilding('perim_west', -46, 0, 1.6, 3.8, 92, 'concrete_bunker');
    addArchitecturalBuilding('perim_east', 46, 0, 1.6, 3.8, 92, 'concrete_bunker');

    // 4 Corner Guard Watchtowers with Searchlight Housings & Lattice Legs
    const towerCoords = [
      [-43, -43],
      [43, -43],
      [-43, 43],
      [43, 43],
    ];
    towerCoords.forEach(([tx, tz], idx) => {
      const tower = new THREE.Group();
      tower.position.set(tx, 0, tz);
      tower.add(createContactShadowPlane(6.2, 6.2));
      const base = new THREE.Mesh(
        ensureGeometryUV2ForAO(new THREE.BoxGeometry(4.2, 7.2, 4.2)),
        concreteWallMat
      );
      base.position.y = 3.6;
      base.castShadow = true;
      base.receiveShadow = true;
      const cabin = new THREE.Mesh(
        ensureGeometryUV2ForAO(new THREE.BoxGeometry(5.2, 2.4, 5.2)),
        metalSidingMat
      );
      cabin.position.y = 8.2;
      cabin.castShadow = true;
      cabin.receiveShadow = true;
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(4.4, 1.8, 4),
        darkSteelMat
      );
      roof.position.y = 10.3;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      roof.receiveShadow = true;
      tower.add(base, cabin, roof);
      envGroup.add(tower);
      collisionWorld.addBox(`watchtower_${idx}`, tx, 4.5, tz, 4.4, 9.0, 4.4, {
        isCover: false,
        blocksVision: true,
        surfaceType: 'concrete',
      });
    });

    // Utility Poles & Overhead Power Cables along the compound perimeter road
    const poleCoords: Array<[number, number]> = [
      [-34, 34],
      [-34, 0],
      [-34, -34],
      [34, 34],
      [34, 0],
      [34, -34],
    ];
    const barkNormal = ProceduralTextures.getSurfaceNormalTexture('bark', maxAnisotropy);
    const barkBump = ProceduralTextures.getSurfaceBumpTexture('bark', maxAnisotropy);
    const poleMat = createPBRStandardMaterial({
      color: 0x3e2c1e,
      normalMap: barkNormal,
      normalScale: 0.6,
      roughnessMap: barkBump,
      roughness: 0.9,
      metalness: 0.05,
    });
    poleCoords.forEach(([px, pz]) => {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.2, 7.8, 8),
        poleMat
      );
      pole.position.set(px, 3.9, pz);
      pole.castShadow = true;
      pole.receiveShadow = true;
      const crossArm = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.14, 0.14),
        darkSteelMat
      );
      crossArm.position.set(px, 7.4, pz);
      crossArm.castShadow = true;
      envGroup.add(pole, crossArm);
    });

    // 5. Realistic Multi-Tiered Pine Trees, Rocks & Ground Vegetation (InstancedMesh)
    const boulderGeo = ensureGeometryUV2ForAO(new THREE.DodecahedronGeometry(3.5, 1));
    const boulderMat = createPBRStandardMaterial({
      color: mapId === 'desert_outpost' ? 0x92400e : 0x475569,
      normalMap: wallNormal,
      normalScale: 0.85,
      roughnessMap: wallBump,
      roughness: 0.92,
      metalness: 0.05,
      aoMap: propAO,
      aoMapIntensity: 0.65,
    });
    const boulderCount = 56;
    const boulderInst = new THREE.InstancedMesh(boulderGeo, boulderMat, boulderCount);
    boulderInst.castShadow = true;
    boulderInst.receiveShadow = true;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < boulderCount; i++) {
      const angle = (i / boulderCount) * Math.PI * 2;
      const dist = 54 + (i % 5) * 11;
      dummy.position.set(Math.cos(angle) * dist, 1.35, Math.sin(angle) * dist);
      dummy.rotation.set(i * 0.5, i * 1.1, 0);
      const s = 0.85 + (i % 4) * 0.45;
      dummy.scale.set(s * 1.3, s * 0.9, s);
      dummy.updateMatrix();
      boulderInst.setMatrixAt(i, dummy.matrix);
    }
    boulderInst.instanceMatrix.needsUpdate = true;
    boulderInst.computeBoundingSphere();
    envGroup.add(boulderInst);

    // Multi-Tiered Layered Pine Trees (Trunk + 3 Distinct Overlapping Bough Tiers + Color Tint Variation)
    if (graphicsQuality !== 'low') {
      const treeCount = graphicsQuality === 'ultra' ? 96 : 78;

      const trunkGeo = ensureGeometryUV2ForAO(new THREE.CylinderGeometry(0.16, 0.38, 3.8, 8));
      const trunkMat = createPBRStandardMaterial({
        color: 0x462e1e,
        normalMap: barkNormal,
        normalScale: 0.75,
        roughnessMap: barkBump,
        roughness: 0.92,
        metalness: 0.03,
        aoMap: propAO,
        aoMapIntensity: 0.55,
      });

      // 3 distinct layered pine bough silhouettes instead of a single cone
      const tier1Geo = ensureGeometryUV2ForAO(new THREE.ConeGeometry(2.65, 3.2, 9));
      const tier2Geo = ensureGeometryUV2ForAO(new THREE.ConeGeometry(2.05, 2.9, 9));
      const tier3Geo = ensureGeometryUV2ForAO(new THREE.ConeGeometry(1.35, 2.6, 8));

      const foliageMat = createPBRStandardMaterial({
        color: 0xffffff,
        normalMap: barkNormal,
        normalScale: 0.45,
        roughnessMap: barkBump,
        roughness: 0.86,
        metalness: 0.02,
        aoMap: propAO,
        aoMapIntensity: 0.5,
      });

      const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
      const tier1Inst = new THREE.InstancedMesh(tier1Geo, foliageMat, treeCount);
      const tier2Inst = new THREE.InstancedMesh(tier2Geo, foliageMat, treeCount);
      const tier3Inst = new THREE.InstancedMesh(tier3Geo, foliageMat, treeCount);

      trunkInst.castShadow = true;
      trunkInst.receiveShadow = true;
      tier1Inst.castShadow = true;
      tier1Inst.receiveShadow = true;
      tier2Inst.castShadow = true;
      tier2Inst.receiveShadow = true;
      tier3Inst.castShadow = true;
      tier3Inst.receiveShadow = true;

      const basePalette =
        mapId === 'desert_outpost'
          ? [0x5c682e, 0x6b7436, 0x4f5b25, 0x767c42]
          : mapId === 'night_infiltration'
            ? [0x152e1e, 0x1b3824, 0x112418, 0x203f29]
            : [0x264425, 0x2f522c, 0x1e381e, 0x385c32];
      const instanceColor = new THREE.Color();

      for (let i = 0; i < treeCount; i++) {
        const angle = (i / treeCount) * Math.PI * 2 + (i % 3) * 0.07;
        const dist = 49 + (i % 7) * 7.5;
        const tx = Math.cos(angle) * dist;
        const tz = Math.sin(angle) * dist;
        const scaleXZ = 0.82 + (i % 5) * 0.22;
        const scaleY = 0.85 + ((i * 3) % 5) * 0.26;
        const tiltX = ((i % 3) - 1) * 0.03;
        const tiltZ = (((i + 1) % 3) - 1) * 0.03;

        dummy.position.set(tx, 1.8 * scaleY, tz);
        dummy.rotation.set(tiltX, i * 0.7, tiltZ);
        dummy.scale.set(scaleXZ, scaleY, scaleXZ);
        dummy.updateMatrix();
        trunkInst.setMatrixAt(i, dummy.matrix);

        // Lower bough skirt
        dummy.position.set(tx, 3.2 * scaleY, tz);
        dummy.rotation.set(tiltX, i * 1.1, tiltZ);
        dummy.scale.set(scaleXZ * 1.05, scaleY, scaleXZ * 1.05);
        dummy.updateMatrix();
        tier1Inst.setMatrixAt(i, dummy.matrix);

        // Middle bough canopy
        dummy.position.set(tx, 4.9 * scaleY, tz);
        dummy.rotation.set(tiltX, i * 1.7 + 0.4, tiltZ);
        dummy.scale.set(scaleXZ * 0.96, scaleY, scaleXZ * 0.96);
        dummy.updateMatrix();
        tier2Inst.setMatrixAt(i, dummy.matrix);

        // Upper crown peak
        dummy.position.set(tx, 6.5 * scaleY, tz);
        dummy.rotation.set(tiltX, i * 2.3 + 0.8, tiltZ);
        dummy.scale.set(scaleXZ * 0.88, scaleY, scaleXZ * 0.88);
        dummy.updateMatrix();
        tier3Inst.setMatrixAt(i, dummy.matrix);

        instanceColor.setHex(basePalette[i % basePalette.length]);
        tier1Inst.setColorAt(i, instanceColor);
        tier2Inst.setColorAt(i, instanceColor);
        tier3Inst.setColorAt(i, instanceColor);
      }

      trunkInst.instanceMatrix.needsUpdate = true;
      tier1Inst.instanceMatrix.needsUpdate = true;
      tier2Inst.instanceMatrix.needsUpdate = true;
      tier3Inst.instanceMatrix.needsUpdate = true;
      if (tier1Inst.instanceColor) tier1Inst.instanceColor.needsUpdate = true;
      if (tier2Inst.instanceColor) tier2Inst.instanceColor.needsUpdate = true;
      if (tier3Inst.instanceColor) tier3Inst.instanceColor.needsUpdate = true;

      trunkInst.computeBoundingSphere();
      tier1Inst.computeBoundingSphere();
      tier2Inst.computeBoundingSphere();
      tier3Inst.computeBoundingSphere();
      envGroup.add(trunkInst, tier1Inst, tier2Inst, tier3Inst);

      // Multi-blade Ground Shrubs / Tactical Bushes & Rubble Clumps inside the compound
      const bushGeo = ensureGeometryUV2ForAO(new THREE.DodecahedronGeometry(0.55, 1));
      const bushMat = createPBRStandardMaterial({
        color: mapId === 'desert_outpost' ? 0x786538 : 0x334f2b,
        normalMap: barkNormal,
        normalScale: 0.55,
        roughnessMap: barkBump,
        roughness: 0.9,
        metalness: 0.02,
      });
      const bushCount = graphicsQuality === 'ultra' ? 150 : 110;
      const bushInst = new THREE.InstancedMesh(bushGeo, bushMat, bushCount);
      bushInst.castShadow = true;
      bushInst.receiveShadow = true;
      for (let i = 0; i < bushCount; i++) {
        const gx = ((i * 37) % 84) - 42;
        const gz = ((i * 53) % 84) - 42;
        if (Math.abs(gx) < 6.2 || Math.abs(gz) < 5.2) {
          dummy.scale.set(0.001, 0.001, 0.001);
        } else {
          dummy.position.set(gx, 0.24, gz);
          dummy.rotation.set(i * 0.3, i * 1.3, 0);
          const gs = 0.55 + (i % 4) * 0.24;
          dummy.scale.set(gs * 1.35, gs * 0.75, gs * 1.2);
        }
        dummy.updateMatrix();
        bushInst.setMatrixAt(i, dummy.matrix);
      }
      bushInst.instanceMatrix.needsUpdate = true;
      bushInst.computeBoundingSphere();
      envGroup.add(bushInst);
    }

    // 6. Spawn Protection Bastion (prevents enemies from spotting player at 00:01 on spawn)
    addTacticalCover('spawn_shield_center', 0, 29.5, 5.2, 1.85, 1.3, 'hesco');

    // 7. Map-Specific Architectural Structures, Military Vehicles & Explosive Barrels
    if (mapId === 'training_compound') {
      addArchitecturalBuilding('bunker_west_wall', -6.5, 6, 1.6, 3.8, 10, 'concrete_bunker');
      addArchitecturalBuilding('bunker_east_wall', 6.5, 6, 1.6, 3.8, 10, 'concrete_bunker');
      addArchitecturalBuilding('bunker_back_wall', 0, 1.2, 7.6, 4.4, 1.6, 'concrete_bunker');

      addArchitecturalBuilding('kh_west_1', -20, 14, 8, 4.4, 8, 'concrete_bunker');
      addArchitecturalBuilding('kh_east_1', 20, 14, 8, 4.4, 8, 'corrugated_hall');
      addArchitecturalBuilding('kh_west_2', -20, -14, 9, 4.8, 10, 'corrugated_hall');
      addArchitecturalBuilding('kh_east_2', 20, -14, 9, 4.8, 10, 'concrete_bunker');

      addMilitaryTruck('truck_tc_1', -15, 27, 0.15);

      addTacticalCover('cov_south_1', -6, 23, 3.6, 1.35, 1.2, 'hesco');
      addTacticalCover('cov_south_2', 6, 23, 3.6, 1.35, 1.2, 'jersey_barrier');
      addTacticalCover('cov_mid_w', -11, 12, 2.4, 1.5, 2.4, 'crate');
      addTacticalCover('cov_mid_e', 11, 12, 2.4, 1.5, 2.4, 'crate');
      addTacticalCover('cov_center_1', -7, -6, 4.2, 1.4, 1.3, 'hesco');
      addTacticalCover('cov_center_2', 7, -6, 4.2, 1.4, 1.3, 'jersey_barrier');
      addTacticalCover('cov_north_center', 0, -18, 5.2, 1.6, 1.6, 'hesco');
      addTacticalCover('cov_north_w', -10, -26, 3.4, 1.4, 1.4, 'crate');
      addTacticalCover('cov_north_e', 10, -26, 3.4, 1.4, 1.4, 'crate');

      addExplosiveBarrel('barrel_tc_1', -9, 13.5);
      addExplosiveBarrel('barrel_tc_2', 9, 3.5);
      addExplosiveBarrel('barrel_tc_3', -4, -16);
      addExplosiveBarrel('barrel_tc_4', 4, -28);
    } else if (mapId === 'industrial_facility') {
      addArchitecturalBuilding('ind_cont_1', -12, 18, 3.2, 3.4, 9.0, 'corrugated_hall');
      addArchitecturalBuilding('ind_cont_2', 12, 18, 3.2, 3.4, 9.0, 'corrugated_hall');
      addArchitecturalBuilding('ind_hall_center', 0, 0, 10.0, 4.8, 8.0, 'concrete_bunker');
      addArchitecturalBuilding('ind_silo_w', -24, -4, 7.0, 5.8, 7.0, 'corrugated_hall');
      addArchitecturalBuilding('ind_silo_e', 24, -4, 7.0, 5.8, 7.0, 'corrugated_hall');
      addArchitecturalBuilding('ind_cont_3', -12, -20, 8.5, 3.4, 3.2, 'corrugated_hall');
      addArchitecturalBuilding('ind_cont_4', 12, -20, 8.5, 3.4, 3.2, 'corrugated_hall');

      addMilitaryTruck('truck_ind_1', 16, 28, -0.2);

      addTacticalCover('ind_cov_1', -5, 25, 4.0, 1.4, 1.4, 'jersey_barrier');
      addTacticalCover('ind_cov_2', -15, 8, 2.6, 1.4, 2.2, 'crate');
      addTacticalCover('ind_cov_3', 15, 8, 2.6, 1.4, 2.2, 'crate');
      addTacticalCover('ind_cov_4', -8, -10, 3.8, 1.4, 1.4, 'hesco');
      addTacticalCover('ind_cov_5', 8, -10, 3.8, 1.4, 1.4, 'hesco');
      addTacticalCover('ind_cov_6', 0, -28, 4.8, 1.5, 1.5, 'jersey_barrier');

      addExplosiveBarrel('barrel_ind_1', -9.5, 19);
      addExplosiveBarrel('barrel_ind_2', 9.5, 11);
      addExplosiveBarrel('barrel_ind_3', -14, -12);
      addExplosiveBarrel('barrel_ind_4', 14, -12);
      addExplosiveBarrel('barrel_ind_5', 0, -24);
    } else if (mapId === 'desert_outpost') {
      addArchitecturalBuilding('des_bunker_sw', -16, 16, 8.0, 4.0, 4.2, 'concrete_bunker');
      addArchitecturalBuilding('des_bunker_se', 16, 16, 8.0, 4.0, 4.2, 'concrete_bunker');
      addArchitecturalBuilding('des_pillar_w', -8, 0, 4.5, 4.8, 4.5, 'concrete_bunker');
      addArchitecturalBuilding('des_pillar_e', 8, 0, 4.5, 4.8, 4.5, 'concrete_bunker');
      addArchitecturalBuilding('des_citadel_w', -18, -18, 7.0, 4.4, 7.0, 'concrete_bunker');
      addArchitecturalBuilding('des_citadel_e', 18, -18, 7.0, 4.4, 7.0, 'concrete_bunker');

      addMilitaryTruck('truck_des_1', -14, 29, 0.35);

      addTacticalCover('des_cov_1', -5, 26, 3.6, 1.35, 1.3, 'hesco');
      addTacticalCover('des_cov_2', 5, 26, 3.6, 1.35, 1.3, 'hesco');
      addTacticalCover('des_cov_3', 0, 12, 4.4, 1.4, 1.6, 'hesco');
      addTacticalCover('des_cov_4', -14, -4, 3.4, 1.4, 1.6, 'crate');
      addTacticalCover('des_cov_5', 14, -4, 3.4, 1.4, 1.6, 'crate');
      addTacticalCover('des_cov_6', 0, -14, 5.0, 1.4, 1.5, 'hesco');
      addTacticalCover('des_cov_7', -6, -28, 3.6, 1.4, 1.4, 'crate');
      addTacticalCover('des_cov_8', 6, -28, 3.6, 1.4, 1.4, 'crate');

      addExplosiveBarrel('barrel_des_1', -11, 14);
      addExplosiveBarrel('barrel_des_2', 11, 6);
      addExplosiveBarrel('barrel_des_3', -10, -16);
      addExplosiveBarrel('barrel_des_4', 10, -24);
    } else if (mapId === 'urban_warzone') {
      // Urban warzone: street canyon, apartment blocks, alley cover and a damaged checkpoint.
      addArchitecturalBuilding('urb_block_w', -22, 12, 10, 8.5, 13, 'concrete_bunker');
      addArchitecturalBuilding('urb_block_e', 22, 12, 10, 7.2, 13, 'concrete_bunker');
      addArchitecturalBuilding('urb_shop_w', -20, -17, 8, 4.2, 9, 'corrugated_hall');
      addArchitecturalBuilding('urb_shop_e', 20, -17, 8, 4.2, 9, 'concrete_bunker');
      addArchitecturalBuilding('urb_checkpoint', 0, -29, 8, 3.4, 4, 'concrete_bunker');
      addTacticalCover('urb_cover_1', -9, 18, 4.4, 1.4, 1.4, 'jersey_barrier');
      addTacticalCover('urb_cover_2', 9, 4, 4.4, 1.4, 1.4, 'crate');
      addTacticalCover('urb_cover_3', -9, -12, 4.4, 1.4, 1.4, 'hesco');
      addTacticalCover('urb_cover_4', 9, -24, 4.4, 1.4, 1.4, 'jersey_barrier');
      addExplosiveBarrel('urb_barrel_1', -14, 1); addExplosiveBarrel('urb_barrel_2', 14, -7);
    } else if (mapId === 'jungle_valley') {
      // Jungle valley: compact outpost buildings and irregular cover lanes through vegetation.
      addArchitecturalBuilding('jun_barracks_w', -17, 16, 8, 4.0, 7, 'corrugated_hall');
      addArchitecturalBuilding('jun_barracks_e', 17, 16, 8, 4.0, 7, 'corrugated_hall');
      addArchitecturalBuilding('jun_command', 0, -5, 7, 4.5, 7, 'concrete_bunker');
      addArchitecturalBuilding('jun_supply', -16, -23, 7, 3.4, 6, 'corrugated_hall');
      addArchitecturalBuilding('jun_watch', 17, -25, 5, 5.8, 5, 'concrete_bunker');
      addTacticalCover('jun_cov_1', -7, 23, 4, 1.3, 1.4, 'crate'); addTacticalCover('jun_cov_2', 8, 10, 4, 1.3, 1.4, 'hesco');
      addTacticalCover('jun_cov_3', -9, -12, 4, 1.3, 1.4, 'crate'); addTacticalCover('jun_cov_4', 8, -28, 4, 1.3, 1.4, 'hesco');
    } else if (mapId === 'snowbound_base') {
      // Snowbound base: cold-weather barracks, radar shelter and snowfield cover.
      addArchitecturalBuilding('snow_barracks_w', -19, 17, 9, 4.2, 8, 'concrete_bunker');
      addArchitecturalBuilding('snow_barracks_e', 19, 17, 9, 4.2, 8, 'corrugated_hall');
      addArchitecturalBuilding('snow_hangar', 0, -5, 12, 5.2, 10, 'corrugated_hall');
      addArchitecturalBuilding('snow_radar', -19, -24, 6, 4.8, 6, 'concrete_bunker');
      addArchitecturalBuilding('snow_store', 18, -25, 7, 3.8, 6, 'concrete_bunker');
      addTacticalCover('snow_cov_1', -7, 24, 4.2, 1.4, 1.5, 'hesco'); addTacticalCover('snow_cov_2', 7, 11, 4.2, 1.4, 1.5, 'jersey_barrier');
      addTacticalCover('snow_cov_3', -9, -16, 4.2, 1.4, 1.5, 'crate'); addTacticalCover('snow_cov_4', 9, -29, 4.2, 1.4, 1.5, 'hesco');
    } else if (mapId === 'naval_dockyard' || mapId === 'coastal_port') {
      // Dockyard/port: cargo lanes, loading sheds and a broad central quay.
      addArchitecturalBuilding('dock_shed_w', -22, 16, 9, 4.8, 12, 'corrugated_hall');
      addArchitecturalBuilding('dock_shed_e', 22, 16, 9, 4.8, 12, 'corrugated_hall');
      addArchitecturalBuilding('dock_admin', -19, -17, 8, 5.2, 8, 'concrete_bunker');
      addArchitecturalBuilding('dock_warehouse', 19, -18, 10, 5.4, 9, 'corrugated_hall');
      addArchitecturalBuilding('dock_control', 0, -30, 7, 4.2, 5, 'concrete_bunker');
      addTacticalCover('dock_container_1', -9, 22, 5.5, 2.3, 2.4, 'crate'); addTacticalCover('dock_container_2', 9, 10, 5.5, 2.3, 2.4, 'crate');
      addTacticalCover('dock_container_3', -9, -7, 5.5, 2.3, 2.4, 'crate'); addTacticalCover('dock_container_4', 9, -24, 5.5, 2.3, 2.4, 'crate');
    } else if (mapId === 'construction_site') {
      // Construction site: unfinished concrete cores, material stacks and narrow approach lanes.
      addArchitecturalBuilding('const_tower_w', -20, 13, 9, 8, 10, 'concrete_bunker');
      addArchitecturalBuilding('const_tower_e', 20, 13, 9, 6.5, 10, 'concrete_bunker');
      addArchitecturalBuilding('const_core', 0, -5, 10, 5.2, 9, 'concrete_bunker');
      addArchitecturalBuilding('const_store_w', -19, -25, 7, 3.5, 6, 'corrugated_hall');
      addArchitecturalBuilding('const_store_e', 19, -25, 7, 3.5, 6, 'corrugated_hall');
      addTacticalCover('const_cov_1', -8, 24, 4, 1.6, 2, 'crate'); addTacticalCover('const_cov_2', 8, 9, 4, 1.6, 2, 'crate');
      addTacticalCover('const_cov_3', -8, -14, 4, 1.6, 2, 'jersey_barrier'); addTacticalCover('const_cov_4', 8, -29, 4, 1.6, 2, 'jersey_barrier');
    } else if (mapId === 'mountain_fortress') {
      // Mountain fortress: fortified ridge buildings and stepped cover positions.
      addArchitecturalBuilding('mt_gate_w', -18, 18, 8, 4.8, 7, 'concrete_bunker');
      addArchitecturalBuilding('mt_gate_e', 18, 18, 8, 4.8, 7, 'concrete_bunker');
      addArchitecturalBuilding('mt_keep', 0, -7, 11, 6.2, 10, 'concrete_bunker');
      addArchitecturalBuilding('mt_watch_w', -21, -26, 6, 5.4, 6, 'concrete_bunker');
      addArchitecturalBuilding('mt_watch_e', 21, -26, 6, 5.4, 6, 'concrete_bunker');
      addTacticalCover('mt_cov_1', -8, 25, 4.5, 1.5, 1.7, 'hesco'); addTacticalCover('mt_cov_2', 8, 12, 4.5, 1.5, 1.7, 'hesco');
      addTacticalCover('mt_cov_3', -9, -15, 4.5, 1.5, 1.7, 'crate'); addTacticalCover('mt_cov_4', 9, -29, 4.5, 1.5, 1.7, 'hesco');
    } else if (mapId === 'rural_battlefield') {
      // Rural battlefield: scattered farm sheds, a central farmhouse and roadside cover.
      addArchitecturalBuilding('rural_farmhouse', -16, 12, 8, 4.0, 8, 'concrete_bunker');
      addArchitecturalBuilding('rural_barn', 17, 16, 9, 4.6, 10, 'corrugated_hall');
      addArchitecturalBuilding('rural_shed_w', -19, -20, 7, 3.4, 6, 'corrugated_hall');
      addArchitecturalBuilding('rural_shed_e', 19, -23, 7, 3.4, 6, 'concrete_bunker');
      addTacticalCover('rural_cov_1', -7, 23, 4.5, 1.2, 1.4, 'hesco'); addTacticalCover('rural_cov_2', 8, 8, 4.5, 1.2, 1.4, 'crate');
      addTacticalCover('rural_cov_3', -8, -9, 4.5, 1.2, 1.4, 'hesco'); addTacticalCover('rural_cov_4', 8, -28, 4.5, 1.2, 1.4, 'crate');
    } else if (mapId === 'airfield_assault') {
      // Airfield: long hangars, service buildings and runway-side cover.
      addArchitecturalBuilding('air_hangar_w', -22, 14, 10, 5.4, 13, 'corrugated_hall');
      addArchitecturalBuilding('air_hangar_e', 22, 14, 10, 5.4, 13, 'corrugated_hall');
      addArchitecturalBuilding('air_terminal', 0, -7, 10, 4.8, 8, 'concrete_bunker');
      addArchitecturalBuilding('air_control', 0, -29, 5, 6.2, 5, 'concrete_bunker');
      addTacticalCover('air_cov_1', -9, 25, 4.5, 1.4, 1.5, 'jersey_barrier'); addTacticalCover('air_cov_2', 9, 7, 4.5, 1.4, 1.5, 'crate');
      addTacticalCover('air_cov_3', -9, -16, 4.5, 1.4, 1.5, 'hesco'); addTacticalCover('air_cov_4', 9, -31, 4.5, 1.4, 1.5, 'jersey_barrier');
    } else if (mapId === 'research_facility') {
      // Research facility: sterile lab wings and a secure central block.
      addArchitecturalBuilding('lab_wing_w', -18, 16, 8, 4.8, 12, 'concrete_bunker');
      addArchitecturalBuilding('lab_wing_e', 18, 16, 8, 4.8, 12, 'concrete_bunker');
      addArchitecturalBuilding('lab_core', 0, -3, 10, 5.4, 9, 'concrete_bunker');
      addArchitecturalBuilding('lab_aux_w', -18, -24, 7, 3.8, 7, 'corrugated_hall');
      addArchitecturalBuilding('lab_aux_e', 18, -24, 7, 3.8, 7, 'corrugated_hall');
      addTacticalCover('lab_cov_1', -8, 25, 4, 1.4, 1.5, 'jersey_barrier'); addTacticalCover('lab_cov_2', 8, 11, 4, 1.4, 1.5, 'crate');
      addTacticalCover('lab_cov_3', -8, -14, 4, 1.4, 1.5, 'jersey_barrier'); addTacticalCover('lab_cov_4', 8, -30, 4, 1.4, 1.5, 'crate');
    } else {
      // Night Infiltration Black-Site Compound
      addArchitecturalBuilding('nf_sec_house_w', -16, 20, 7.0, 4.0, 6.0, 'concrete_bunker');
      addArchitecturalBuilding('nf_sec_house_e', 16, 20, 7.0, 4.0, 6.0, 'concrete_bunker');
      addArchitecturalBuilding('nf_lab_west', -9, -2, 3.6, 4.4, 12.0, 'corrugated_hall');
      addArchitecturalBuilding('nf_lab_east', 9, -2, 3.6, 4.4, 12.0, 'corrugated_hall');
      addArchitecturalBuilding('nf_north_barracks_w', -18, -22, 8.0, 4.4, 6.0, 'concrete_bunker');
      addArchitecturalBuilding('nf_north_barracks_e', 18, -22, 8.0, 4.4, 6.0, 'concrete_bunker');

      addMilitaryTruck('truck_nf_1', 15, 31, -0.1);

      addTacticalCover('nf_cov_1', -5, 27, 4.2, 1.4, 1.3, 'hesco');
      addTacticalCover('nf_cov_2', -6, 16, 3.2, 1.4, 1.4, 'crate');
      addTacticalCover('nf_cov_3', 6, 16, 3.2, 1.4, 1.4, 'crate');
      addTacticalCover('nf_cov_4', 0, 6, 3.6, 1.4, 1.4, 'jersey_barrier');
      addTacticalCover('nf_cov_5', 0, -12, 4.4, 1.4, 1.4, 'hesco');
      addTacticalCover('nf_cov_6', -7, -28, 3.6, 1.4, 1.4, 'crate');
      addTacticalCover('nf_cov_7', 7, -28, 3.6, 1.4, 1.4, 'crate');

      addExplosiveBarrel('barrel_nf_1', -11, 18);
      addExplosiveBarrel('barrel_nf_2', 11, 10);
      addExplosiveBarrel('barrel_nf_3', -5, -18);
      addExplosiveBarrel('barrel_nf_4', 5, -26);
    }

    // 8. Atmospheric Dust / Ash / Mist Particles
    let dustParticles: THREE.Points | null = null;
    if (graphicsQuality !== 'low') {
      const pCount = graphicsQuality === 'ultra' ? 320 : graphicsQuality === 'high' ? 210 : 130;
      const pPositions = new Float32Array(pCount * 3);
      for (let i = 0; i < pCount; i++) {
        pPositions[i * 3] = (Math.random() - 0.5) * 90;
        pPositions[i * 3 + 1] = Math.random() * 14 + 0.4;
        pPositions[i * 3 + 2] = (Math.random() - 0.5) * 90;
      }
      const pGeo = new THREE.BufferGeometry();
      pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
      const pMat = new THREE.PointsMaterial({
        color: atmoId === 'dusty_desert' ? 0xfde68a : 0xe2e8f0,
        size: 0.14,
        transparent: true,
        opacity: 0.42,
      });
      dustParticles = new THREE.Points(pGeo, pMat);
      envGroup.add(dustParticles);
    }

    // 9. Extraction Beacon Zone Pad (PBR Standard & Emissive Materials)
    const [exX, exY, exZ] = mission.extractionPoint;
    const extractionGroup = new THREE.Group();
    extractionGroup.position.set(exX, exY + 0.03, exZ);

    const padDisc = new THREE.Mesh(
      ensureGeometryUV2ForAO(new THREE.CylinderGeometry(3.4, 3.6, 0.08, 24)),
      darkSteelMat
    );
    padDisc.receiveShadow = true;
    extractionGroup.add(padDisc);

    const ringMat = createPBRStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 1.5,
      roughness: 0.2,
      metalness: 0.1,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75,
    });
    const extractionRing = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.2, 32),
      ringMat
    );
    extractionRing.rotation.x = -Math.PI / 2;
    extractionRing.position.y = 0.06;
    extractionGroup.add(extractionRing);

    const flareMat = createPBRStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 1.85,
      roughness: 0.25,
      metalness: 0.3,
    });
    [
      [-2.4, -2.4],
      [2.4, -2.4],
      [-2.4, 2.4],
      [2.4, 2.4],
    ].forEach(([fx, fz]) => {
      const flare = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.16, 0.45, 8),
        flareMat
      );
      flare.position.set(fx, 0.22, fz);
      flare.castShadow = true;
      extractionGroup.add(flare);
    });

    envGroup.add(extractionGroup);
    scene.add(envGroup);

    return {
      environmentGroup: envGroup,
      extractionRing,
      explosiveBarrels,
      keyLight,
      hemiLight,
      dustParticles,
    };
  }
}
