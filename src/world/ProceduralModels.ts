import * as THREE from 'three';
import {
  EnemyPersonality,
  InteractiveObjectConfig,
  WeaponAttachmentConfig,
  WeaponId,
  WeaponSkinId,
} from '../types/game';

/**
 * Custom GLSL Vertex & Fragment Shaders for the Three.js 'Glow Wall' (Through-Wall X-Ray)
 * and 3D Fresnel Rim-Outline Shader Technique.
 */
const GLOW_WALL_VERTEX_SHADER = /* glsl */ `
  uniform float uExtrude;
  varying vec3 vViewNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;

  void main() {
    vec3 displacedPosition = position + normal * uExtrude;
    vec4 worldPosition = modelMatrix * vec4(displacedPosition, 1.0);
    vWorldPos = worldPosition.xyz;
    vec4 mvPosition = viewMatrix * worldPosition;
    vViewNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const GLOW_WALL_XRAY_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uGlowColor;
  uniform float uTime;
  uniform float uIntensity;
  varying vec3 vViewNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;

  void main() {
    float ndotv = abs(dot(normalize(vViewNormal), normalize(vViewDir)));
    float fresnel = pow(clamp(1.0 - ndotv, 0.0, 1.0), 1.65);
    float scanline = 0.72 + 0.28 * sin(vWorldPos.y * 34.0 - uTime * 6.5);
    float pulse = 0.84 + 0.16 * sin(uTime * 4.2);
    float alpha = clamp((fresnel * 0.85 + 0.18) * scanline * pulse * uIntensity, 0.0, 0.92);
    gl_FragColor = vec4(uGlowColor * (1.25 + fresnel * 0.6), alpha);
  }
`;

const GLOW_WALL_OUTLINE_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uGlowColor;
  uniform float uTime;
  uniform float uIntensity;
  varying vec3 vViewNormal;
  varying vec3 vViewDir;

  void main() {
    float ndotv = abs(dot(normalize(vViewNormal), normalize(vViewDir)));
    float rim = pow(clamp(1.0 - ndotv, 0.0, 1.0), 1.35);
    float pulse = 0.85 + 0.15 * sin(uTime * 4.8);
    float alpha = clamp((0.38 + rim * 0.62) * pulse * uIntensity, 0.0, 0.95);
    gl_FragColor = vec4(uGlowColor * 1.35, alpha);
  }
`;

/**
 * Updates the GLSL uniform `uTime` and `uIntensity` on a Glow Wall outline group.
 */
export function updateGlowWallShaderUniforms(
  glowRoot: THREE.Object3D,
  elapsedTimeSec: number,
  intensityMultiplier = 1.0
): void {
  glowRoot.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial) {
      if (child.material.uniforms.uTime) {
        child.material.uniforms.uTime.value = elapsedTimeSec;
      }
      if (child.material.uniforms.uIntensity) {
        child.material.uniforms.uIntensity.value = intensityMultiplier;
      }
    }
  });
}

export interface PBRTextureSlotConfig {
  color?: THREE.ColorRepresentation;
  albedoMap?: THREE.Texture | null;
  normalMap?: THREE.Texture | null;
  normalScale?: THREE.Vector2 | number;
  roughnessMap?: THREE.Texture | null;
  roughness?: number;
  metalnessMap?: THREE.Texture | null;
  metalness?: number;
  aoMap?: THREE.Texture | null;
  aoMapIntensity?: number;
  bumpMap?: THREE.Texture | null;
  bumpScale?: number;
  emissive?: THREE.ColorRepresentation;
  emissiveMap?: THREE.Texture | null;
  emissiveIntensity?: number;
  envMapIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  depthWrite?: boolean;
  polygonOffset?: boolean;
  polygonOffsetFactor?: number;
  polygonOffsetUnits?: number;
  // MeshPhysicalMaterial advanced PBR parameters
  clearcoat?: number;
  clearcoatRoughness?: number;
  anisotropy?: number;
  anisotropyRotation?: number;
  transmission?: number;
  ior?: number;
  thickness?: number;
  sheen?: number;
  sheenRoughness?: number;
  sheenColor?: THREE.ColorRepresentation;
  reflectivity?: number;
  specularIntensity?: number;
}

/**
 * Ensures a BufferGeometry has a `uv2` attribute copied from `uv` so Three.js `aoMap`
 * (Ambient Occlusion texture map) evaluates accurately on any mesh.
 */
export function ensureGeometryUV2ForAO<T extends THREE.BufferGeometry>(geometry: T): T {
  if (geometry.attributes.uv && !geometry.attributes.uv2) {
    geometry.setAttribute('uv2', geometry.attributes.uv);
  }
  return geometry;
}

/**
 * Factory for `THREE.MeshStandardMaterial` that exposes plug-and-play slots for
 * Albedo (`albedoMap`), Normal (`normalMap`), Roughness (`roughnessMap`),
 * Metalness (`metalnessMap`), and Ambient Occlusion (`aoMap`) texture maps.
 */
export function createPBRStandardMaterial(
  config: PBRTextureSlotConfig
): THREE.MeshStandardMaterial {
  const normalScaleVec =
    typeof config.normalScale === 'number'
      ? new THREE.Vector2(config.normalScale, config.normalScale)
      : config.normalScale || new THREE.Vector2(1, 1);

  return new THREE.MeshStandardMaterial({
    color: config.color ?? 0xffffff,
    map: config.albedoMap ?? null,
    normalMap: config.normalMap ?? null,
    normalScale: normalScaleVec,
    roughnessMap: config.roughnessMap ?? null,
    roughness: config.roughness ?? 0.65,
    metalnessMap: config.metalnessMap ?? null,
    metalness: config.metalness ?? 0.1,
    aoMap: config.aoMap ?? null,
    aoMapIntensity: config.aoMapIntensity ?? 1.0,
    bumpMap: config.bumpMap ?? null,
    bumpScale: config.bumpScale ?? 0.008,
    emissive: config.emissive ?? 0x000000,
    emissiveMap: config.emissiveMap ?? null,
    emissiveIntensity: config.emissiveIntensity ?? 1.0,
    envMapIntensity: config.envMapIntensity ?? 1.0,
    transparent: config.transparent ?? false,
    opacity: config.opacity ?? 1.0,
    side: config.side ?? THREE.FrontSide,
    depthWrite: config.depthWrite ?? true,
    polygonOffset: config.polygonOffset ?? false,
    polygonOffsetFactor: config.polygonOffsetFactor ?? 0,
    polygonOffsetUnits: config.polygonOffsetUnits ?? 0,
  });
}

/**
 * Factory for `THREE.MeshPhysicalMaterial` (clearcoat, anisotropy, transmission, IOR, sheen)
 * with full Albedo, Normal, Roughness, Metalness, and Ambient Occlusion texture map slots.
 */
export function createPBRPhysicalMaterial(
  config: PBRTextureSlotConfig
): THREE.MeshPhysicalMaterial {
  const normalScaleVec =
    typeof config.normalScale === 'number'
      ? new THREE.Vector2(config.normalScale, config.normalScale)
      : config.normalScale || new THREE.Vector2(1, 1);

  return new THREE.MeshPhysicalMaterial({
    color: config.color ?? 0xffffff,
    map: config.albedoMap ?? null,
    normalMap: config.normalMap ?? null,
    normalScale: normalScaleVec,
    roughnessMap: config.roughnessMap ?? null,
    roughness: config.roughness ?? 0.4,
    metalnessMap: config.metalnessMap ?? null,
    metalness: config.metalness ?? 0.2,
    aoMap: config.aoMap ?? null,
    aoMapIntensity: config.aoMapIntensity ?? 1.0,
    bumpMap: config.bumpMap ?? null,
    bumpScale: config.bumpScale ?? 0.006,
    emissive: config.emissive ?? 0x000000,
    emissiveMap: config.emissiveMap ?? null,
    emissiveIntensity: config.emissiveIntensity ?? 1.0,
    envMapIntensity: config.envMapIntensity ?? 1.1,
    transparent: config.transparent ?? false,
    opacity: config.opacity ?? 1.0,
    side: config.side ?? THREE.FrontSide,
    depthWrite: config.depthWrite ?? true,
    polygonOffset: config.polygonOffset ?? false,
    polygonOffsetFactor: config.polygonOffsetFactor ?? 0,
    polygonOffsetUnits: config.polygonOffsetUnits ?? 0,
    clearcoat: config.clearcoat ?? 0.0,
    clearcoatRoughness: config.clearcoatRoughness ?? 0.15,
    anisotropy: config.anisotropy ?? 0.0,
    anisotropyRotation: config.anisotropyRotation ?? 0.0,
    transmission: config.transmission ?? 0.0,
    ior: config.ior ?? 1.5,
    thickness: config.thickness ?? 0.1,
    sheen: config.sheen ?? 0.0,
    sheenRoughness: config.sheenRoughness ?? 0.5,
    sheenColor: config.sheenColor !== undefined ? new THREE.Color(config.sheenColor) : undefined,
    reflectivity: config.reflectivity ?? 0.5,
    specularIntensity: config.specularIntensity ?? 1.0,
  });
}

/**
 * Generates realistic procedural PBR Albedo, Tangent-Space Normal, Roughness, Ambient Occlusion (AO),
 * and Contact Shadow CanvasTextures. Also supports loading external texture URLs into any PBR slot.
 */
export class ProceduralTextures {
  private static cache = new Map<string, THREE.CanvasTexture>();

  /**
   * Generates a true tangent-space RGB Normal Map (`#8080ff` neutral) using Sobel height derivatives
   * for crisp per-pixel normal perturbation under directional sun and IBL lighting.
   */
  static getSurfaceNormalTexture(
    variant: 'concrete' | 'metal' | 'polymer' | 'bark',
    maxAnisotropy = 4
  ): THREE.CanvasTexture {
    const key = `normal_map_${variant}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const bumpTex = this.getSurfaceBumpTexture(variant, maxAnisotropy);
    const srcCanvas = bumpTex.image as HTMLCanvasElement;
    const w = srcCanvas.width;
    const h = srcCanvas.height;
    const srcCtx = srcCanvas.getContext('2d')!;
    const srcData = srcCtx.getImageData(0, 0, w, h).data;

    const dstCanvas = document.createElement('canvas');
    dstCanvas.width = w;
    dstCanvas.height = h;
    const dstCtx = dstCanvas.getContext('2d')!;
    const dstImg = dstCtx.createImageData(w, h);
    const dstData = dstImg.data;

    const strength = variant === 'concrete' ? 2.6 : variant === 'bark' ? 3.0 : 1.8;

    const sample = (x: number, y: number): number => {
      const wx = (x + w) % w;
      const wy = (y + h) % h;
      return srcData[(wy * w + wx) * 4] / 255;
    };

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dX =
          sample(x + 1, y - 1) +
          2 * sample(x + 1, y) +
          sample(x + 1, y + 1) -
          (sample(x - 1, y - 1) + 2 * sample(x - 1, y) + sample(x - 1, y + 1));
        const dY =
          sample(x - 1, y + 1) +
          2 * sample(x, y + 1) +
          sample(x + 1, y + 1) -
          (sample(x - 1, y - 1) + 2 * sample(x, y - 1) + sample(x + 1, y - 1));

        let nx = -dX * strength;
        let ny = -dY * strength;
        let nz = 1.0;
        const invLen = 1.0 / Math.hypot(nx, ny, nz);
        nx *= invLen;
        ny *= invLen;
        nz *= invLen;

        const idx = (y * w + x) * 4;
        dstData[idx] = Math.round((nx * 0.5 + 0.5) * 255);
        dstData[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        dstData[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        dstData[idx + 3] = 255;
      }
    }

    dstCtx.putImageData(dstImg, 0, 0);
    const normalTex = new THREE.CanvasTexture(dstCanvas);
    normalTex.colorSpace = THREE.NoColorSpace;
    normalTex.wrapS = THREE.RepeatWrapping;
    normalTex.wrapT = THREE.RepeatWrapping;
    normalTex.anisotropy = maxAnisotropy;
    this.cache.set(key, normalTex);
    return normalTex;
  }

  /**
   * Generates a procedural Ambient Occlusion (`aoMap`) texture with edge/panel crevice darkening.
   */
  static getSurfaceAOTexture(
    variant: 'architectural' | 'prop' | 'terrain',
    maxAnisotropy = 4
  ): THREE.CanvasTexture {
    const key = `ao_map_${variant}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#f4f4f4';
    ctx.fillRect(0, 0, 256, 256);

    // Subtle border and seam crevice occlusion
    const edgeGrad = ctx.createRadialGradient(128, 128, 45, 128, 128, 175);
    edgeGrad.addColorStop(0, 'rgba(255,255,255,1)');
    edgeGrad.addColorStop(0.75, 'rgba(225,225,225,1)');
    edgeGrad.addColorStop(1, 'rgba(135,135,135,1)');
    ctx.fillStyle = edgeGrad;
    ctx.fillRect(0, 0, 256, 256);

    if (variant === 'architectural') {
      ctx.strokeStyle = 'rgba(110, 110, 110, 0.45)';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, 250, 250);
      for (let y = 64; y < 256; y += 64) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(256, y);
        ctx.stroke();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.NoColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = maxAnisotropy;
    this.cache.set(key, tex);
    return tex;
  }

  /**
   * High-frequency surface micro-grain bump/roughness map for concrete, metal, and polymer PBR materials.
   */
  static getSurfaceBumpTexture(
    variant: 'concrete' | 'metal' | 'polymer' | 'bark',
    maxAnisotropy = 4
  ): THREE.CanvasTexture {
    const key = `bump_map_${variant}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 512, 512);

    if (variant === 'metal') {
      // Anisotropic brushed metal striations + subtle edge wear
      for (let y = 0; y < 512; y += 2) {
        const shade = 115 + Math.floor(Math.random() * 28);
        ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
        ctx.fillRect(0, y, 512, 1);
      }
      for (let i = 0; i < 420; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#a8a8a8' : '#585858';
        ctx.fillRect(Math.random() * 512, Math.random() * 512, 8 + Math.random() * 26, 1);
      }
    } else if (variant === 'bark') {
      // Vertical bark ridges
      for (let x = 0; x < 512; x += 4) {
        const shade = 75 + Math.floor(Math.random() * 85);
        ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
        ctx.fillRect(x, 0, 3, 512);
      }
      for (let i = 0; i < 900; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#404040' : '#b8b8b8';
        ctx.fillRect(Math.random() * 512, Math.random() * 512, 3, 18 + Math.random() * 28);
      }
    } else {
      // Concrete or polymer stipple grain
      const count = variant === 'concrete' ? 11000 : 7500;
      for (let i = 0; i < count; i++) {
        const v = 90 + Math.floor(Math.random() * 75);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        const sz = variant === 'concrete' ? 1 + (i % 3) : 1 + (i % 2);
        ctx.fillRect(Math.random() * 512, Math.random() * 512, sz, sz);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.NoColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = maxAnisotropy;
    this.cache.set(key, tex);
    return tex;
  }

  /**
   * Soft radial ambient-occlusion contact shadow decal texture to ground buildings, vehicles, trees, and pickups.
   */
  static getContactShadowTexture(): THREE.CanvasTexture {
    const key = 'contact_shadow_ao_v2';
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 122);
    grad.addColorStop(0, 'rgba(5, 8, 12, 0.72)');
    grad.addColorStop(0.55, 'rgba(8, 12, 18, 0.36)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.cache.set(key, tex);
    return tex;
  }

  /**
   * Generates a realistic multi-layered terrain texture (asphalt, dirt, gravel, sand, tire tracks, cracks)
   * with rich aggregate detail.
   */
  static getRealisticTerrainTexture(
    theme: 'temperate' | 'industrial' | 'desert' | 'night' | 'snow' | 'jungle',
    maxAnisotropy = 4
  ): THREE.CanvasTexture {
    const key = `terrain_realistic_v3_${theme}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;

    const baseColors = {
      temperate: {
        base: '#3b3831',
        patch1: '#2d3424',
        patch2: '#4c463c',
        gravel: '#59544b',
        road: '#292b2e',
      },
      industrial: {
        base: '#333639',
        patch1: '#26292c',
        patch2: '#45413b',
        gravel: '#525558',
        road: '#212326',
      },
      desert: {
        base: '#886746',
        patch1: '#735335',
        patch2: '#9c7a56',
        gravel: '#b08f6a',
        road: '#5c4938',
      },
      night: {
        base: '#1e2421',
        patch1: '#151b18',
        patch2: '#292e2a',
        gravel: '#333935',
        road: '#181b1f',
      },
      snow: {
        base: '#aeb8c2',
        patch1: '#d5dce2',
        patch2: '#8998a6',
        gravel: '#c1c9d0',
        road: '#59636d',
      },
      jungle: {
        base: '#283b26',
        patch1: '#172a1b',
        patch2: '#405638',
        gravel: '#596346',
        road: '#343c2d',
      },
    }[theme];

    ctx.fillStyle = baseColors.base;
    ctx.fillRect(0, 0, 1024, 1024);

    // Macro organic soil, moss, and crushed gravel patches
    for (let i = 0; i < 340; i++) {
      const x = Math.random() * 1024;
      const y = Math.random() * 1024;
      const r = 16 + Math.random() * 92;
      const grad = ctx.createRadialGradient(x, y, 2, x, y, r);
      const col =
        i % 3 === 0 ? baseColors.patch1 : i % 3 === 1 ? baseColors.patch2 : baseColors.gravel;
      grad.addColorStop(0, col);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.globalAlpha = 0.48;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Dual tire tread tracks across compound roads
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = baseColors.road;
    for (let t = 0; t < 120; t++) {
      const ty = (t / 120) * 1024;
      ctx.fillRect(460 + Math.sin(t * 0.1) * 8, ty, 18, 5);
      ctx.fillRect(535 + Math.sin(t * 0.1) * 8, ty, 18, 5);
    }

    // High-density pebble, stone, and soil grain noise
    for (let i = 0; i < 14000; i++) {
      const x = Math.random() * 1024;
      const y = Math.random() * 1024;
      ctx.fillStyle =
        i % 4 === 0
          ? '#141414'
          : i % 4 === 1
            ? '#7c766b'
            : i % 4 === 2
              ? baseColors.patch2
              : baseColors.gravel;
      ctx.globalAlpha = 0.18;
      const s = 1 + (i % 3);
      ctx.fillRect(x, y, s, s);
    }

    // Weathered asphalt/concrete fractures & crevices
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = '#161616';
    ctx.lineWidth = 1.8;
    for (let c = 0; c < 48; c++) {
      let cx = Math.random() * 1024;
      let cy = Math.random() * 1024;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      for (let s = 0; s < 7; s++) {
        cx += (Math.random() - 0.5) * 42;
        cy += (Math.random() - 0.5) * 42;
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = maxAnisotropy;
    this.cache.set(key, tex);
    return tex;
  }

  /**
   * Generates a weathered architectural concrete/brick wall texture with normal/grime detail,
   * formwork seams, tie-rod holes, and vertical rain streaks.
   */
  static getWeatheredConcreteTexture(
    baseHex: string,
    stainHex: string,
    maxAnisotropy = 4
  ): THREE.CanvasTexture {
    const key = `weathered_conc_v2_${baseHex}_${stainHex}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, 512, 512);

    // Concrete formwork panel seams
    ctx.strokeStyle = 'rgba(15, 20, 25, 0.38)';
    ctx.lineWidth = 2;
    for (let y = 64; y < 512; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }
    for (let x = 128; x < 512; x += 128) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
    }

    // Formwork tie-rod holes
    ctx.fillStyle = 'rgba(12, 16, 20, 0.55)';
    for (let y = 32; y < 512; y += 64) {
      for (let x = 32; x < 512; x += 64) {
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Vertical weathering & water-runoff streaks
    for (let i = 0; i < 95; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const w = 6 + Math.random() * 24;
      const h = 45 + Math.random() * 180;
      ctx.fillStyle = stainHex;
      ctx.globalAlpha = 0.16;
      ctx.fillRect(x, y, w, h);
    }

    // Bottom foundation splash dirt gradient
    const baseGrad = ctx.createLinearGradient(0, 380, 0, 512);
    baseGrad.addColorStop(0, 'rgba(20, 18, 15, 0.0)');
    baseGrad.addColorStop(1, 'rgba(20, 18, 15, 0.48)');
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 380, 512, 132);

    // Pitting and micro-spalling
    for (let i = 0; i < 4200; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#1c1917' : '#d6d3d1';
      ctx.globalAlpha = 0.11;
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = maxAnisotropy;
    this.cache.set(key, tex);
    return tex;
  }

  /**
   * Generates a corrugated industrial metal siding texture with vertical ribs and rust wear.
   */
  static getCorrugatedMetalTexture(baseHex: string, maxAnisotropy = 4): THREE.CanvasTexture {
    const key = `corrugated_metal_v2_${baseHex}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, 512, 512);

    // Vertical corrugated ribs with highlight & shadow bevels
    for (let x = 0; x < 512; x += 16) {
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.fillRect(x, 0, 6, 512);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x + 6, 0, 4, 512);
    }

    // Horizontal structural sheet seams & rivets
    ctx.fillStyle = 'rgba(15, 23, 42, 0.5)';
    ctx.fillRect(0, 252, 512, 5);

    // Rust & grime streaks near seams
    for (let i = 0; i < 55; i++) {
      ctx.fillStyle = '#5c2d16';
      ctx.globalAlpha = 0.2;
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 10 + Math.random() * 34, 8);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = maxAnisotropy;
    this.cache.set(key, tex);
    return tex;
  }

  /**
   * Generates a realistic woven sandbag / HESCO bastion texture.
   */
  static getSandbagTexture(maxAnisotropy = 4): THREE.CanvasTexture {
    const key = 'sandbag_burlap_tex_v2';
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#857356';
    ctx.fillRect(0, 0, 256, 256);

    // Stacked sandbag courses + galvanized HESCO wire mesh grid
    ctx.strokeStyle = '#3d3324';
    ctx.lineWidth = 3;
    for (let row = 0; row < 8; row++) {
      const y = row * 32;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();

      const offset = (row % 2) * 32;
      for (let col = 0; col < 5; col++) {
        const x = col * 64 + offset;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 32);
        ctx.stroke();
      }
    }

    // Galvanized wire mesh overlay
    ctx.strokeStyle = 'rgba(180, 190, 200, 0.22)';
    ctx.lineWidth = 1;
    for (let g = 0; g < 256; g += 16) {
      ctx.beginPath();
      ctx.moveTo(g, 0);
      ctx.lineTo(g, 256);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = maxAnisotropy;
    this.cache.set(key, tex);
    return tex;
  }

  static getCratePanelTexture(baseHex: string, accentHex: string): THREE.CanvasTexture {
    const key = `crate_v2_${baseHex}_${accentHex}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, 242, 242);

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(14, 14);
    ctx.lineTo(242, 242);
    ctx.moveTo(242, 14);
    ctx.lineTo(14, 242);
    ctx.stroke();

    ctx.fillStyle = accentHex;
    ctx.fillRect(28, 114, 200, 28);

    ctx.fillStyle = '#090d16';
    for (let x = 36; x < 220; x += 24) {
      ctx.fillRect(x, 118, 10, 20);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.cache.set(key, tex);
    return tex;
  }

  /**
   * Generates a realistic military camouflage fabric texture for enemy uniforms and operator sleeves.
   */
  static getCamoFabricTexture(
    variant: 'woodland' | 'urban' | 'specops' | 'desert'
  ): THREE.CanvasTexture {
    const key = `camo_fabric_${variant}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    const palette = {
      woodland: ['#2d3829', '#1e261b', '#4a4333', '#151914'],
      urban: ['#333b42', '#1f252b', '#4b5563', '#111827'],
      specops: ['#1f2421', '#141715', '#2e3630', '#0c0e0d'],
      desert: ['#856d4d', '#6b5335', '#a38b6a', '#4a3a24'],
    }[variant];

    ctx.fillStyle = palette[0];
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 95; i++) {
      ctx.fillStyle = palette[i % palette.length];
      ctx.beginPath();
      const cx = Math.random() * 256;
      const cy = Math.random() * 256;
      ctx.arc(cx, cy, 10 + Math.random() * 24, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    this.cache.set(key, tex);
    return tex;
  }

  /**
   * Generates custom PBR Albedo / Pattern textures for Weapon Skins (camo, carbon fiber, digital, titanium gold).
   */
  static getWeaponSkinTexture(skinId: WeaponSkinId, maxAnisotropy = 4): THREE.CanvasTexture {
    const key = `weapon_skin_tex_${skinId}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    if (skinId === 'carbon_fiber') {
      // 2x2 Twill-Weave Carbon Fiber Pattern with Interlocking Micro-Fibers
      ctx.fillStyle = '#111315';
      ctx.fillRect(0, 0, 512, 512);

      const step = 8;
      for (let y = 0; y < 512; y += step) {
        for (let x = 0; x < 512; x += step) {
          const isDiag = ((x / step + y / step) % 4 < 2);
          const shade = isDiag ? 32 + ((x * 7 + y * 13) % 18) : 18 + ((x * 11 + y * 5) % 12);
          ctx.fillStyle = `rgb(${shade},${shade + 2},${shade + 4})`;
          ctx.fillRect(x, y, step - 1, step - 1);

          // Micro-fiber specular highlight line
          ctx.fillStyle = isDiag ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.3)';
          ctx.fillRect(x, y, step - 1, 1);
        }
      }
    } else if (skinId === 'woodland_camo') {
      // 4-Tone Military M81 Woodland Disruptive Camouflage Pattern
      ctx.fillStyle = '#3a4b35'; // NATO Green
      ctx.fillRect(0, 0, 512, 512);

      const camoColors = ['#233020', '#564436', '#141713'];
      for (let pass = 0; pass < 3; pass++) {
        ctx.fillStyle = camoColors[pass];
        for (let i = 0; i < 48; i++) {
          let cx = Math.random() * 512;
          let cy = Math.random() * 512;
          ctx.beginPath();
          ctx.arc(cx, cy, 24 + Math.random() * 42, 0, Math.PI * 2);
          for (let s = 0; s < 4; s++) {
            cx += (Math.random() - 0.5) * 55;
            cy += (Math.random() - 0.5) * 55;
            ctx.arc(cx, cy, 18 + Math.random() * 32, 0, Math.PI * 2);
          }
          ctx.fill();
        }
      }
    } else if (skinId === 'desert_camo') {
      // 3-Tone Arid Desert Stalker Disruptive Pattern
      ctx.fillStyle = '#c5b382'; // Desert Sand
      ctx.fillRect(0, 0, 512, 512);

      const aridColors = ['#8f764a', '#54422e', '#e2d7ad'];
      for (let pass = 0; pass < 3; pass++) {
        ctx.fillStyle = aridColors[pass];
        for (let i = 0; i < 42; i++) {
          let cx = Math.random() * 512;
          let cy = Math.random() * 512;
          ctx.beginPath();
          ctx.arc(cx, cy, 22 + Math.random() * 46, 0, Math.PI * 2);
          for (let s = 0; s < 3; s++) {
            cx += (Math.random() - 0.5) * 60;
            cy += (Math.random() - 0.5) * 60;
            ctx.arc(cx, cy, 16 + Math.random() * 30, 0, Math.PI * 2);
          }
          ctx.fill();
        }
      }
    } else if (skinId === 'urban_digital') {
      // Sub-Zero Digital Micro-Pixel Cadpat Matrix
      ctx.fillStyle = '#222933';
      ctx.fillRect(0, 0, 512, 512);

      const pixelCols = ['#475569', '#64748b', '#0f172a', '#94a3b8'];
      const pSize = 16;
      for (let y = 0; y < 512; y += pSize) {
        for (let x = 0; x < 512; x += pSize) {
          const noise = Math.sin(x * 0.04) * Math.cos(y * 0.04) + Math.sin(x * 0.08 + y * 0.08);
          if (noise > 0.4) {
            ctx.fillStyle = pixelCols[0];
            ctx.fillRect(x, y, pSize, pSize);
          } else if (noise > 0.1) {
            ctx.fillStyle = pixelCols[1];
            ctx.fillRect(x, y, pSize, pSize);
          } else if (noise < -0.45) {
            ctx.fillStyle = pixelCols[2];
            ctx.fillRect(x, y, pSize, pSize);
          } else if (noise < -0.2) {
            ctx.fillStyle = pixelCols[3];
            ctx.fillRect(x, y, pSize, pSize);
          }
        }
      }
    } else if (skinId === 'titanium_gold') {
      // Polished Titanium Nitride Gold Alloy with Brushed Hairline Striations
      const grad = ctx.createLinearGradient(0, 0, 512, 512);
      grad.addColorStop(0, '#a37a1c');
      grad.addColorStop(0.3, '#d4af37');
      grad.addColorStop(0.5, '#fef08a');
      grad.addColorStop(0.7, '#d4af37');
      grad.addColorStop(1, '#946f18');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 512);

      // Fine brushed hairline scratches
      ctx.fillStyle = 'rgba(255,255,255,0.09)';
      for (let y = 0; y < 512; y += 2) {
        ctx.fillRect(0, y, 512, 1);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      for (let i = 0; i < 400; i++) {
        ctx.fillRect(Math.random() * 512, Math.random() * 512, 12 + Math.random() * 32, 1);
      }
    } else {
      // Tactical Matte Gunmetal (Default)
      ctx.fillStyle = '#1c1f24';
      ctx.fillRect(0, 0, 512, 512);

      for (let i = 0; i < 6000; i++) {
        const v = 22 + Math.floor(Math.random() * 16);
        ctx.fillStyle = `rgb(${v},${v},${v + 2})`;
        ctx.fillRect(Math.random() * 512, Math.random() * 512, 1.5, 1.5);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = maxAnisotropy;
    this.cache.set(key, tex);
    return tex;
  }
}

/**
 * Helper that builds a dual-pass Three.js GLSL 'Glow Wall' (Through-Wall X-Ray) +
 * 3D Fresnel Outline Shader Group matching the 3D silhouette of a pickup or objective.
 */
function createGlowWallShaderGroup(
  silhouetteMeshes: Array<{
    geometry: THREE.BufferGeometry;
    position: THREE.Vector3;
    rotation?: THREE.Euler;
    scale?: THREE.Vector3;
  }>,
  glowColorHex: number,
  groundRingRadius: number
): THREE.Group {
  const glowGroup = new THREE.Group();
  const colorVec = new THREE.Color(glowColorHex);

  // Pass 1: Through-Wall X-Ray Shader (renders ONLY where occluded by walls/obstacles: GreaterDepth)
  const xrayMat = new THREE.ShaderMaterial({
    uniforms: {
      uGlowColor: { value: colorVec },
      uTime: { value: 0 },
      uIntensity: { value: 1.0 },
      uExtrude: { value: 0.008 },
    },
    vertexShader: GLOW_WALL_VERTEX_SHADER,
    fragmentShader: GLOW_WALL_XRAY_FRAGMENT_SHADER,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    depthFunc: THREE.GreaterDepth,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
  });

  // Pass 2: Direct-Sight 3D Normal-Extruded Fresnel Rim Outline (LessEqualDepth)
  const outlineMat = new THREE.ShaderMaterial({
    uniforms: {
      uGlowColor: { value: colorVec },
      uTime: { value: 0 },
      uIntensity: { value: 1.0 },
      uExtrude: { value: 0.022 },
    },
    vertexShader: GLOW_WALL_VERTEX_SHADER,
    fragmentShader: GLOW_WALL_OUTLINE_FRAGMENT_SHADER,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    depthFunc: THREE.LessEqualDepth,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  });

  for (const item of silhouetteMeshes) {
    const xrayMesh = new THREE.Mesh(item.geometry, xrayMat);
    xrayMesh.position.copy(item.position);
    if (item.rotation) xrayMesh.rotation.copy(item.rotation);
    if (item.scale) xrayMesh.scale.copy(item.scale);
    xrayMesh.renderOrder = 998;

    const rimMesh = new THREE.Mesh(item.geometry, outlineMat);
    rimMesh.position.copy(item.position);
    if (item.rotation) rimMesh.rotation.copy(item.rotation);
    if (item.scale) rimMesh.scale.copy(item.scale);
    rimMesh.renderOrder = 997;

    glowGroup.add(xrayMesh, rimMesh);
  }

  // Grounded Holographic Beacon Ring (PBR Emissive Standard Material)
  const ringMat = createPBRStandardMaterial({
    color: glowColorHex,
    emissive: glowColorHex,
    emissiveIntensity: 1.4,
    roughness: 0.25,
    metalness: 0.1,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  const ringMesh = new THREE.Mesh(
    new THREE.RingGeometry(groundRingRadius * 0.8, groundRingRadius, 28),
    ringMat
  );
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.position.y = 0.03;
  glowGroup.add(ringMesh);

  return glowGroup;
}

/**
 * Helper to create a soft ground contact shadow plane under any prop, vehicle, or pickup.
 */
export function createContactShadowPlane(width: number, depth: number): THREE.Mesh {
  const mat = createPBRStandardMaterial({
    albedoMap: ProceduralTextures.getContactShadowTexture(),
    roughness: 1.0,
    metalness: 0.0,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const plane = new THREE.Mesh(ensureGeometryUV2ForAO(new THREE.PlaneGeometry(width, depth)), mat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = 0.015;
  return plane;
}

export interface ArticulatedSoldierRig {
  group: THREE.Group;
  headMesh: THREE.Mesh;
  visorMesh: THREE.Mesh;
  torsoGroup: THREE.Group;
  leftLegGroup: THREE.Group;
  rightLegGroup: THREE.Group;
  leftArmGroup: THREE.Group;
  rightArmGroup: THREE.Group;
  muzzlePoint: THREE.Object3D;
}

export interface EnemyMeshRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  headMesh: THREE.Mesh;
  visorMesh: THREE.Mesh;
  healthBarFill: THREE.Mesh;
  stateIndicatorMesh: THREE.Mesh;
  muzzlePoint: THREE.Object3D;
}

/**
 * Builds a realistic articulated 12-part Tactical Soldier Character Rig.
 */
export function createEnemySoldierModel(
  personality: EnemyPersonality,
  isCommander = false
): ArticulatedSoldierRig {
  const group = new THREE.Group();

  const camoVariant =
    personality === EnemyPersonality.Elite || isCommander
      ? 'specops'
      : personality === EnemyPersonality.Assault
        ? 'urban'
        : 'woodland';

  const uniformTex = ProceduralTextures.getCamoFabricTexture(camoVariant);
  const polymerBump = ProceduralTextures.getSurfaceBumpTexture('polymer');
  const polymerNormal = ProceduralTextures.getSurfaceNormalTexture('polymer');
  const metalNormal = ProceduralTextures.getSurfaceNormalTexture('metal');
  const propAO = ProceduralTextures.getSurfaceAOTexture('prop');

  const uniformMat = createPBRPhysicalMaterial({
    albedoMap: uniformTex,
    normalMap: polymerNormal,
    normalScale: 0.45,
    roughnessMap: polymerBump,
    roughness: 0.84,
    metalness: 0.06,
    aoMap: propAO,
    aoMapIntensity: 0.55,
    sheen: 0.35,
    sheenRoughness: 0.78,
    sheenColor: 0x334155,
  });

  const vestColor = isCommander ? 0x18181b : 0x272a24;
  const armorMat = createPBRStandardMaterial({
    color: vestColor,
    normalMap: polymerNormal,
    normalScale: 0.55,
    roughnessMap: polymerBump,
    roughness: 0.55,
    metalness: 0.35,
    aoMap: propAO,
    aoMapIntensity: 0.65,
  });

  const helmetMat = createPBRPhysicalMaterial({
    color: isCommander ? 0x111827 : 0x262b25,
    normalMap: polymerNormal,
    normalScale: 0.5,
    roughnessMap: polymerBump,
    roughness: 0.48,
    metalness: 0.42,
    clearcoat: 0.25,
    clearcoatRoughness: 0.35,
  });

  const bootMat = createPBRStandardMaterial({
    color: 0x141413,
    normalMap: polymerNormal,
    normalScale: 0.4,
    roughness: 0.78,
    metalness: 0.15,
  });

  const factionBandColor = isCommander
    ? 0xdc2626
    : personality === EnemyPersonality.Elite
      ? 0xb91c1c
      : personality === EnemyPersonality.Assault
        ? 0xd97706
        : 0x1d4ed8;

  const armbandMat = createPBRStandardMaterial({
    color: factionBandColor,
    roughness: 0.6,
    metalness: 0.1,
  });

  const visorMat = createPBRPhysicalMaterial({
    color: 0x111827,
    emissive: isCommander ? 0xef4444 : 0x38bdf8,
    emissiveIntensity: isCommander ? 0.9 : 0.6,
    roughness: 0.14,
    metalness: 0.88,
    clearcoat: 0.9,
    clearcoatRoughness: 0.08,
    ior: 1.55,
  });

  const gunMat = createPBRPhysicalMaterial({
    color: 0x18181b,
    normalMap: metalNormal,
    normalScale: 0.4,
    roughness: 0.32,
    metalness: 0.85,
    anisotropy: 0.6,
  });

  // Ground contact shadow (marked as non-hitbox)
  const contactShadow = createContactShadowPlane(1.15, 1.15);
  contactShadow.userData.ignoreRaycast = true;
  group.add(contactShadow);

  // 1. Left & Right Articulated Legs
  const leftLegGroup = new THREE.Group();
  leftLegGroup.position.set(-0.14, 0.78, 0);
  const thighGeo = new THREE.BoxGeometry(0.19, 0.44, 0.21);
  const shinGeo = new THREE.BoxGeometry(0.16, 0.38, 0.18);
  const bootGeo = new THREE.BoxGeometry(0.17, 0.14, 0.27);

  const leftThigh = new THREE.Mesh(thighGeo, uniformMat);
  leftThigh.position.y = -0.2;
  leftThigh.castShadow = true;
  const leftKneePad = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.11, 0.22), armorMat);
  leftKneePad.position.set(0, -0.4, 0.02);
  const leftShin = new THREE.Mesh(shinGeo, uniformMat);
  leftShin.position.y = -0.56;
  leftShin.castShadow = true;
  const leftBoot = new THREE.Mesh(bootGeo, bootMat);
  leftBoot.position.set(0, -0.72, -0.03);
  leftLegGroup.add(leftThigh, leftKneePad, leftShin, leftBoot);
  group.add(leftLegGroup);

  const rightLegGroup = new THREE.Group();
  rightLegGroup.position.set(0.14, 0.78, 0);
  const rightThigh = new THREE.Mesh(thighGeo, uniformMat);
  rightThigh.position.y = -0.2;
  rightThigh.castShadow = true;
  const rightKneePad = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.11, 0.22), armorMat);
  rightKneePad.position.set(0, -0.4, 0.02);
  const rightShin = new THREE.Mesh(shinGeo, uniformMat);
  rightShin.position.y = -0.56;
  rightShin.castShadow = true;
  const rightBoot = new THREE.Mesh(bootGeo, bootMat);
  rightBoot.position.set(0, -0.72, -0.03);
  const holster = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.14), armorMat);
  holster.position.set(0.11, -0.22, 0);
  rightLegGroup.add(rightThigh, rightKneePad, rightShin, rightBoot, holster);
  group.add(rightLegGroup);

  // 2. Torso Group
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 0.82, 0);

  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.28), armorMat);
  pelvis.position.y = 0.06;
  torsoGroup.add(pelvis);

  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.56, 0.3), uniformMat);
  chest.position.y = 0.38;
  chest.castShadow = true;
  chest.receiveShadow = true;
  torsoGroup.add(chest);

  const plateCarrier = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.46, 0.34), armorMat);
  plateCarrier.position.y = 0.4;
  plateCarrier.castShadow = true;
  torsoGroup.add(plateCarrier);

  for (let i = -1; i <= 1; i++) {
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.16, 0.08), armorMat);
    pouch.position.set(i * 0.14, 0.32, -0.19);
    torsoGroup.add(pouch);
  }

  const rucksack = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.2), armorMat);
  rucksack.position.set(0, 0.4, 0.24);
  rucksack.castShadow = true;
  torsoGroup.add(rucksack);

  // 3. Arms & Weapon
  const leftArmGroup = new THREE.Group();
  leftArmGroup.position.set(-0.32, 0.58, 0);
  const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.16), uniformMat);
  upperArm.position.set(0, -0.1, -0.08);
  upperArm.rotation.x = Math.PI / 3.2;
  const armbandL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.08, 0.17), armbandMat);
  armbandL.position.set(0, -0.06, -0.06);
  armbandL.rotation.x = Math.PI / 3.2;
  const forearmL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 0.14), uniformMat);
  forearmL.position.set(0.1, -0.18, -0.28);
  forearmL.rotation.x = Math.PI / 2.2;
  forearmL.rotation.z = -0.35;
  leftArmGroup.add(upperArm, armbandL, forearmL);
  torsoGroup.add(leftArmGroup);

  const rightArmGroup = new THREE.Group();
  rightArmGroup.position.set(0.32, 0.58, 0);
  const upperArmR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.16), uniformMat);
  upperArmR.position.set(0, -0.1, -0.08);
  upperArmR.rotation.x = Math.PI / 3.2;
  const armbandR = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.08, 0.17), armbandMat);
  armbandR.position.set(0, -0.06, -0.06);
  armbandR.rotation.x = Math.PI / 3.2;
  const forearmR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 0.14), uniformMat);
  forearmR.position.set(-0.06, -0.16, -0.26);
  forearmR.rotation.x = Math.PI / 2.1;

  const rifleReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.13, 0.62), gunMat);
  rifleReceiver.position.set(-0.08, -0.12, -0.45);
  const rifleBarrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.36, 8),
    gunMat
  );
  rifleBarrel.rotation.x = Math.PI / 2;
  rifleBarrel.position.set(-0.08, -0.09, -0.82);
  const rifleMag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.09), gunMat);
  rifleMag.position.set(-0.08, -0.22, -0.42);
  rifleMag.rotation.x = 0.22;

  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(-0.08, -0.09, -1.02);

  rightArmGroup.add(upperArmR, armbandR, forearmR, rifleReceiver, rifleBarrel, rifleMag, muzzlePoint);
  torsoGroup.add(rightArmGroup);

  // 4. Ballistic Helmet & Balaclava Head
  const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.32), uniformMat);
  headMesh.position.set(0, 0.84, 0);
  headMesh.castShadow = true;
  headMesh.userData.isHeadshot = true;
  headMesh.userData.hitZone = 'head';
  torsoGroup.add(headMesh);

  const helmetDome = new THREE.Mesh(
    new THREE.SphereGeometry(0.21, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
    helmetMat
  );
  helmetDome.position.set(0, 0.87, 0);
  helmetDome.castShadow = true;
  helmetDome.userData.isHeadshot = true;
  helmetDome.userData.hitZone = 'head';
  torsoGroup.add(helmetDome);

  const earPro = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.1, 0.12), bootMat);
  earPro.position.set(0, 0.84, 0.02);
  earPro.userData.isHeadshot = true;
  earPro.userData.hitZone = 'head';
  torsoGroup.add(earPro);

  const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.09, 0.08), visorMat);
  visorMesh.position.set(0, 0.85, -0.15);
  visorMesh.userData.isHeadshot = true;
  visorMesh.userData.hitZone = 'head';
  torsoGroup.add(visorMesh);

  group.add(torsoGroup);

  if (isCommander) {
    group.scale.set(1.08, 1.08, 1.08);
  }

  return {
    group,
    headMesh,
    visorMesh,
    torsoGroup,
    leftLegGroup,
    rightLegGroup,
    leftArmGroup,
    rightArmGroup,
    muzzlePoint,
  };
}

/**
 * Builds the complete Enemy Character Rig including overhead billboarded tactical health bar,
 * AI state crystal, and per-mesh hitzone metadata (`enemyId`, `hitZone: 'head' | 'body'`).
 */
export function createEnemyCharacterModel(
  enemyId: string,
  personality: EnemyPersonality,
  isCommander = false
): EnemyMeshRig {
  const soldier = createEnemySoldierModel(personality, isCommander);

  // Tag all soldier body/head meshes with enemyId and hitZone for raycast ballistics
  soldier.group.traverse((child) => {
    if (child instanceof THREE.Mesh && !child.userData.ignoreRaycast) {
      ensureGeometryUV2ForAO(child.geometry);
      child.userData.enemyId = enemyId;
      if (!child.userData.hitZone) {
        child.userData.hitZone = 'body';
      }
    }
  });

  // Overhead HUD Group (Health Bar + AI State Crystal using PBR Emissive Standard Materials)
  const hudGroup = new THREE.Group();
  hudGroup.position.set(0, 2.08, 0);

  const barBg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.56, 0.065),
    createPBRStandardMaterial({
      color: 0x090d16,
      roughness: 0.9,
      metalness: 0.1,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.78,
    })
  );
  barBg.userData.ignoreRaycast = true;
  hudGroup.add(barBg);

  const fillColor = isCommander ? 0xf59e0b : 0xef4444;
  const healthBarFill = new THREE.Mesh(
    new THREE.PlaneGeometry(0.52, 0.042),
    createPBRStandardMaterial({
      color: fillColor,
      emissive: fillColor,
      emissiveIntensity: 1.2,
      roughness: 0.3,
      metalness: 0.1,
      side: THREE.DoubleSide,
    })
  );
  healthBarFill.position.z = 0.005;
  healthBarFill.userData.ignoreRaycast = true;
  hudGroup.add(healthBarFill);

  const stateIndicatorMesh = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.055, 0),
    createPBRStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x38bdf8,
      emissiveIntensity: 1.35,
      roughness: 0.2,
      metalness: 0.3,
    })
  );
  stateIndicatorMesh.position.set(0, 0.12, 0);
  stateIndicatorMesh.userData.ignoreRaycast = true;
  hudGroup.add(stateIndicatorMesh);

  soldier.group.add(hudGroup);

  return {
    root: soldier.group,
    bodyGroup: soldier.torsoGroup,
    leftLeg: soldier.leftLegGroup,
    rightLeg: soldier.rightLegGroup,
    headMesh: soldier.headMesh,
    visorMesh: soldier.visorMesh,
    healthBarFill,
    stateIndicatorMesh,
    muzzlePoint: soldier.muzzlePoint,
  };
}

/**
 * Builds an AAA-grade First-Person Weapon & Gloved Operator Hands Rig with PBR Albedo, Normal,
 * Roughness, and Ambient Occlusion Maps (`MeshStandardMaterial` & `MeshPhysicalMaterial`),
 * sculpted Upper/Lower Receivers, Ejection Port, Charging Handle, M-LOK Ventilated Handguard,
 * and Modular Attachments (`optic`, `barrel`, `magazine`, `underbarrel`).
 */
export function createFirstPersonWeaponModel(
  weaponId: WeaponId,
  attachments?: WeaponAttachmentConfig
): {
  group: THREE.Group;
  muzzlePoint: THREE.Object3D;
  ejectionPoint: THREE.Object3D;
  magazineMesh: THREE.Mesh;
} {
  const group = new THREE.Group();

  const metalBump = ProceduralTextures.getSurfaceBumpTexture('metal');
  const metalNormal = ProceduralTextures.getSurfaceNormalTexture('metal');
  const polymerBump = ProceduralTextures.getSurfaceBumpTexture('polymer');
  const polymerNormal = ProceduralTextures.getSurfaceNormalTexture('polymer');
  const propAO = ProceduralTextures.getSurfaceAOTexture('prop');

  const gunMetalMat = createPBRPhysicalMaterial({
    color: 0x26292e,
    normalMap: metalNormal,
    normalScale: 0.45,
    roughnessMap: metalBump,
    roughness: 0.34,
    metalness: 0.88,
    aoMap: propAO,
    aoMapIntensity: 0.6,
    anisotropy: 0.65,
    clearcoat: 0.2,
    clearcoatRoughness: 0.3,
  });

  const anodizedReceiverMat = createPBRPhysicalMaterial({
    color: 0x1c1f24,
    normalMap: metalNormal,
    normalScale: 0.35,
    roughnessMap: metalBump,
    roughness: 0.28,
    metalness: 0.92,
    aoMap: propAO,
    aoMapIntensity: 0.65,
    anisotropy: 0.75,
    clearcoat: 0.3,
    clearcoatRoughness: 0.22,
  });

  const darkSteelMat = createPBRPhysicalMaterial({
    color: 0x121417,
    normalMap: metalNormal,
    normalScale: 0.45,
    roughnessMap: metalBump,
    roughness: 0.24,
    metalness: 0.94,
    anisotropy: 0.7,
  });

  const boltChromeMat = createPBRPhysicalMaterial({
    color: 0x94a3b8,
    normalMap: metalNormal,
    normalScale: 0.2,
    roughness: 0.16,
    metalness: 0.96,
    anisotropy: 0.85,
    clearcoat: 0.5,
    clearcoatRoughness: 0.1,
  });

  const polymerMat = createPBRStandardMaterial({
    color:
      weaponId === 'srs99_longbow'
        ? 0x364232
        : weaponId === 'm870_breacher'
          ? 0x27272a
          : 0x1f2226,
    normalMap: polymerNormal,
    normalScale: 0.55,
    roughnessMap: polymerBump,
    roughness: 0.68,
    metalness: 0.14,
    aoMap: propAO,
    aoMapIntensity: 0.55,
  });

  const tanFurnitureMat = createPBRStandardMaterial({
    color: 0x78664e,
    normalMap: polymerNormal,
    normalScale: 0.55,
    roughnessMap: polymerBump,
    roughness: 0.64,
    metalness: 0.12,
    aoMap: propAO,
    aoMapIntensity: 0.55,
  });

  const reticleMat = createPBRStandardMaterial({
    color: 0x10b981,
    emissive: 0x10b981,
    emissiveIntensity: 2.2,
    roughness: 0.1,
    metalness: 0.0,
  });

  const redReticleMat = createPBRStandardMaterial({
    color: 0xef4444,
    emissive: 0xef4444,
    emissiveIntensity: 2.2,
    roughness: 0.1,
    metalness: 0.0,
  });

  const glassLensMat = createPBRPhysicalMaterial({
    color: 0x0ea5e9,
    emissive: 0x0369a1,
    emissiveIntensity: 0.35,
    roughness: 0.04,
    metalness: 0.15,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    ior: 1.55,
    reflectivity: 0.9,
    transparent: true,
    opacity: 0.42,
  });

  // Operator Tactical Gloves & Camo Sleeves
  const gloveLeatherMat = createPBRPhysicalMaterial({
    color: 0x1c1b18,
    normalMap: polymerNormal,
    normalScale: 0.5,
    roughnessMap: polymerBump,
    roughness: 0.72,
    metalness: 0.08,
    sheen: 0.25,
    sheenRoughness: 0.7,
  });

  const gloveTanPadMat = createPBRPhysicalMaterial({
    color: 0x856d4d,
    normalMap: polymerNormal,
    normalScale: 0.55,
    roughnessMap: polymerBump,
    roughness: 0.78,
    metalness: 0.05,
    sheen: 0.3,
    sheenRoughness: 0.75,
  });

  const sleeveFabricMat = createPBRPhysicalMaterial({
    albedoMap: ProceduralTextures.getCamoFabricTexture('specops'),
    normalMap: polymerNormal,
    normalScale: 0.45,
    roughnessMap: polymerBump,
    roughness: 0.86,
    metalness: 0.04,
    sheen: 0.35,
    sheenRoughness: 0.8,
  });

  const isPistol = weaponId === 'p226_tactical';
  const isSniper = weaponId === 'srs99_longbow';
  const isShotgun = weaponId === 'm870_breacher';
  const isSmg = weaponId === 'k7_vector';

  const bodyLen = isPistol ? 0.24 : isSmg ? 0.42 : isSniper ? 0.74 : 0.56;
  const barrelLen = isPistol ? 0.14 : isSmg ? 0.22 : isSniper ? 0.56 : 0.38;

  // 1. Sculpted Upper & Lower Receiver Assembly
  const upperReceiver = new THREE.Mesh(
    new THREE.BoxGeometry(isPistol ? 0.046 : 0.064, isPistol ? 0.048 : 0.068, bodyLen),
    anodizedReceiverMat
  );
  upperReceiver.position.set(0, 0.018, 0);
  group.add(upperReceiver);

  const lowerReceiver = new THREE.Mesh(
    new THREE.BoxGeometry(
      isPistol ? 0.042 : 0.058,
      isPistol ? 0.032 : 0.056,
      bodyLen * (isPistol ? 0.85 : 0.65)
    ),
    weaponId === 'vx47_carbine' ? tanFurnitureMat : polymerMat
  );
  lowerReceiver.position.set(0, -0.032, bodyLen * 0.08);
  group.add(lowerReceiver);

  // Ejection port & chrome bolt carrier detail on right side
  const ejectionPort = new THREE.Mesh(
    new THREE.BoxGeometry(0.008, 0.024, isPistol ? 0.045 : 0.075),
    boltChromeMat
  );
  ejectionPort.position.set(isPistol ? 0.021 : 0.03, 0.022, -0.02);
  group.add(ejectionPort);

  // Rear T-Charging Handle & Forward Assist
  if (!isPistol) {
    const chargingHandle = new THREE.Mesh(
      new THREE.BoxGeometry(0.052, 0.016, 0.035),
      darkSteelMat
    );
    chargingHandle.position.set(0, 0.042, bodyLen * 0.46);
    const sideBoltRelease = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, 0.026, 0.028),
      darkSteelMat
    );
    sideBoltRelease.position.set(-0.032, -0.01, 0.02);
    group.add(chargingHandle, sideBoltRelease);
  }

  // 2. Ergonomic Pistol Grip & Trigger Guard
  const grip = new THREE.Mesh(
    new THREE.BoxGeometry(0.046, 0.135, 0.068),
    weaponId === 'vx47_carbine' ? tanFurnitureMat : polymerMat
  );
  grip.position.set(0, -0.092, isPistol ? 0.05 : 0.12);
  grip.rotation.x = 0.28;
  group.add(grip);

  const triggerGuard = new THREE.Mesh(
    new THREE.BoxGeometry(0.018, 0.028, 0.065),
    darkSteelMat
  );
  triggerGuard.position.set(0, -0.058, isPistol ? 0.01 : 0.065);
  group.add(triggerGuard);

  // 3. Free-Float M-LOK Handguard / Shotgun Pump Action Forend
  const handguardLen = bodyLen * 0.56;
  const handguard = new THREE.Mesh(
    new THREE.BoxGeometry(isShotgun ? 0.068 : 0.058, isShotgun ? 0.058 : 0.062, handguardLen),
    isShotgun ? polymerMat : gunMetalMat
  );
  handguard.position.set(0, 0.012, -bodyLen * 0.52);
  group.add(handguard);

  if (!isPistol) {
    for (let v = 0; v < 6; v++) {
      const ventSlotTop = new THREE.Mesh(
        new THREE.BoxGeometry(0.062, 0.016, 0.028),
        darkSteelMat
      );
      ventSlotTop.position.set(0, 0.018, -bodyLen * 0.26 - v * 0.05);
      group.add(ventSlotTop);
    }
  }

  // Side Laser / IR Aiming Module (PEQ-15 style box on tactical rifles/SMGs)
  if (!isPistol && !isShotgun) {
    const peqBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.036, 0.026, 0.078),
      tanFurnitureMat
    );
    peqBox.position.set(0.034, 0.028, -bodyLen * 0.58);
    const peqLens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.005, 0.012, 8),
      reticleMat
    );
    peqLens.rotation.x = Math.PI / 2;
    peqLens.position.set(0.038, 0.028, -bodyLen * 0.58 - 0.042);
    group.add(peqBox, peqLens);
  }

  // Optional Vertical Foregrip Attachment
  if (!isPistol && attachments?.underbarrel === 'foregrip') {
    const foregripMount = new THREE.Mesh(
      new THREE.BoxGeometry(0.036, 0.02, 0.045),
      darkSteelMat
    );
    foregripMount.position.set(0, -0.022, -bodyLen * 0.45);
    const foregrip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.019, 0.016, 0.095, 12),
      weaponId === 'vx47_carbine' ? tanFurnitureMat : polymerMat
    );
    foregrip.position.set(0, -0.068, -bodyLen * 0.45);
    group.add(foregripMount, foregrip);
  }

  // 4. Machined Picatinny Top Rail Ribs
  const railSlotCount = isPistol ? 4 : 14;
  for (let r = 0; r < railSlotCount; r++) {
    const tooth = new THREE.Mesh(
      new THREE.BoxGeometry(0.046, 0.012, 0.016),
      darkSteelMat
    );
    tooth.position.set(0, 0.058, 0.15 - r * 0.032);
    group.add(tooth);
  }

  // 5. Heavy Fluted Barrel, Gas Block & Muzzle Brake / Suppressor
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.017, barrelLen, 14),
    darkSteelMat
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -(bodyLen * 0.5 + barrelLen * 0.42));
  group.add(barrel);

  if (isShotgun) {
    // Under-barrel tubular magazine for M870 shotgun
    const magTube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, barrelLen * 0.92, 12),
      gunMetalMat
    );
    magTube.rotation.x = Math.PI / 2;
    magTube.position.set(0, -0.008, -(bodyLen * 0.5 + barrelLen * 0.38));
    group.add(magTube);
  }

  const hasSuppressor = isPistol || attachments?.barrel === 'suppressor';
  const muzzleLen = hasSuppressor ? 0.19 : 0.09;
  const muzzleRad = hasSuppressor ? 0.025 : 0.019;
  const muzzleDevice = new THREE.Mesh(
    new THREE.CylinderGeometry(muzzleRad, muzzleRad, muzzleLen, 14),
    hasSuppressor ? darkSteelMat : gunMetalMat
  );
  muzzleDevice.rotation.x = Math.PI / 2;
  muzzleDevice.position.set(0, 0.02, -(bodyLen * 0.5 + barrelLen * 0.88));
  group.add(muzzleDevice);

  // 6. Detachable Magazine with Molded Ribs
  const isExtendedMag = attachments?.magazine === 'extended';
  const magHeight = (isPistol ? 0.13 : isSmg ? 0.22 : 0.19) * (isExtendedMag ? 1.28 : 1.0);
  const magazineMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.044, magHeight, isSniper ? 0.11 : isSmg ? 0.052 : 0.078),
    isShotgun ? darkSteelMat : polymerMat
  );
  if (!isShotgun) {
    magazineMesh.position.set(
      0,
      -0.11 - (isExtendedMag ? 0.024 : 0),
      isPistol ? 0.05 : isSmg ? -0.09 : -0.05
    );
    magazineMesh.rotation.x = isPistol ? 0.28 : isSmg ? -0.26 : -0.18;
  } else {
    magazineMesh.scale.set(0.6, 0.22, 3.8);
    magazineMesh.position.set(0, -0.015, -bodyLen * 0.58);
  }
  group.add(magazineMesh);

  // 7. Sights & Optics (Adapts to equipped Optic Attachment)
  const opticChoice = attachments?.optic || (isSniper ? 'acog' : isPistol ? 'iron' : 'red_dot');

  if (isSniper || opticChoice === 'acog') {
    const scopeMount = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.036, 0.16), darkSteelMat);
    scopeMount.position.set(0, 0.072, -0.02);
    const scopeTube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.027, 0.024, isSniper ? 0.31 : 0.2, 18),
      gunMetalMat
    );
    scopeTube.rotation.x = Math.PI / 2;
    scopeTube.position.set(0, 0.096, -0.02);
    const objectiveBell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.033, 0.027, 0.065, 18),
      anodizedReceiverMat
    );
    objectiveBell.rotation.x = Math.PI / 2;
    objectiveBell.position.set(0, 0.096, isSniper ? -0.16 : -0.11);
    const turretTop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.022, 12),
      darkSteelMat
    );
    turretTop.position.set(0, 0.125, -0.02);
    const eyepiece = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.052, 18),
      polymerMat
    );
    eyepiece.rotation.x = Math.PI / 2;
    eyepiece.position.set(0, 0.096, isSniper ? 0.115 : 0.078);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.025, 18), glassLensMat);
    lens.position.set(0, 0.096, isSniper ? 0.142 : 0.105);
    const crossReticle = new THREE.Mesh(
      new THREE.RingGeometry(0.002, 0.005, 16),
      redReticleMat
    );
    crossReticle.position.set(0, 0.096, isSniper ? 0.143 : 0.106);
    group.add(scopeMount, scopeTube, objectiveBell, turretTop, eyepiece, lens, crossReticle);
  } else if (!isPistol && (opticChoice === 'red_dot' || opticChoice === 'holo')) {
    const opticBase = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.022, 0.095), darkSteelMat);
    opticBase.position.set(0, 0.068, 0.01);

    const hoodLeft = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.046, 0.078), gunMetalMat);
    hoodLeft.position.set(-0.023, 0.095, 0.01);
    const hoodRight = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.046, 0.078), gunMetalMat);
    hoodRight.position.set(0.023, 0.095, 0.01);
    const hoodTop = new THREE.Mesh(new THREE.BoxGeometry(0.053, 0.007, 0.078), gunMetalMat);
    hoodTop.position.set(0, 0.116, 0.01);

    const glassPane = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.038), glassLensMat);
    glassPane.position.set(0, 0.095, 0.01);

    const holoDot = new THREE.Mesh(
      new THREE.RingGeometry(0.0025, 0.0048, 14),
      opticChoice === 'red_dot' ? redReticleMat : reticleMat
    );
    holoDot.position.set(0, 0.095, 0.012);

    const frontSightHood = new THREE.Mesh(
      new THREE.BoxGeometry(0.024, 0.046, 0.018),
      darkSteelMat
    );
    frontSightHood.position.set(0, 0.072, -bodyLen * 0.78);

    group.add(opticBase, hoodLeft, hoodRight, hoodTop, glassPane, holoDot, frontSightHood);
  } else {
    const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.018, 0.016), darkSteelMat);
    rearSight.position.set(0, 0.065, 0.08);
    const glowDot = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.006, 0.004), reticleMat);
    glowDot.position.set(0, 0.067, 0.089);
    group.add(rearSight, glowDot);
  }

  // 8. Tactical Adjustable Buttstock
  if (!isPistol) {
    const bufferTube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.22, 12),
      darkSteelMat
    );
    bufferTube.rotation.x = Math.PI / 2;
    bufferTube.position.set(0, 0.01, bodyLen * 0.5 + 0.09);

    const cheekRest = new THREE.Mesh(
      new THREE.BoxGeometry(0.052, 0.118, 0.21),
      weaponId === 'vx47_carbine' ? tanFurnitureMat : polymerMat
    );
    cheekRest.position.set(0, -0.018, bodyLen * 0.5 + 0.11);

    const rubberButtPad = new THREE.Mesh(
      new THREE.BoxGeometry(0.054, 0.124, 0.022),
      darkSteelMat
    );
    rubberButtPad.position.set(0, -0.018, bodyLen * 0.5 + 0.22);
    group.add(bufferTube, cheekRest, rubberButtPad);
  }

  // 9. FIRST-PERSON OPERATOR GLOVED HANDS, ARTICULATED FINGERS & FOREARM SLEEVES
  const leftHandGroup = new THREE.Group();
  leftHandGroup.position.set(
    isPistol ? -0.025 : -0.032,
    isPistol ? -0.085 : -0.038,
    isPistol ? 0.03 : -bodyLen * 0.44
  );

  const leftPalm = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.068, 0.095), gloveLeatherMat);
  const leftKnucklePad = new THREE.Mesh(
    new THREE.BoxGeometry(0.069, 0.044, 0.076),
    gloveTanPadMat
  );
  leftKnucklePad.position.set(-0.004, 0.012, 0);

  // Sculpted wrapped fingers gripping the handguard
  for (let f = 0; f < 4; f++) {
    const finger = new THREE.Mesh(
      new THREE.BoxGeometry(0.028, 0.018, 0.019),
      gloveLeatherMat
    );
    finger.position.set(0.024, -0.015 + f * 0.004, -0.032 + f * 0.022);
    leftHandGroup.add(finger);
  }

  const leftThumb = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.028, 0.065), gloveLeatherMat);
  leftThumb.position.set(0.018, 0.038, -0.01);
  leftThumb.rotation.z = -0.35;

  const wristWatch = new THREE.Mesh(
    new THREE.CylinderGeometry(0.046, 0.046, 0.024, 12),
    darkSteelMat
  );
  wristWatch.rotation.x = Math.PI / 2.4;
  wristWatch.rotation.z = -0.38;
  wristWatch.position.set(-0.042, -0.048, 0.072);

  const leftForearm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.044, 0.056, 0.38, 12),
    sleeveFabricMat
  );
  leftForearm.rotation.x = Math.PI / 2.4;
  leftForearm.rotation.z = -0.38;
  leftForearm.position.set(-0.09, -0.11, 0.18);

  leftHandGroup.add(leftPalm, leftKnucklePad, leftThumb, wristWatch, leftForearm);
  group.add(leftHandGroup);

  const rightHandGroup = new THREE.Group();
  rightHandGroup.position.set(0.022, -0.085, isPistol ? 0.06 : 0.11);

  const rightPalm = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.075, 0.085), gloveLeatherMat);
  const rightKnuckle = new THREE.Mesh(
    new THREE.BoxGeometry(0.066, 0.045, 0.068),
    gloveTanPadMat
  );
  rightKnuckle.position.set(0.005, 0.015, 0);

  const triggerFinger = new THREE.Mesh(
    new THREE.BoxGeometry(0.018, 0.018, 0.048),
    gloveLeatherMat
  );
  triggerFinger.position.set(-0.012, 0.022, -0.045);

  const rightForearm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.056, 0.36, 12),
    sleeveFabricMat
  );
  rightForearm.rotation.x = Math.PI / 2.2;
  rightForearm.rotation.z = 0.22;
  rightForearm.position.set(0.06, -0.08, 0.19);

  rightHandGroup.add(rightPalm, rightKnuckle, triggerFinger, rightForearm);
  group.add(rightHandGroup);

  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(0, 0.02, -(bodyLen * 0.5 + barrelLen * 0.96));
  group.add(muzzlePoint);

  const ejectionPoint = new THREE.Object3D();
  ejectionPoint.position.set(0.04, 0.026, -0.02);
  group.add(ejectionPoint);

  return { group, muzzlePoint, ejectionPoint, magazineMesh };
}

/**
 * Builds a multi-part 3D Interactive Mission Object or Collectible Pickup
 * (`intel_terminal`, `radar_jammer`, `ammo_crate`, `medkit_station`, `medkit_small`,
 *  `medkit_large`, `armor_plate`, `ammo_pack_*`, `supply_crate_tactical`, `security_door`)
 * with a true Three.js GLSL 'Glow Wall' (Through-Wall X-Ray + 3D Fresnel Outline) shader group.
 */
export function createInteractiveObjectModel(config: InteractiveObjectConfig): {
  group: THREE.Group;
  beaconLightMesh: THREE.Mesh;
  glowOutlineMesh: THREE.Object3D;
  lidMesh?: THREE.Mesh;
} {
  const group = new THREE.Group();
  group.position.set(config.position[0], config.position[1], config.position[2]);

  const metalBump = ProceduralTextures.getSurfaceBumpTexture('metal');
  const polymerBump = ProceduralTextures.getSurfaceBumpTexture('polymer');

  const baseMetal = new THREE.MeshStandardMaterial({
    color: 0x272a2e,
    bumpMap: metalBump,
    bumpScale: 0.005,
    roughness: 0.45,
    metalness: 0.76,
  });
  const trimMetal = new THREE.MeshStandardMaterial({
    color: 0x4b5563,
    bumpMap: metalBump,
    bumpScale: 0.004,
    roughness: 0.28,
    metalness: 0.86,
  });

  const isMedkit =
    config.type === 'medkit_station' ||
    config.type === 'medkit_small' ||
    config.type === 'medkit_large';
  const isArmor = config.type === 'armor_plate';
  const isAmmo =
    config.type === 'ammo_crate' ||
    config.type === 'ammo_pack_rifle' ||
    config.type === 'ammo_pack_shotgun' ||
    config.type === 'ammo_pack_pistol' ||
    config.type === 'ammo_pack_sniper';

  let glowColor = 0xf59e0b;
  if (isMedkit) glowColor = 0x10b981;
  else if (isArmor) glowColor = 0x38bdf8;
  else if (isAmmo) glowColor = 0xeab308;
  else if (config.type === 'radar_jammer') glowColor = 0xef4444;
  else if (config.type === 'supply_crate_tactical') glowColor = 0xa855f7;

  const beaconMat = new THREE.MeshStandardMaterial({
    color: glowColor,
    emissive: glowColor,
    emissiveIntensity: 1.35,
    roughness: 0.16,
    metalness: 0.5,
  });

  const glowRadius =
    config.type === 'medkit_small' || isArmor || config.type.startsWith('ammo_pack_')
      ? 0.54
      : 0.96;

  // Ground contact shadow plane under every pickup / terminal
  if (config.type !== 'security_door') {
    group.add(createContactShadowPlane(glowRadius * 2.1, glowRadius * 2.1));
  }

  let beaconLightMesh: THREE.Mesh;
  let lidMesh: THREE.Mesh | undefined;
  const silhouetteDescriptors: Array<{
    geometry: THREE.BufferGeometry;
    position: THREE.Vector3;
    rotation?: THREE.Euler;
    scale?: THREE.Vector3;
  }> = [];

  if (config.type === 'medkit_small' || config.type === 'medkit_large') {
    // Detailed 3D Hard-Case Medical Trauma Kit with Latches, Handle & Raised Red Cross
    const scale = config.type === 'medkit_large' ? 1.28 : 1.0;
    const medGroup = new THREE.Group();
    medGroup.position.y = 0.26;
    medGroup.scale.setScalar(scale);

    const whiteCaseMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      bumpMap: polymerBump,
      bumpScale: 0.004,
      roughness: 0.34,
      metalness: 0.15,
    });
    const redCrossMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      emissive: 0x991b1b,
      emissiveIntensity: 0.4,
      roughness: 0.35,
    });

    const boxGeo = new THREE.BoxGeometry(0.48, 0.19, 0.36);
    const box = new THREE.Mesh(boxGeo, whiteCaseMat);
    box.castShadow = true;
    box.receiveShadow = true;

    const rimBand = new THREE.Mesh(new THREE.BoxGeometry(0.49, 0.025, 0.37), trimMetal);
    const latchL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.02), baseMetal);
    latchL.position.set(-0.14, 0, 0.185);
    const latchR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.02), baseMetal);
    latchR.position.set(0.14, 0, 0.185);

    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.032, 0.065), redCrossMat);
    crossH.position.y = 0.095;
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.032, 0.22), redCrossMat);
    crossV.position.y = 0.095;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.05), baseMetal);
    handle.position.set(0, 0.01, 0.2);

    beaconLightMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.065, 0), beaconMat);
    beaconLightMesh.position.set(0, 0.25, 0);

    medGroup.add(box, rimBand, latchL, latchR, crossH, crossV, handle, beaconLightMesh);
    group.add(medGroup);

    silhouetteDescriptors.push({
      geometry: boxGeo,
      position: new THREE.Vector3(0, 0.26, 0),
      scale: new THREE.Vector3(scale, scale, scale),
    });
  } else if (config.type === 'armor_plate') {
    // Collectible Tactical SAPI Ballistic Ceramic Armor Plate Insert
    const plateMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      bumpMap: polymerBump,
      bumpScale: 0.006,
      roughness: 0.42,
      metalness: 0.68,
    });
    const plateGeo = new THREE.BoxGeometry(0.38, 0.45, 0.075);
    const plate = new THREE.Mesh(plateGeo, plateMat);
    plate.position.y = 0.32;
    plate.rotation.x = -0.25;
    plate.castShadow = true;

    const traumaPad = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.38, 0.09), baseMetal);
    traumaPad.position.y = 0.32;
    traumaPad.rotation.x = -0.25;

    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.41, 0.08, 0.085), beaconMat);
    strap.position.set(0, 0.32, 0);
    strap.rotation.x = -0.25;
    beaconLightMesh = strap;

    group.add(plate, traumaPad, beaconLightMesh);
    silhouetteDescriptors.push({
      geometry: plateGeo,
      position: new THREE.Vector3(0, 0.32, 0),
      rotation: new THREE.Euler(-0.25, 0, 0),
    });
  } else if (config.type.startsWith('ammo_pack_')) {
    // Military Steel Caliber Ammunition Can Pickup with Clasp & Carry Handle
    const ammoMat = new THREE.MeshStandardMaterial({
      color:
        config.type === 'ammo_pack_shotgun'
          ? 0x991b1b
          : config.type === 'ammo_pack_sniper'
            ? 0x78350f
            : config.type === 'ammo_pack_pistol'
              ? 0x1e3a8a
              : 0x365314,
      bumpMap: metalBump,
      bumpScale: 0.005,
      roughness: 0.48,
      metalness: 0.55,
    });
    const boxGeo = new THREE.BoxGeometry(0.44, 0.25, 0.26);
    const box = new THREE.Mesh(boxGeo, ammoMat);
    box.position.y = 0.22;
    box.castShadow = true;

    const lidCap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.045, 0.28), trimMetal);
    lidCap.position.y = 0.34;

    beaconLightMesh = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.16), beaconMat);
    beaconLightMesh.position.set(0, 0.37, 0);
    group.add(box, lidCap, beaconLightMesh);

    silhouetteDescriptors.push({
      geometry: boxGeo,
      position: new THREE.Vector3(0, 0.22, 0),
    });
  } else if (config.type === 'security_door') {
    const [dw, dh, dd] = config.doorSize || [3.2, 3.0, 0.32];
    const doorGeo = new THREE.BoxGeometry(dw, dh, dd);
    const doorPanel = new THREE.Mesh(doorGeo, baseMetal);
    doorPanel.position.y = dh / 2;
    doorPanel.castShadow = true;
    doorPanel.receiveShadow = true;
    lidMesh = doorPanel;

    beaconLightMesh = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, dd + 0.06), beaconMat);
    beaconLightMesh.position.set(0, dh * 0.6, 0);
    doorPanel.add(beaconLightMesh);
    group.add(doorPanel);

    silhouetteDescriptors.push({
      geometry: doorGeo,
      position: new THREE.Vector3(0, dh / 2, 0),
    });
  } else if (config.type === 'intel_terminal') {
    const deskGeo = new THREE.BoxGeometry(1.3, 0.92, 0.85);
    const desk = new THREE.Mesh(deskGeo, baseMetal);
    desk.position.y = 0.46;
    desk.castShadow = true;
    desk.receiveShadow = true;

    const ruggedCase = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.09, 0.48), trimMetal);
    ruggedCase.position.set(0, 0.96, 0);

    beaconLightMesh = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.04), beaconMat);
    beaconLightMesh.position.set(0, 1.18, -0.18);
    beaconLightMesh.rotation.x = 0.2;

    const whipAntenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.025, 1.05, 8),
      trimMetal
    );
    whipAntenna.position.set(0.46, 1.4, -0.26);

    group.add(desk, ruggedCase, beaconLightMesh, whipAntenna);
    silhouetteDescriptors.push({
      geometry: deskGeo,
      position: new THREE.Vector3(0, 0.46, 0),
    });
  } else if (config.type === 'radar_jammer') {
    const baseGeo = new THREE.BoxGeometry(1.75, 0.95, 1.75);
    const generatorBase = new THREE.Mesh(baseGeo, baseMetal);
    generatorBase.position.y = 0.475;
    generatorBase.castShadow = true;

    const mastGeo = new THREE.CylinderGeometry(0.24, 0.36, 3.2, 8);
    const latticeMast = new THREE.Mesh(mastGeo, trimMetal);
    latticeMast.position.y = 2.4;
    latticeMast.castShadow = true;

    const radarDish = new THREE.Mesh(
      new THREE.ConeGeometry(0.95, 0.5, 16, 1, true),
      trimMetal
    );
    radarDish.rotation.x = Math.PI / 3;
    radarDish.position.set(0, 3.6, 0.28);

    beaconLightMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 1), beaconMat);
    beaconLightMesh.position.set(0, 1.55, 0);

    group.add(generatorBase, latticeMast, radarDish, beaconLightMesh);
    silhouetteDescriptors.push(
      { geometry: baseGeo, position: new THREE.Vector3(0, 0.475, 0) },
      { geometry: mastGeo, position: new THREE.Vector3(0, 2.4, 0) }
    );
  } else {
    // Interactive Supply / Munitions / Medical Crate with Animatable Lid
    const crateTex = ProceduralTextures.getCratePanelTexture(
      config.type === 'supply_crate_tactical' ? '#3b1d5e' : '#2d3728',
      '#eab308'
    );
    const woodCrateMat = new THREE.MeshStandardMaterial({
      map: crateTex,
      bumpMap: polymerBump,
      bumpScale: 0.006,
      roughness: 0.68,
      metalness: 0.22,
    });
    const crateGeo = new THREE.BoxGeometry(1.4, 0.78, 0.92);
    const crateBox = new THREE.Mesh(crateGeo, woodCrateMat);
    crateBox.position.y = 0.39;
    crateBox.castShadow = true;

    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.14, 0.98), trimMetal);
    lid.position.y = 0.82;
    lidMesh = lid;

    beaconLightMesh = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 0.12), beaconMat);
    beaconLightMesh.position.set(0, 0.91, 0);

    group.add(crateBox, lid, beaconLightMesh);
    silhouetteDescriptors.push({
      geometry: crateGeo,
      position: new THREE.Vector3(0, 0.39, 0),
    });
  }

  const glowOutlineMesh = createGlowWallShaderGroup(
    silhouetteDescriptors,
    glowColor,
    glowRadius
  );
  group.add(glowOutlineMesh);

  return { group, beaconLightMesh, glowOutlineMesh, lidMesh };
}
