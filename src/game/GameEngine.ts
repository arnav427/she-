import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import {
  EnemyPersonality,
  GameMode,
  GameSettings,
  GrenadeType,
  HUDState,
  InteractiveObjectConfig,
  KillFeedEntry,
  MissionDefinition,
  MissionObjective,
  RadarBlip,
  SurfaceMaterialType,
  WeaponAttachmentConfig,
  WeaponClass,
  WeaponDefinition,
  WeaponId,
  WeaponRuntimeState,
} from '../types/game';
import {
  applyArmorPickup,
  applyMedkitHeal,
  applyWeaponAmmoPickup,
  calculateBallisticDamage,
  calculateExplosionDamage,
  DEFAULT_WEAPON_ATTACHMENTS,
  getEffectiveWeaponStats,
  WEAPON_DEFINITIONS,
} from '../combat/WeaponDefinitions';
import { CollisionWorld } from '../world/CollisionWorld';
import { EnvironmentBuilder, ExplosiveBarrelProp } from '../world/EnvironmentBuilder';
import {
  createFirstPersonWeaponModel,
  createInteractiveObjectModel,
  createPBRStandardMaterial,
  updateGlowWallShaderUniforms,
} from '../world/ProceduralModels';
import { EnemyNavigation } from '../ai/EnemyNavigation';
import { EnemyAgent, SmokeCloudVolume } from '../ai/EnemyAI';
import { AudioManager } from '../audio/AudioManager';

interface ActiveTracer {
  line: THREE.Line;
  life: number;
}

interface ActiveSpark {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
}

interface ActiveShellCasing {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  rotVel: THREE.Vector3;
  life: number;
}

interface ActiveGrenade {
  type: GrenadeType;
  mesh: THREE.Mesh;
  ringMesh: THREE.Mesh;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  fuseTimer: number;
}

interface ActiveShockwave {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

interface ActiveSmokeCloud extends SmokeCloudVolume {
  group: THREE.Group;
  life: number;
  maxLife: number;
}

interface RuntimeInteractable {
  config: InteractiveObjectConfig;
  group: THREE.Group;
  beaconMesh: THREE.Mesh;
  glowOutlineMesh: THREE.Object3D;
  lidMesh?: THREE.Mesh;
  used: boolean;
  doorOpen?: boolean;
}

const _raycaster = new THREE.Raycaster();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveWish = new THREE.Vector3();
const _muzzleWorld = new THREE.Vector3();
const _ejectWorld = new THREE.Vector3();
const _shootDir = new THREE.Vector3();
const _playerEye = new THREE.Vector3();
const _enemyEye = new THREE.Vector3();

const GRENADE_ORDER: GrenadeType[] = ['frag', 'smoke', 'flash', 'emp'];

export class GameEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private composer: EffectComposer | null = null;
  private ssaoPass: SSAOPass | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private fxaaPass: ShaderPass | null = null;

  private collisionWorld = new CollisionWorld();
  private navigation: EnemyNavigation;
  private audio: AudioManager;
  private settings: GameSettings;
  private weaponAttachments: Record<WeaponId, WeaponAttachmentConfig>;

  private mission: MissionDefinition;
  private objectives: MissionObjective[] = [];
  private enemies: EnemyAgent[] = [];
  private interactables: RuntimeInteractable[] = [];
  private explosiveBarrels: ExplosiveBarrelProp[] = [];
  private extractionRing: THREE.Mesh | null = null;
  private keyLight: THREE.DirectionalLight | null = null;
  private hemiLight: THREE.HemisphereLight | null = null;
  private dustParticles: THREE.Points | null = null;
  private baseHemiIntensity = 1.2;

  // Player state
  private playerPos = new THREE.Vector3(0, 0, 34);
  private playerVel = new THREE.Vector3();
  private playerYaw = 0;
  private playerPitch = 0;
  private isGrounded = true;
  private isCrouching = false;
  private isSprinting = false;
  private isAiming = false;
  private isFiringHeld = false;
  private currentEyeHeight = 1.62;
  private dashCooldown = 0;

  private health = 100;
  private maxHealth = 100;
  private armor = 50;
  private maxArmor = 100;
  private armorPlates = 1;
  private maxArmorPlates = 3;
  private medkitsCarried = 1;
  private maxMedkitsCarried = 3;
  private stamina = 100;
  private maxStamina = 100;

  // Tactical Gadgets: Scanner [V], Flashlight [F], Night Vision [N]
  private scannerCharges = 3;
  private maxScannerCharges = 3;
  private scannerActiveTimer = 0;
  private scannerCooldown = 0;
  private scannerWaveMesh: THREE.Mesh;

  private flashlightOn = false;
  private flashlightBattery = 100;
  private flashlightSpot: THREE.SpotLight;
  private flashlightTarget: THREE.Object3D;

  private nightVisionActive = false;
  private nightVisionBattery = 100;

  // Loadout & Weapon Runtime
  private activeSlot: 1 | 2 | 3 = 1;
  private slots: Record<
    1 | 2 | 3,
    {
      def: WeaponDefinition & { soundRadiusMeters: number; isSuppressed: boolean };
      attachments: WeaponAttachmentConfig;
      state: WeaponRuntimeState;
    }
  >;
  private weaponViewGroup = new THREE.Group();
  private activeWeaponMesh: THREE.Group | null = null;
  private activeMuzzlePoint: THREE.Object3D | null = null;
  private activeEjectionPoint: THREE.Object3D | null = null;
  private activeMagazineMesh: THREE.Mesh | null = null;
  private activeMagazineRestY = -0.11;
  private muzzleLight: THREE.PointLight;
  private muzzleFlashMesh: THREE.Mesh;
  private muzzleFlashTimer = 0;
  private recoilKickZ = 0;
  private recoilKickPitch = 0;
  private weaponBobPhase = 0;
  private stepSoundTimer = 0;

  // Multi-Type Grenade Inventory
  private activeGrenadeType: GrenadeType = 'frag';
  private grenadeInventory: Record<GrenadeType, number> = {
    frag: 2,
    smoke: 1,
    flash: 1,
    emp: 1,
  };
  private maxGrenadesPerType = 3;
  private grenadeCooldown = 0;
  private activeGrenades: ActiveGrenade[] = [];
  private activeShockwaves: ActiveShockwave[] = [];
  private activeSmokeClouds: ActiveSmokeCloud[] = [];

  // Visual FX pools
  private activeTracers: ActiveTracer[] = [];
  private activeSparks: ActiveSpark[] = [];
  private activeCasings: ActiveShellCasing[] = [];

  // Input state
  private keys: Record<string, boolean> = {};
  private isPointerLocked = false;
  private isPaused = false;
  private isDisposed = false;
  private missionEnded = false;

  // Telemetry & Match Stats
  private missionTimeSec = 0;
  private shotsFired = 0;
  private shotsHit = 0;
  private enemiesDefeated = 0;
  private headshots = 0;
  private damageReceived = 0;
  private stealthIntact = true;
  private survivalWave = 1;
  private waveCooldownTimer = 0;

  private hitMarkerType: 'none' | 'normal' | 'headshot' | 'kill' = 'none';
  private hitMarkerTimer = 0;
  private damageFlashIntensity = 0;
  private flashbangBlindIntensity = 0;
  private damageDirectionAngle: number | null = null;
  private interactionProgress = 0;
  private activePrompt: string | null = null;
  private activeInteractionSubtext: string | null = null;
  private statusToast: string | null = null;
  private statusToastTimer = 0;
  private killFeed: KillFeedEntry[] = [];

  private frameId = 0;
  private lastFrameTime = performance.now();
  private fps = 60;
  private hudUpdateAccum = 0;

  private onHudUpdate: (hud: HUDState) => void;
  private onPauseChange: (paused: boolean) => void;
  private onMissionFinish: (stats: {
    victory: boolean;
    failureReason?: string;
    completionTimeSec: number;
    enemiesDefeated: number;
    headshots: number;
    shotsFired: number;
    shotsHit: number;
    damageReceived: number;
    objectivesCompleted: number;
    totalObjectives: number;
    stealthBonusEarned: boolean;
    survivalWaveReached: number;
    matchToken?: string;
  }) => void;
  private onToggleObjectives: (visible: boolean) => void;

  constructor(options: {
    container: HTMLElement;
    mission: MissionDefinition;
    loadout: { primary: WeaponId; secondary: WeaponId; sidearm: WeaponId };
    weaponAttachments?: Record<WeaponId, WeaponAttachmentConfig>;
    settings: GameSettings;
    audio: AudioManager;
    onHudUpdate: (hud: HUDState) => void;
    onPauseChange: (paused: boolean) => void;
    onMissionFinish: GameEngine['onMissionFinish'];
    onToggleObjectives: (visible: boolean) => void;
  }) {
    this.container = options.container;
    this.mission = options.mission;
    this.settings = options.settings;
    this.weaponAttachments = options.weaponAttachments || DEFAULT_WEAPON_ATTACHMENTS;
    this.audio = options.audio;
    this.onHudUpdate = options.onHudUpdate;
    this.onPauseChange = options.onPauseChange;
    this.onMissionFinish = options.onMissionFinish;
    this.onToggleObjectives = options.onToggleObjectives;

    this.navigation = new EnemyNavigation(this.collisionWorld);

    // Software WebGL detection per Three.js skill
    this.isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl && this.settings.graphicsQuality !== 'low',
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.16;

    const qualityScale =
      this.settings.graphicsQuality === 'ultra'
        ? 1.0
        : this.settings.graphicsQuality === 'high'
          ? 1.0
          : this.settings.graphicsQuality === 'medium'
            ? 0.85
            : 0.72;
    const maxPixelRatio = this.isSoftwareGl
      ? 1
      : Math.min(window.devicePixelRatio, 2) * this.settings.resolutionScale * qualityScale;
    this.renderer.setPixelRatio(maxPixelRatio);
    const initWidth = this.container.clientWidth || window.innerWidth;
    const initHeight = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(initWidth, initHeight);
    this.renderer.shadowMap.enabled =
      !this.isSoftwareGl && this.settings.graphicsQuality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      this.settings.fov,
      initWidth / initHeight,
      0.08,
      260
    );
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // Image-Based Lighting (IBL): Load HDR environment map via RGBELoader + PMREMGenerator
    void EnvironmentBuilder.loadHDREnvironment(
      this.renderer,
      this.scene,
      this.mission.atmosphere || 'clear_daylight'
    );

    // Post-Processing Pipeline: EffectComposer -> RenderPass -> SSAOPass -> UnrealBloomPass -> FXAA -> OutputPass
    this.initPostProcessing(initWidth, initHeight);

    // First-person weapon viewmodel container attached to camera
    this.camera.add(this.weaponViewGroup);
    this.muzzleLight = new THREE.PointLight(0xf59e0b, 0, 6);
    this.camera.add(this.muzzleLight);

    // Tactical Flashlight SpotLight mounted to camera
    this.flashlightSpot = new THREE.SpotLight(0xf8fafc, 0, 42, Math.PI / 5.5, 0.45, 1.4);
    this.flashlightSpot.position.set(0.18, -0.1, -0.2);
    this.flashlightTarget = new THREE.Object3D();
    this.flashlightTarget.position.set(0, -0.05, -12);
    this.camera.add(this.flashlightSpot);
    this.camera.add(this.flashlightTarget);
    this.flashlightSpot.target = this.flashlightTarget;

    // Tactical Scanner expanding pulse ring (PBR Emissive Standard Material)
    this.scannerWaveMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1.35, 36),
      createPBRStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x38bdf8,
        emissiveIntensity: 2.2,
        roughness: 0.2,
        metalness: 0.1,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75,
      })
    );
    this.scannerWaveMesh.rotation.x = -Math.PI / 2;
    this.scannerWaveMesh.visible = false;
    this.scene.add(this.scannerWaveMesh);

    this.muzzleFlashMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.045, 0),
      createPBRStandardMaterial({
        color: 0xfef08a,
        emissive: 0xf59e0b,
        emissiveIntensity: 3.5,
        roughness: 0.15,
        metalness: 0.0,
        transparent: true,
        opacity: 0.9,
      })
    );
    this.muzzleFlashMesh.visible = false;
    this.weaponViewGroup.add(this.muzzleFlashMesh);

    // Hardcore mode resource rules
    const isHardcore = this.mission.mode === GameMode.Hardcore;
    if (isHardcore) {
      this.armor = 25;
      this.armorPlates = 0;
      this.medkitsCarried = 0;
      this.grenadeInventory = { frag: 1, smoke: 1, flash: 0, emp: 0 };
    }

    // Initialize weapon slots with attachment modifications
    const makeSlotState = (id: WeaponId) => {
      const baseDef = WEAPON_DEFINITIONS[id];
      const att = this.weaponAttachments[id] || DEFAULT_WEAPON_ATTACHMENTS[id];
      const effectiveDef = getEffectiveWeaponStats(baseDef, att);
      const reserveStart = isHardcore
        ? Math.round(effectiveDef.maxReserveAmmo * 0.5)
        : effectiveDef.maxReserveAmmo;
      return {
        def: effectiveDef,
        attachments: att,
        state: {
          id,
          currentMag: effectiveDef.magazineSize,
          effectiveMagSize: effectiveDef.magazineSize,
          reserveAmmo: reserveStart,
          isReloading: false,
          reloadTimer: 0,
          lastFireTime: -99,
        },
      };
    };

    this.slots = {
      1: makeSlotState(options.loadout.primary),
      2: makeSlotState(options.loadout.secondary),
      3: makeSlotState(options.loadout.sidearm),
    };

    this.initMissionWorld();
    this.equipSlot(1, true);
    this.bindEvents();
    this.audio.startAmbientDrone();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.emitHudState();
    this.startLoop();
  }

  private initPostProcessing(width: number, height: number): void {
    if (this.isSoftwareGl) return;

    const composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    composer.addPass(renderPass);

    // 1. SSAO Pass for realistic corner & contact shadows
    const ssaoPass = new SSAOPass(this.scene, this.camera, width, height);
    ssaoPass.kernelRadius = 0.55;
    ssaoPass.minDistance = 0.0015;
    ssaoPass.maxDistance = 0.12;
    ssaoPass.enabled =
      this.settings.graphicsQuality === 'high' || this.settings.graphicsQuality === 'ultra';
    composer.addPass(ssaoPass);
    this.ssaoPass = ssaoPass;

    // 2. UnrealBloomPass for subtle glowing highlights on tactical optics, beacons & muzzle flash
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      this.settings.graphicsQuality === 'ultra' ? 0.36 : 0.28,
      0.42,
      0.82
    );
    bloomPass.enabled = this.settings.graphicsQuality !== 'low';
    composer.addPass(bloomPass);
    this.bloomPass = bloomPass;

    // 3. FXAA Pass to smooth jagged polygon edges
    const fxaaPass = new ShaderPass(FXAAShader);
    const pixelRatio = this.renderer.getPixelRatio();
    fxaaPass.material.uniforms['resolution'].value.x = 1 / (width * pixelRatio);
    fxaaPass.material.uniforms['resolution'].value.y = 1 / (height * pixelRatio);
    fxaaPass.enabled = this.settings.graphicsQuality !== 'low';
    composer.addPass(fxaaPass);
    this.fxaaPass = fxaaPass;

    // 4. OutputPass for ACESFilmic tone mapping and sRGB color space conversion
    const outputPass = new OutputPass();
    composer.addPass(outputPass);

    this.composer = composer;
  }

  private initMissionWorld(): void {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const { extractionRing, explosiveBarrels, keyLight, hemiLight, dustParticles } =
      EnvironmentBuilder.build(
        this.scene,
        this.collisionWorld,
        this.mission,
        maxAniso,
        this.settings.graphicsQuality
      );
    this.extractionRing = extractionRing;
    this.explosiveBarrels = explosiveBarrels;
    this.keyLight = keyLight;
    this.hemiLight = hemiLight;
    this.dustParticles = dustParticles;
    this.baseHemiIntensity = hemiLight.intensity;

    // Set player spawn
    this.playerPos.set(
      this.mission.playerSpawn[0],
      this.mission.playerSpawn[1],
      this.mission.playerSpawn[2]
    );
    this.playerYaw = this.mission.playerSpawnYaw;
    this.playerPitch = 0;

    // Initialize objectives
    this.objectives = this.mission.objectives.map((o) => ({
      ...o,
      currentCount: 0,
      completed: false,
      failed: false,
    }));

    // Spawn interactive objects, pickups, supply crates, and doors
    this.interactables = this.mission.interactables.map((cfg) => {
      const { group, beaconLightMesh, glowOutlineMesh, lidMesh } =
        createInteractiveObjectModel(cfg);
      this.scene.add(group);

      const isSmallPickup =
        cfg.type === 'medkit_small' ||
        cfg.type === 'medkit_large' ||
        cfg.type === 'armor_plate' ||
        cfg.type.startsWith('ammo_pack_');

      if (cfg.type === 'security_door') {
        const [dw, dh, dd] = cfg.doorSize || [3.2, 3.0, 0.32];
        this.collisionWorld.addBox(
          `interact_${cfg.id}`,
          cfg.position[0],
          dh / 2,
          cfg.position[2],
          dw,
          dh,
          dd,
          { isCover: false, blocksVision: true, surfaceType: 'door' }
        );
      } else if (!isSmallPickup) {
        this.collisionWorld.addBox(
          `interact_${cfg.id}`,
          cfg.position[0],
          0.5,
          cfg.position[2],
          1.3,
          1.0,
          1.0,
          { isCover: true, blocksVision: false, surfaceType: 'metal' }
        );
      }

      return {
        config: cfg,
        group,
        beaconMesh: beaconLightMesh,
        glowOutlineMesh,
        lidMesh,
        used: false,
        doorOpen: false,
      };
    });

    // Spawn enemies
    this.enemies = this.mission.enemies.map((eCfg) => new EnemyAgent(eCfg, this.scene));

    if (this.mission.dynamicSeed) {
      this.showToast(`Dynamic Recon Active: ${this.mission.dynamicSeed}`);
    }
  }

  private showToast(msg: string, duration = 3.0): void {
    this.statusToast = msg;
    this.statusToastTimer = duration;
  }

  private equipSlot(slot: 1 | 2 | 3, silent = false): void {
    if (this.activeSlot !== slot) {
      this.slots[this.activeSlot].state.isReloading = false;
    }
    this.activeSlot = slot;
    const slotObj = this.slots[slot];

    if (this.activeWeaponMesh) {
      this.weaponViewGroup.remove(this.activeWeaponMesh);
    }

    const { group, muzzlePoint, ejectionPoint, magazineMesh } = createFirstPersonWeaponModel(
      slotObj.def.id,
      slotObj.attachments
    );
    this.activeWeaponMesh = group;
    this.activeMuzzlePoint = muzzlePoint;
    this.activeEjectionPoint = ejectionPoint;
    this.activeMagazineMesh = magazineMesh;
    this.activeMagazineRestY = magazineMesh.position.y;
    this.weaponViewGroup.add(group);

    this.recoilKickZ = 0.08;
    if (!silent) {
      this.audio.playWeaponSwitch();
    }
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    window.addEventListener('contextmenu', this.handleContextMenu);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
  }

  private unbindEvents(): void {
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('contextmenu', this.handleContextMenu);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
  }

  private handleResize = (): void => {
    if (!this.container || this.isDisposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setSize(w, h);
    }
    if (this.ssaoPass) {
      this.ssaoPass.setSize(w, h);
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(w, h);
    }
    if (this.fxaaPass) {
      const pixelRatio = this.renderer.getPixelRatio();
      this.fxaaPass.material.uniforms['resolution'].value.x = 1 / (w * pixelRatio);
      this.fxaaPass.material.uniforms['resolution'].value.y = 1 / (h * pixelRatio);
    }
  };

  private handleContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private handlePointerLockChange = (): void => {
    const locked = document.pointerLockElement === this.renderer.domElement;
    this.isPointerLocked = locked;
    if (!locked && !this.missionEnded && !this.isPaused) {
      this.setPaused(true);
    }
    this.emitHudState();
  };

  public requestPointerLock(): void {
    if (this.missionEnded) return;
    try {
      this.renderer.domElement.requestPointerLock();
    } catch {}
  }

  public setPaused(paused: boolean): void {
    this.isPaused = paused;
    this.isFiringHeld = false;
    this.audio.setPaused(paused);
    if (paused && document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }
    this.onPauseChange(paused);
    this.emitHudState();
  }

  public updateSettings(newSettings: GameSettings): void {
    this.settings = newSettings;
    this.audio.updateSettings(newSettings);
    this.camera.fov = this.isAiming
      ? this.slots[this.activeSlot].def.adsZoomFov
      : newSettings.fov;
    this.camera.updateProjectionMatrix();

    // Live Graphics Quality scaling without restarting the mission
    const qualityScale =
      newSettings.graphicsQuality === 'ultra'
        ? 1.0
        : newSettings.graphicsQuality === 'high'
          ? 1.0
          : newSettings.graphicsQuality === 'medium'
            ? 0.85
            : 0.72;
    const maxPixelRatio = this.isSoftwareGl
      ? 1
      : Math.min(window.devicePixelRatio, 2) * newSettings.resolutionScale * qualityScale;
    this.renderer.setPixelRatio(maxPixelRatio);

    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    if (this.composer) {
      this.composer.setSize(w, h);
    }
    if (this.ssaoPass) {
      this.ssaoPass.enabled =
        newSettings.graphicsQuality === 'high' || newSettings.graphicsQuality === 'ultra';
      this.ssaoPass.setSize(w, h);
    }
    if (this.bloomPass) {
      this.bloomPass.enabled = newSettings.graphicsQuality !== 'low';
      this.bloomPass.strength = newSettings.graphicsQuality === 'ultra' ? 0.36 : 0.28;
    }
    if (this.fxaaPass) {
      this.fxaaPass.enabled = newSettings.graphicsQuality !== 'low';
      this.fxaaPass.material.uniforms['resolution'].value.x = 1 / (w * maxPixelRatio);
      this.fxaaPass.material.uniforms['resolution'].value.y = 1 / (h * maxPixelRatio);
    }

    const shadowsOn = !this.isSoftwareGl && newSettings.graphicsQuality !== 'low';
    this.renderer.shadowMap.enabled = shadowsOn;
    if (this.keyLight) {
      this.keyLight.castShadow = shadowsOn;
    }
    if (this.dustParticles) {
      this.dustParticles.visible = newSettings.graphicsQuality !== 'low';
    }
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (this.missionEnded) return;

    if (e.code === 'Escape') {
      this.setPaused(!this.isPaused);
      return;
    }

    if (e.code === 'Tab') {
      e.preventDefault();
      this.onToggleObjectives(true);
      return;
    }

    if (this.isPaused) return;

    this.keys[e.code] = true;

    if (e.code === 'Digit1') this.equipSlot(1);
    if (e.code === 'Digit2') this.equipSlot(2);
    if (e.code === 'Digit3') this.equipSlot(3);
    if (e.code === 'Digit4' || e.code === 'KeyB') this.cycleGrenadeType();
    if (e.code === 'KeyR') this.startReload();
    if (e.code === 'KeyG') this.throwGrenade();
    if (e.code === 'KeyV') this.activateTacticalScanner();
    if (e.code === 'KeyF') this.toggleFlashlight();
    if (e.code === 'KeyN') this.toggleNightVision();
    if (e.code === 'KeyH') this.useCarriedMedkit();
    if (e.code === 'KeyT') this.useCarriedArmorPlate();
    if (e.code === 'KeyQ' || e.code === 'AltLeft') {
      e.preventDefault();
      this.triggerTacticalDash();
    }
    if (e.code === 'KeyC' || e.code === 'ControlLeft') {
      this.isCrouching = !this.isCrouching;
    }
    if (e.code === 'Space' && this.isGrounded) {
      this.playerVel.y = 6.6;
      this.isGrounded = false;
      this.isCrouching = false;
      this.audio.playJumpLand(false);
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keys[e.code] = false;
    if (e.code === 'Tab') {
      e.preventDefault();
      this.onToggleObjectives(false);
    }
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.isPointerLocked || this.isPaused || this.missionEnded) return;
    const sens = 0.0021 * this.settings.mouseSensitivity * (this.isAiming ? 0.6 : 1.0);
    const invert = this.settings.invertMouseY ? -1 : 1;

    this.playerYaw -= e.movementX * sens;
    this.playerPitch -= e.movementY * sens * invert;
    this.playerPitch = Math.max(-Math.PI / 2.15, Math.min(Math.PI / 2.15, this.playerPitch));
  };

  private handleMouseDown = (e: MouseEvent): void => {
    if (this.isPaused || this.missionEnded) return;
    if (!this.isPointerLocked) {
      this.requestPointerLock();
      return;
    }

    if (e.button === 0) {
      this.isFiringHeld = true;
      this.tryFireWeapon();
    } else if (e.button === 2) {
      this.isAiming = true;
    }
  };

  private handleMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) {
      this.isFiringHeld = false;
    } else if (e.button === 2) {
      this.isAiming = false;
    }
  };

  private cycleGrenadeType(): void {
    const idx = GRENADE_ORDER.indexOf(this.activeGrenadeType);
    this.activeGrenadeType = GRENADE_ORDER[(idx + 1) % GRENADE_ORDER.length];
    const labels: Record<GrenadeType, string> = {
      frag: 'M67 Fragmentation Grenade',
      smoke: 'M18 Tactical Smoke Grenade',
      flash: 'M84 Stun Flashbang',
      emp: 'EMP Electronic Disruptor',
    };
    this.audio.playWeaponSwitch();
    this.showToast(`Selected Ordnance: ${labels[this.activeGrenadeType]}`, 2.0);
  }

  private activateTacticalScanner(): void {
    if (this.scannerCooldown > 0) {
      this.showToast(`Tactical Scanner Recharging (${this.scannerCooldown.toFixed(1)}s)`, 1.8);
      return;
    }
    if (this.scannerCharges <= 0) {
      this.showToast('No Tactical Scanner Charges Remaining — Resupply at Tactical Crate', 2.2);
      return;
    }
    this.scannerCharges -= 1;
    this.scannerActiveTimer = 6.0;
    this.scannerCooldown = 12.0;
    this.scannerWaveMesh.position.set(this.playerPos.x, 0.12, this.playerPos.z);
    this.scannerWaveMesh.scale.setScalar(1);
    this.scannerWaveMesh.visible = true;
    this.audio.playObjectiveComplete();
    this.showToast('Tactical Scanner Pulse Active (6s) — Highlighting Pickups & Objectives', 3.0);
  }

  private toggleFlashlight(): void {
    if (!this.flashlightOn && this.flashlightBattery <= 2) {
      this.showToast('Flashlight Battery Depleted — Recharging...', 2.0);
      return;
    }
    this.flashlightOn = !this.flashlightOn;
    this.flashlightSpot.intensity = this.flashlightOn ? 5.5 : 0;
    this.audio.playWeaponSwitch();
    this.showToast(this.flashlightOn ? 'Tactical Flashlight ON' : 'Tactical Flashlight OFF', 1.5);
  }

  private toggleNightVision(): void {
    if (!this.nightVisionActive && this.nightVisionBattery <= 2) {
      this.showToast('NVG Battery Depleted — Recharging...', 2.0);
      return;
    }
    this.nightVisionActive = !this.nightVisionActive;
    if (this.hemiLight) {
      this.hemiLight.intensity = this.nightVisionActive
        ? this.baseHemiIntensity + 1.4
        : this.baseHemiIntensity;
    }
    this.audio.playWeaponSwitch();
    this.showToast(
      this.nightVisionActive ? 'Night-Vision Goggles ACTIVE' : 'Night-Vision Goggles OFF',
      1.8
    );
  }

  private useCarriedMedkit(): void {
    if (this.medkitsCarried <= 0) {
      this.showToast('No Field Medkits in Inventory Pouch', 1.8);
      return;
    }
    const res = applyMedkitHeal(this.health, this.maxHealth, 35, false);
    if (!res.collected) {
      this.showToast(res.message, 2.0);
      return;
    }
    this.medkitsCarried -= 1;
    this.health = res.newHealth;
    this.audio.playObjectiveComplete();
    this.showToast(`${res.message} (${this.medkitsCarried} left)`, 2.2);
  }

  private useCarriedArmorPlate(): void {
    if (this.armorPlates <= 0) {
      this.showToast('No Reserve Armor Plates in Pouch', 1.8);
      return;
    }
    if (this.armor >= this.maxArmor) {
      this.showToast(`Armor already at maximum (${this.maxArmor}/${this.maxArmor})`, 2.0);
      return;
    }
    this.armorPlates -= 1;
    const restored = Math.min(35, this.maxArmor - this.armor);
    this.armor += restored;
    this.audio.playReload();
    this.showToast(`Inserted Ballistic Armor Plate (+${restored} Armor)`, 2.2);
  }

  private triggerTacticalDash(): void {
    if (this.dashCooldown > 0) return;
    if (this.stamina < 22) {
      this.showToast('Insufficient Stamina for Tactical Dash', 1.5);
      return;
    }
    this.stamina = Math.max(0, this.stamina - 22);
    this.dashCooldown = 3.5;

    const moveFwd = (this.keys['KeyW'] ? 1 : 0) - (this.keys['KeyS'] ? 1 : 0);
    const moveStrafe = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0);
    _forward.set(-Math.sin(this.playerYaw), 0, -Math.cos(this.playerYaw)).normalize();
    _right.set(Math.cos(this.playerYaw), 0, -Math.sin(this.playerYaw)).normalize();

    const dashDir = new THREE.Vector3()
      .addScaledVector(_forward, moveFwd !== 0 || moveStrafe !== 0 ? moveFwd : 1)
      .addScaledVector(_right, moveStrafe)
      .normalize();

    this.playerVel.x = dashDir.x * 16.5;
    this.playerVel.z = dashDir.z * 16.5;
    this.audio.playJumpLand(false);
    this.showToast('Tactical Evasive Dash', 1.2);
  }

  private startReload(): void {
    const slotObj = this.slots[this.activeSlot];
    const { def, state } = slotObj;
    if (state.isReloading || state.currentMag >= def.magazineSize || state.reserveAmmo <= 0) {
      return;
    }
    state.isReloading = true;
    state.reloadTimer = def.reloadTimeSec;
    this.isAiming = false;
    this.audio.playReload();
  }

  private tryFireWeapon(): void {
    if (this.isPaused || this.missionEnded || !this.isPointerLocked) return;

    const slotObj = this.slots[this.activeSlot];
    const { def, state } = slotObj;
    if (state.isReloading) return;

    const minInterval = 60 / def.fireRateRPM;
    if (this.missionTimeSec - state.lastFireTime < minInterval) return;

    if (state.currentMag <= 0) {
      state.lastFireTime = this.missionTimeSec;
      this.audio.playDryFire();
      if (state.reserveAmmo > 0) {
        this.startReload();
      }
      return;
    }

    state.currentMag -= 1;
    state.lastFireTime = this.missionTimeSec;
    this.shotsFired += 1;

    this.audio.playWeaponFire(def.weaponClass, false);

    // Notify enemy acoustic perception using attachment-aware sound radius
    for (const enemy of this.enemies) {
      enemy.notifySound(this.playerPos, def.soundRadiusMeters);
    }

    // Muzzle flash, recoil impulse & brass shell casing ejection
    this.muzzleFlashTimer = def.isSuppressed ? 0.02 : 0.045;
    this.recoilKickZ = Math.min(0.14, this.recoilKickZ + 0.046);
    this.recoilKickPitch = Math.min(0.12, this.recoilKickPitch + def.recoilPitch);
    this.spawnShellCasing();

    const spreadBase = this.isAiming ? def.adsSpreadRad : def.hipSpreadRad;
    const movePenalty = this.playerVel.length() > 1.5 ? 1.45 : 1.0;
    const crouchBonus = this.isCrouching ? 0.75 : 1.0;
    const totalSpread = spreadBase * movePenalty * crouchBonus;

    const enemyHitMeshes: THREE.Object3D[] = [];
    for (const enemy of this.enemies) {
      if (enemy.isAlive()) {
        enemyHitMeshes.push(enemy.rig.root);
      }
    }

    if (this.activeMuzzlePoint) {
      this.activeMuzzlePoint.getWorldPosition(_muzzleWorld);
    } else {
      _muzzleWorld.copy(this.camera.position);
    }

    let registeredHitThisTrigger = false;
    let registeredHeadshotThisTrigger = false;
    let registeredKillThisTrigger = false;

    for (let p = 0; p < def.pellets; p++) {
      this.camera.getWorldDirection(_shootDir);
      _shootDir.x += (Math.random() - 0.5) * totalSpread;
      _shootDir.y += (Math.random() - 0.5) * totalSpread;
      _shootDir.z += (Math.random() - 0.5) * totalSpread;
      _shootDir.normalize();

      // 1. Check solid wall/prop distance first so bullets never penetrate solid walls
      const wallHit = this.collisionWorld.raycastSolidDistance(
        this.camera.position,
        _shootDir,
        def.maxRange
      );

      // 2. Raycast against enemy hitboxes up to wallHit.distance
      _raycaster.set(this.camera.position, _shootDir);
      _raycaster.near = 0.1;
      _raycaster.far = wallHit.distance;

      const enemyHits = _raycaster.intersectObjects(enemyHitMeshes, true);
      let impactPoint =
        wallHit.point ||
        this.camera.position.clone().addScaledVector(_shootDir, def.maxRange);

      if (enemyHits.length > 0) {
        const firstHit = enemyHits[0];
        impactPoint = firstHit.point.clone();
        const hitEnemyId = firstHit.object.userData.enemyId as string | undefined;
        const isHeadshot = firstHit.object.userData.hitZone === 'head';

        if (hitEnemyId) {
          const enemy = this.enemies.find((e) => e.id === hitEnemyId);
          if (enemy && enemy.isAlive()) {
            registeredHitThisTrigger = true;
            if (isHeadshot) registeredHeadshotThisTrigger = true;

            const { healthDamage, armorDamage } = calculateBallisticDamage(
              def,
              firstHit.distance,
              isHeadshot,
              enemy.armor
            );

            const { defeated } = enemy.applyDamage(
              healthDamage,
              armorDamage,
              this.playerPos
            );

            this.spawnSurfaceImpact(impactPoint, 'flesh');

            if (defeated) {
              registeredKillThisTrigger = true;
              this.handleEnemyDefeated(enemy, def.name, isHeadshot);
            }
          }
        }
      } else if (wallHit.point) {
        if (wallHit.surfaceType === 'explosive_barrel' && wallHit.colliderId) {
          const barrel = this.explosiveBarrels.find((b) => b.id === wallHit.colliderId);
          if (barrel && !barrel.exploded) {
            this.detonateExplosiveBarrel(barrel);
          }
        } else {
          this.spawnSurfaceImpact(wallHit.point, wallHit.surfaceType || 'concrete');
        }
      }

      this.spawnTracer(_muzzleWorld, impactPoint, 0xfde047);
    }

    if (registeredHitThisTrigger) {
      this.shotsHit += 1;
      this.audio.playHitMarker(registeredHeadshotThisTrigger);
      this.hitMarkerType = registeredKillThisTrigger
        ? 'kill'
        : registeredHeadshotThisTrigger
          ? 'headshot'
          : 'normal';
      this.hitMarkerTimer = 0.22;
    }

    if (this.settings.cameraShake) {
      this.playerPitch += def.recoilPitch * (this.isAiming ? 0.65 : 1.0);
      this.playerYaw += (Math.random() - 0.5) * def.recoilYaw * 2;
    }

    if (state.currentMag === 0 && state.reserveAmmo > 0) {
      this.startReload();
    }
  }

  private spawnShellCasing(): void {
    if (this.settings.graphicsQuality === 'low' || !this.activeEjectionPoint) return;
    this.activeEjectionPoint.getWorldPosition(_ejectWorld);
    const casing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, 0.024, 6),
      new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.25, metalness: 0.85 })
    );
    casing.position.copy(_ejectWorld);
    _right.set(Math.cos(this.playerYaw), 0, -Math.sin(this.playerYaw)).normalize();
    const vel = _right
      .clone()
      .multiplyScalar(1.8 + Math.random() * 0.8)
      .add(new THREE.Vector3(0, 1.4 + Math.random() * 0.6, 0));
    this.scene.add(casing);
    this.activeCasings.push({
      mesh: casing,
      velocity: vel,
      rotVel: new THREE.Vector3(Math.random() * 14, Math.random() * 14, Math.random() * 14),
      life: 0.55,
    });
  }

  private spawnSurfaceImpact(
    point: THREE.Vector3,
    surface: SurfaceMaterialType | 'flesh'
  ): void {
    if (this.settings.graphicsQuality === 'low') return;
    const colorMap: Record<SurfaceMaterialType | 'flesh', number> = {
      flesh: 0xef4444,
      concrete: 0xcbd5e1,
      metal: 0xfbbf24,
      dirt: 0x92400e,
      wood: 0xb45309,
      glass: 0x38bdf8,
      explosive_barrel: 0xf97316,
      destructible_crate: 0xb45309,
      door: 0xfbbf24,
    };
    const count = surface === 'metal' || surface === 'flesh' ? 6 : 4;
    this.spawnImpactSparks(point, colorMap[surface] || 0xfbbf24, count);
  }

  private detonateExplosiveBarrel(barrel: ExplosiveBarrelProp): void {
    if (barrel.exploded) return;
    barrel.exploded = true;
    barrel.mesh.visible = false;
    this.collisionWorld.removeBox(barrel.id);

    this.audio.playExplosion();
    this.spawnImpactSparks(barrel.position, 0xf97316, 26);

    const shockMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 20),
      createPBRStandardMaterial({
        color: 0xf97316,
        emissive: 0xf97316,
        emissiveIntensity: 2.5,
        roughness: 0.2,
        metalness: 0.0,
        transparent: true,
        opacity: 0.7,
      })
    );
    shockMesh.position.copy(barrel.position);
    this.scene.add(shockMesh);
    this.activeShockwaves.push({ mesh: shockMesh, life: 0.45, maxLife: 0.45 });

    this.showToast('Fuel Barrel Detonated!', 2.2);

    for (const enemy of this.enemies) {
      if (!enemy.isAlive()) continue;
      enemy.notifySound(barrel.position, 50);
      const dist = enemy.position.distanceTo(barrel.position);
      const dmg = calculateExplosionDamage(dist, 8.5, 185);
      if (dmg > 0) {
        const { defeated } = enemy.applyDamage(dmg, Math.round(dmg * 0.6), this.playerPos);
        if (defeated) {
          this.handleEnemyDefeated(enemy, 'FUEL BARREL BLAST', false);
        }
      }
    }

    const playerDist = this.playerPos.distanceTo(barrel.position);
    const selfDmg = calculateExplosionDamage(playerDist, 7.0, 65);
    if (selfDmg > 0) {
      this.applyPlayerDamage(selfDmg, barrel.position);
    }
  }

  private handleEnemyDefeated(
    enemy: EnemyAgent,
    weaponName: string,
    isHeadshot: boolean
  ): void {
    this.enemiesDefeated += 1;
    if (isHeadshot) this.headshots += 1;

    this.killFeed.unshift({
      id: `${Date.now()}_${Math.random()}`,
      killer: 'OPERATIVE',
      victim: enemy.isCommander ? 'COMMANDER VIPER' : `${enemy.personality.toUpperCase()} UNIT`,
      weaponName,
      isHeadshot,
      timestamp: this.missionTimeSec,
    });
    if (this.killFeed.length > 4) this.killFeed.pop();

    // Balanced Enemy Loot Drop (45% probability, never duplicates)
    if (!enemy.lootDropped && Math.random() < 0.45) {
      enemy.lootDropped = true;
      const dropArmor = Math.random() < 0.4;
      const lootCfg: InteractiveObjectConfig = {
        id: `loot_${enemy.id}`,
        type: dropArmor ? 'armor_plate' : 'ammo_pack_rifle',
        label: dropArmor ? 'Dropped Armor Plate (+25 Armor)' : 'Dropped Munitions Pack (+45 Rounds)',
        interactionPrompt: dropArmor
          ? 'Press [E] to Collect Dropped Armor Plate'
          : 'Press [E] to Collect Dropped Ammunition',
        position: [enemy.position.x, 0, enemy.position.z],
        armorAmount: 25,
        ammoAmount: 45,
        interactionDurationSec: 0.2,
      };
      const { group, beaconLightMesh, glowOutlineMesh } = createInteractiveObjectModel(lootCfg);
      this.scene.add(group);
      this.interactables.push({
        config: lootCfg,
        group,
        beaconMesh: beaconLightMesh,
        glowOutlineMesh,
        used: false,
      });
    }

    for (const obj of this.objectives) {
      if (obj.type === 'eliminate_all' && !obj.completed) {
        obj.currentCount = Math.min(obj.targetCount, obj.currentCount + 1);
        if (obj.currentCount >= obj.targetCount) {
          obj.completed = true;
          this.audio.playObjectiveComplete();
          this.showToast(`Objective Complete: ${obj.title}`);
        }
      }
    }
  }

  private throwGrenade(): void {
    const count = this.grenadeInventory[this.activeGrenadeType];
    if (count <= 0 || this.grenadeCooldown > 0) {
      if (count <= 0) {
        this.showToast(`No ${this.activeGrenadeType.toUpperCase()} Grenades Remaining`, 1.8);
      }
      return;
    }
    this.grenadeInventory[this.activeGrenadeType] -= 1;
    this.grenadeCooldown = 1.35;

    const grenadeColors: Record<GrenadeType, number> = {
      frag: 0x365314,
      smoke: 0x64748b,
      flash: 0xfacc15,
      emp: 0x0284c7,
    };

    const mesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.11, 1),
      new THREE.MeshStandardMaterial({
        color: grenadeColors[this.activeGrenadeType],
        roughness: 0.45,
        metalness: 0.65,
      })
    );

    const ringColor =
      this.activeGrenadeType === 'smoke'
        ? 0x94a3b8
        : this.activeGrenadeType === 'emp'
          ? 0x38bdf8
          : this.activeGrenadeType === 'flash'
            ? 0xfef08a
            : 0xef4444;

    const ringMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 7.5, 32),
      createPBRStandardMaterial({
        color: ringColor,
        emissive: ringColor,
        emissiveIntensity: 1.6,
        roughness: 0.3,
        metalness: 0.1,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.22,
      })
    );
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.visible = false;
    this.scene.add(mesh, ringMesh);

    this.camera.getWorldDirection(_shootDir);
    const startPos = this.camera.position.clone().addScaledVector(_shootDir, 0.75);
    const vel = _shootDir.clone().multiplyScalar(15.5);
    vel.y += 4.2;

    this.activeGrenades.push({
      type: this.activeGrenadeType,
      mesh,
      ringMesh,
      position: startPos,
      velocity: vel,
      fuseTimer: this.activeGrenadeType === 'smoke' ? 1.5 : 2.0,
    });

    this.showToast(`${this.activeGrenadeType.toUpperCase()} Grenade Out!`, 1.6);
  }

  private detonateGrenade(g: ActiveGrenade): void {
    this.scene.remove(g.mesh, g.ringMesh);
    this.audio.playExplosion();

    if (g.type === 'smoke') {
      // Deploy 3D Volumetric Smoke Cloud that blocks Enemy AI Line-of-Sight
      const smokeGroup = new THREE.Group();
      smokeGroup.position.copy(g.position);
      const puffMat = new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        roughness: 0.95,
        transparent: true,
        opacity: 0.72,
      });
      for (let i = 0; i < 9; i++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(2.1 + (i % 3) * 0.6, 12, 12), puffMat);
        puff.position.set(
          Math.cos(i * 1.1) * 1.8,
          1.4 + (i % 3) * 0.5,
          Math.sin(i * 1.1) * 1.8
        );
        smokeGroup.add(puff);
      }
      this.scene.add(smokeGroup);
      this.activeSmokeClouds.push({
        group: smokeGroup,
        position: g.position.clone().setY(1.4),
        radius: 5.5,
        life: 10.0,
        maxLife: 10.0,
      });
      this.showToast('Smoke Screen Deployed — Hostile Line-of-Sight Obscured (10s)', 2.5);
      return;
    }

    if (g.type === 'flash') {
      this.spawnImpactSparks(g.position, 0xfef08a, 24);
      const shockMesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 18, 18),
        createPBRStandardMaterial({
          color: 0xfef9c3,
          emissive: 0xfef08a,
          emissiveIntensity: 3.0,
          roughness: 0.15,
          metalness: 0.0,
          transparent: true,
          opacity: 0.85,
        })
      );
      shockMesh.position.copy(g.position);
      this.scene.add(shockMesh);
      this.activeShockwaves.push({ mesh: shockMesh, life: 0.3, maxLife: 0.3 });

      let stunnedCount = 0;
      for (const enemy of this.enemies) {
        if (!enemy.isAlive()) continue;
        const dist = enemy.position.distanceTo(g.position);
        _enemyEye.set(enemy.position.x, enemy.position.y + 1.5, enemy.position.z);
        if (dist <= 12.0 && this.collisionWorld.hasLineOfSight(g.position.clone().setY(1.0), _enemyEye)) {
          enemy.applyFlashStun(4.2);
          stunnedCount++;
        }
      }
      this.showToast(`Flashbang Detonated — ${stunnedCount} Hostile(s) Disoriented`, 2.4);
      return;
    }

    if (g.type === 'emp') {
      this.spawnImpactSparks(g.position, 0x38bdf8, 24);
      const shockMesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 18, 18),
        createPBRStandardMaterial({
          color: 0x38bdf8,
          emissive: 0x38bdf8,
          emissiveIntensity: 2.6,
          roughness: 0.15,
          metalness: 0.1,
          transparent: true,
          opacity: 0.75,
        })
      );
      shockMesh.position.copy(g.position);
      this.scene.add(shockMesh);
      this.activeShockwaves.push({ mesh: shockMesh, life: 0.45, maxLife: 0.45 });

      // EMP disables radar jammers and opens security doors within 9.5m
      for (const inter of this.interactables) {
        const dist = Math.hypot(
          inter.config.position[0] - g.position.x,
          inter.config.position[2] - g.position.z
        );
        if (dist <= 9.5) {
          if (inter.config.type === 'radar_jammer' && !inter.used) {
            this.completeInteraction(inter);
          } else if (inter.config.type === 'security_door' && !inter.doorOpen) {
            this.completeInteraction(inter);
          }
        }
      }

      for (const enemy of this.enemies) {
        if (!enemy.isAlive()) continue;
        if (enemy.position.distanceTo(g.position) <= 9.5) {
          enemy.armor = Math.max(0, enemy.armor - 45);
          enemy.applyFlashStun(2.5);
        }
      }
      this.showToast('EMP Pulse Discharged — Electronics & Hostile Armor Disrupted', 2.5);
      return;
    }

    // Standard FRAGMENTATION Grenade
    this.spawnImpactSparks(g.position, 0xf97316, 22);
    const shockMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 20),
      createPBRStandardMaterial({
        color: 0xf97316,
        emissive: 0xf97316,
        emissiveIntensity: 2.5,
        roughness: 0.2,
        metalness: 0.0,
        transparent: true,
        opacity: 0.65,
      })
    );
    shockMesh.position.copy(g.position);
    this.scene.add(shockMesh);
    this.activeShockwaves.push({ mesh: shockMesh, life: 0.42, maxLife: 0.42 });

    // Chain-detonate nearby explosive barrels
    for (const barrel of this.explosiveBarrels) {
      if (!barrel.exploded && barrel.position.distanceTo(g.position) <= 6.5) {
        this.detonateExplosiveBarrel(barrel);
      }
    }

    for (const enemy of this.enemies) {
      if (!enemy.isAlive()) continue;
      enemy.notifySound(g.position, 48);
      const dist = enemy.position.distanceTo(g.position);
      const dmg = calculateExplosionDamage(dist, 7.5, 165);
      if (dmg > 0) {
        const { defeated } = enemy.applyDamage(dmg, Math.round(dmg * 0.5), this.playerPos);
        if (defeated) {
          this.handleEnemyDefeated(enemy, 'M67 FRAG GRENADE', false);
        }
      }
    }

    const playerDist = this.playerPos.distanceTo(g.position);
    const selfDmg = calculateExplosionDamage(playerDist, 6.5, 75);
    if (selfDmg > 0) {
      this.applyPlayerDamage(selfDmg, g.position);
    }
  }

  private applyPlayerDamage(amount: number, sourcePos: THREE.Vector3): void {
    if (this.missionEnded) return;

    const absorbed = Math.min(this.armor, Math.round(amount * 0.55));
    this.armor = Math.max(0, this.armor - absorbed);
    const healthDmg = Math.max(1, amount - absorbed);
    this.health = Math.max(0, this.health - healthDmg);
    this.damageReceived += healthDmg;

    this.damageFlashIntensity = Math.min(1.0, this.damageFlashIntensity + 0.65);
    this.audio.playPlayerDamage();

    const dx = sourcePos.x - this.playerPos.x;
    const dz = sourcePos.z - this.playerPos.z;
    const worldAngle = Math.atan2(dx, -dz);
    this.damageDirectionAngle = worldAngle - this.playerYaw;

    if (this.health <= 0) {
      this.finishMission(false, 'Operative Killed in Action (KIA)');
    }
  }

  private spawnTracer(from: THREE.Vector3, to: THREE.Vector3, colorHex: number): void {
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const mat = new THREE.LineBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.75,
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.activeTracers.push({ line, life: 0.065 });
  }

  private spawnImpactSparks(point: THREE.Vector3, colorHex: number, count: number): void {
    if (this.settings.graphicsQuality === 'low') return;
    const geo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    for (let i = 0; i < count; i++) {
      const mat = createPBRStandardMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: 2.4,
        roughness: 0.25,
        metalness: 0.2,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(point);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 6,
        Math.random() * 5 + 1,
        (Math.random() - 0.5) * 6
      );
      this.scene.add(mesh);
      this.activeSparks.push({ mesh, velocity: vel, life: 0.28 });
    }
  }

  private startLoop(): void {
    const afterDraw = (cb: () => void) => {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      const poll = () => {
        if (this.isDisposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (this.isDisposed) return;
      const now = performance.now();
      const rawDt = (now - this.lastFrameTime) / 1000;
      this.lastFrameTime = now;
      const dt = Math.min(0.1, Math.max(0.001, rawDt));
      this.fps = Math.round(THREE.MathUtils.lerp(this.fps, 1 / Math.max(0.001, rawDt), 0.1));

      if (!this.isPaused && !this.missionEnded) {
        this.updateSimulation(dt);
      }

      if (!this.isSoftwareGl && this.composer && this.settings.graphicsQuality !== 'low') {
        this.composer.render(dt);
      } else {
        this.renderer.render(this.scene, this.camera);
      }

      if (this.isSoftwareGl) {
        afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    this.lastFrameTime = performance.now();
    this.frameId = requestAnimationFrame(tick);
  }

  private updateSimulation(dt: number): void {
    this.missionTimeSec += dt;

    if (this.mission.timeLimitSec && this.missionTimeSec >= this.mission.timeLimitSec) {
      this.finishMission(false, 'Mission Time Limit Expired');
      return;
    }

    // Update Tactical Scanner, Flashlight Battery & NVG Battery
    if (this.scannerCooldown > 0) this.scannerCooldown = Math.max(0, this.scannerCooldown - dt);
    if (this.dashCooldown > 0) this.dashCooldown = Math.max(0, this.dashCooldown - dt);

    if (this.scannerActiveTimer > 0) {
      this.scannerActiveTimer = Math.max(0, this.scannerActiveTimer - dt);
      const pulsePhase = (6.0 - this.scannerActiveTimer) % 1.5;
      this.scannerWaveMesh.position.set(this.playerPos.x, 0.12, this.playerPos.z);
      this.scannerWaveMesh.scale.setScalar(1 + pulsePhase * 24);
      (this.scannerWaveMesh.material as THREE.MeshStandardMaterial).opacity = Math.max(
        0,
        (1 - pulsePhase / 1.5) * 0.65
      );
      if (this.scannerActiveTimer <= 0) {
        this.scannerWaveMesh.visible = false;
      }
    }

    if (this.flashlightOn) {
      this.flashlightBattery = Math.max(0, this.flashlightBattery - 2.5 * dt);
      if (this.flashlightBattery <= 0) {
        this.flashlightOn = false;
        this.flashlightSpot.intensity = 0;
        this.showToast('Flashlight Battery Depleted', 2.0);
      }
    } else {
      this.flashlightBattery = Math.min(100, this.flashlightBattery + 4.0 * dt);
    }

    if (this.nightVisionActive) {
      this.nightVisionBattery = Math.max(0, this.nightVisionBattery - 3.0 * dt);
      if (this.nightVisionBattery <= 0) {
        this.nightVisionActive = false;
        if (this.hemiLight) this.hemiLight.intensity = this.baseHemiIntensity;
        this.showToast('Night-Vision Battery Depleted', 2.0);
      }
    } else {
      this.nightVisionBattery = Math.min(100, this.nightVisionBattery + 3.5 * dt);
    }

    // Subtle wind drift on atmospheric dust particles
    if (this.dustParticles) {
      this.dustParticles.rotation.y += dt * 0.025;
    }

    // 1. Automatic weapon continuous fire
    const activeWeaponObj = this.slots[this.activeSlot];
    if (this.isFiringHeld && activeWeaponObj.def.automatic) {
      this.tryFireWeapon();
    }

    // 2. Weapon Reload Timer & Magazine Drop/Insert Animation
    if (activeWeaponObj.state.isReloading) {
      activeWeaponObj.state.reloadTimer -= dt;
      if (this.activeMagazineMesh && activeWeaponObj.def.id !== 'm870_breacher') {
        const progress =
          1 - activeWeaponObj.state.reloadTimer / activeWeaponObj.def.reloadTimeSec;
        const dropOffset = Math.sin(progress * Math.PI) * 0.22;
        this.activeMagazineMesh.position.y = this.activeMagazineRestY - dropOffset;
      }
      if (activeWeaponObj.state.reloadTimer <= 0) {
        const needed = activeWeaponObj.def.magazineSize - activeWeaponObj.state.currentMag;
        const transfer = Math.min(needed, activeWeaponObj.state.reserveAmmo);
        activeWeaponObj.state.currentMag += transfer;
        activeWeaponObj.state.reserveAmmo -= transfer;
        activeWeaponObj.state.isReloading = false;
        if (this.activeMagazineMesh) {
          this.activeMagazineMesh.position.y = this.activeMagazineRestY;
        }
      }
    }

    // 3. Player Movement, Stamina, Gravity & Collision
    const moveFwd = (this.keys['KeyW'] ? 1 : 0) - (this.keys['KeyS'] ? 1 : 0);
    const moveStrafe = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0);
    const isMoving = moveFwd !== 0 || moveStrafe !== 0;

    const wantsSprint =
      !!this.keys['ShiftLeft'] && moveFwd > 0 && !this.isAiming && !this.isCrouching;
    if (wantsSprint && this.stamina > 5) {
      this.isSprinting = true;
      this.stamina = Math.max(0, this.stamina - 22 * dt);
    } else {
      this.isSprinting = false;
      this.stamina = Math.min(this.maxStamina, this.stamina + 16 * dt);
    }

    const baseSpeed = this.isCrouching
      ? 3.8
      : this.isSprinting
        ? 9.2
        : this.isAiming
          ? 4.4
          : 6.4;
    const maxSpeed = baseSpeed * activeWeaponObj.def.moveSpeedMultiplier;

    _forward.set(-Math.sin(this.playerYaw), 0, -Math.cos(this.playerYaw)).normalize();
    _right.set(Math.cos(this.playerYaw), 0, -Math.sin(this.playerYaw)).normalize();

    _moveWish
      .set(0, 0, 0)
      .addScaledVector(_forward, moveFwd)
      .addScaledVector(_right, moveStrafe);
    if (_moveWish.lengthSq() > 0) _moveWish.normalize();

    const accel = this.isGrounded ? 14 : 5;
    this.playerVel.x = THREE.MathUtils.damp(this.playerVel.x, _moveWish.x * maxSpeed, accel, dt);
    this.playerVel.z = THREE.MathUtils.damp(this.playerVel.z, _moveWish.z * maxSpeed, accel, dt);
    this.playerVel.y -= 18.5 * dt;

    this.playerPos.x += this.playerVel.x * dt;
    this.playerPos.y += this.playerVel.y * dt;
    this.playerPos.z += this.playerVel.z * dt;

    const wasGrounded = this.isGrounded;
    const { grounded } = this.collisionWorld.resolveCylinderMovement(
      this.playerPos,
      this.playerVel,
      0.45,
      this.isCrouching ? 1.1 : 1.75
    );
    this.isGrounded = grounded;
    if (!wasGrounded && grounded) {
      this.audio.playJumpLand(true);
    }

    if (this.isGrounded && isMoving) {
      this.stepSoundTimer -= dt;
      if (this.stepSoundTimer <= 0) {
        this.audio.playFootstep(this.isSprinting);
        this.stepSoundTimer = this.isSprinting ? 0.31 : this.isCrouching ? 0.62 : 0.44;
        if (this.isSprinting) {
          for (const enemy of this.enemies) {
            enemy.notifySound(this.playerPos, 14);
          }
        }
      }
    }

    const targetEye = this.isCrouching ? 1.02 : 1.62;
    this.currentEyeHeight = THREE.MathUtils.damp(this.currentEyeHeight, targetEye, 12, dt);

    this.camera.position.set(
      this.playerPos.x,
      this.playerPos.y + this.currentEyeHeight,
      this.playerPos.z
    );
    this.camera.rotation.y = this.playerYaw;
    this.camera.rotation.x = this.playerPitch;

    const targetFov = this.isAiming
      ? activeWeaponObj.def.adsZoomFov
      : this.isSprinting && this.settings.motionEffects
        ? this.settings.fov + 5
        : this.settings.fov;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 14, dt);
      this.camera.updateProjectionMatrix();
    }

    // 4. First-Person Weapon Viewmodel Sway, ADS & Recoil Animation
    if (isMoving && this.isGrounded) {
      this.weaponBobPhase += dt * (this.isSprinting ? 12 : 8);
    }
    const bobX =
      isMoving && this.settings.motionEffects ? Math.cos(this.weaponBobPhase) * 0.008 : 0;
    const bobY =
      isMoving && this.settings.motionEffects
        ? Math.abs(Math.sin(this.weaponBobPhase)) * 0.008
        : 0;

    this.recoilKickZ = THREE.MathUtils.damp(this.recoilKickZ, 0, 16, dt);
    this.recoilKickPitch = THREE.MathUtils.damp(this.recoilKickPitch, 0, 14, dt);

    const targetViewX = this.isAiming ? 0 : 0.22 + bobX;
    const targetViewY = activeWeaponObj.state.isReloading
      ? -0.28
      : (this.isAiming ? -0.145 : -0.21) - bobY;
    const targetViewZ = (this.isAiming ? -0.32 : -0.44) + this.recoilKickZ;

    this.weaponViewGroup.position.x = THREE.MathUtils.damp(
      this.weaponViewGroup.position.x,
      targetViewX,
      16,
      dt
    );
    this.weaponViewGroup.position.y = THREE.MathUtils.damp(
      this.weaponViewGroup.position.y,
      targetViewY,
      16,
      dt
    );
    this.weaponViewGroup.position.z = THREE.MathUtils.damp(
      this.weaponViewGroup.position.z,
      targetViewZ,
      18,
      dt
    );

    const targetRotX = activeWeaponObj.state.isReloading ? -0.55 : this.recoilKickPitch;
    this.weaponViewGroup.rotation.x = THREE.MathUtils.damp(
      this.weaponViewGroup.rotation.x,
      targetRotX,
      14,
      dt
    );

    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= dt;
      this.muzzleLight.intensity = 3.5;
      if (this.activeMuzzlePoint) {
        this.muzzleFlashMesh.position.copy(this.activeMuzzlePoint.position);
        this.muzzleFlashMesh.visible = true;
      }
    } else {
      this.muzzleLight.intensity = 0;
      this.muzzleFlashMesh.visible = false;
    }

    // 5. Interactive Objects, Pickups, Glow Wall Outlines & Doors
    this.updateInteractables(dt);

    // 6. Update Grenades, Smoke Clouds & Shockwaves
    if (this.grenadeCooldown > 0) this.grenadeCooldown = Math.max(0, this.grenadeCooldown - dt);
    for (let i = this.activeGrenades.length - 1; i >= 0; i--) {
      const g = this.activeGrenades[i];
      g.fuseTimer -= dt;
      g.velocity.y -= 16 * dt;
      g.position.addScaledVector(g.velocity, dt);

      if (g.position.y <= 0.12) {
        g.position.y = 0.12;
        g.velocity.y *= -0.45;
        g.velocity.x *= 0.65;
        g.velocity.z *= 0.65;
        g.ringMesh.visible = true;
        g.ringMesh.position.set(g.position.x, 0.04, g.position.z);
      }
      g.mesh.position.copy(g.position);

      if (g.fuseTimer <= 0) {
        this.detonateGrenade(g);
        this.activeGrenades.splice(i, 1);
      }
    }

    for (let i = this.activeSmokeClouds.length - 1; i >= 0; i--) {
      const sc = this.activeSmokeClouds[i];
      sc.life -= dt;
      sc.group.rotation.y += dt * 0.25;
      if (sc.life <= 0) {
        this.scene.remove(sc.group);
        this.activeSmokeClouds.splice(i, 1);
      }
    }

    for (let i = this.activeShockwaves.length - 1; i >= 0; i--) {
      const sw = this.activeShockwaves[i];
      sw.life -= dt;
      const progress = 1 - sw.life / sw.maxLife;
      const scale = 0.5 + progress * 7.0;
      sw.mesh.scale.setScalar(scale);
      (sw.mesh.material as THREE.MeshStandardMaterial).opacity = Math.max(0, (1 - progress) * 0.55);
      if (sw.life <= 0) {
        this.scene.remove(sw.mesh);
        this.activeShockwaves.splice(i, 1);
      }
    }

    // 7. Update Tracers, Sparks & Ejected Shell Casings
    for (let i = this.activeTracers.length - 1; i >= 0; i--) {
      const tr = this.activeTracers[i];
      tr.life -= dt;
      if (tr.life <= 0) {
        this.scene.remove(tr.line);
        tr.line.geometry.dispose();
        this.activeTracers.splice(i, 1);
      }
    }

    for (let i = this.activeSparks.length - 1; i >= 0; i--) {
      const sp = this.activeSparks[i];
      sp.life -= dt;
      sp.velocity.y -= 12 * dt;
      sp.mesh.position.addScaledVector(sp.velocity, dt);
      if (sp.life <= 0) {
        this.scene.remove(sp.mesh);
        this.activeSparks.splice(i, 1);
      }
    }

    for (let i = this.activeCasings.length - 1; i >= 0; i--) {
      const c = this.activeCasings[i];
      c.life -= dt;
      c.velocity.y -= 9.8 * dt;
      c.mesh.position.addScaledVector(c.velocity, dt);
      c.mesh.rotation.x += c.rotVel.x * dt;
      c.mesh.rotation.y += c.rotVel.y * dt;
      if (c.life <= 0) {
        this.scene.remove(c.mesh);
        c.mesh.geometry.dispose();
        this.activeCasings.splice(i, 1);
      }
    }

    // 8. Update Enemy AI Agents & Evaluate Enemy Shots
    for (const enemy of this.enemies) {
      const { shotEvent, alertedJustNow } = enemy.update(
        dt,
        this.playerPos,
        this.isCrouching,
        this.collisionWorld,
        this.navigation,
        this.enemies,
        this.settings.difficultyMultiplier,
        this.camera.position,
        this.activeSmokeClouds
      );

      if (alertedJustNow) {
        this.stealthIntact = false;
        this.audio.playEnemyAlert();
      }

      if (shotEvent) {
        this.audio.playWeaponFire(activeWeaponObj.def.weaponClass, true);
        const wallDist = this.collisionWorld.raycastSolidDistance(
          shotEvent.origin,
          shotEvent.direction,
          65
        );
        const distToPlayer = shotEvent.origin.distanceTo(this.camera.position);

        const toPlayerVec = this.camera.position.clone().sub(shotEvent.origin);
        const projLen = toPlayerVec.dot(shotEvent.direction);
        const closestPt = shotEvent.origin
          .clone()
          .addScaledVector(shotEvent.direction, Math.max(0, projLen));
        const missRadius = closestPt.distanceTo(this.camera.position);

        if (distToPlayer < wallDist.distance + 0.3 && missRadius < 0.72) {
          this.spawnTracer(shotEvent.origin, this.camera.position, 0xf87171);
          this.applyPlayerDamage(shotEvent.damage, shotEvent.origin);
        } else {
          const endPt =
            wallDist.point || shotEvent.origin.clone().addScaledVector(shotEvent.direction, 40);
          this.spawnTracer(shotEvent.origin, endPt, 0xfb923c);
        }
      }
    }

    // 9. Survival Mode Wave Progression & Extraction Zone Check
    this.updateMissionRules(dt);

    // 10. Decay Hit Marker, Damage Vignette & Status Toast
    if (this.hitMarkerTimer > 0) {
      this.hitMarkerTimer -= dt;
      if (this.hitMarkerTimer <= 0) this.hitMarkerType = 'none';
    }
    if (this.damageFlashIntensity > 0) {
      this.damageFlashIntensity = Math.max(0, this.damageFlashIntensity - dt * 1.8);
      if (this.damageFlashIntensity === 0) this.damageDirectionAngle = null;
    }
    if (this.statusToastTimer > 0) {
      this.statusToastTimer -= dt;
      if (this.statusToastTimer <= 0) this.statusToast = null;
    }

    this.hudUpdateAccum += dt;
    if (this.hudUpdateAccum >= 0.05) {
      this.hudUpdateAccum = 0;
      this.emitHudState();
    }
  }

  private updateInteractables(dt: number): void {
    let closest: RuntimeInteractable | null = null;
    let closestDist = 3.2;

    for (const inter of this.interactables) {
      inter.beaconMesh.rotation.y += dt * 1.8;

      const d = Math.hypot(
        inter.config.position[0] - this.playerPos.x,
        inter.config.position[2] - this.playerPos.z
      );

      // Floating animation for small pickups (medkits, armor plates, ammo packs)
      const isPickup =
        inter.config.type === 'medkit_small' ||
        inter.config.type === 'medkit_large' ||
        inter.config.type === 'armor_plate' ||
        inter.config.type.startsWith('ammo_pack_');

      if (isPickup && !inter.used) {
        inter.group.position.y = Math.sin(this.missionTimeSec * 2.8 + d) * 0.05;
        inter.group.rotation.y += dt * 0.85;
      }

      // Glow Wall / 3D Fresnel Outline Shader Visibility Rules:
      // Respects settings.pickupHighlights toggle (or active Tactical Scanner [V] override)
      const isObjective = !!inter.config.objectiveId;
      const glowSettingEnabled = this.settings.pickupHighlights !== false;
      const scannerActive = this.scannerActiveTimer > 0 && d <= 42;
      const showGlow =
        !inter.used &&
        (scannerActive || (glowSettingEnabled && (isObjective || d <= 26)));

      inter.glowOutlineMesh.visible = showGlow;
      if (showGlow) {
        const scannerBoost = scannerActive ? 1.35 : 1.0;
        updateGlowWallShaderUniforms(
          inter.glowOutlineMesh,
          this.missionTimeSec,
          scannerBoost
        );
      }

      // Animate Security Door Panel or Opened Supply Crate Lid
      if (inter.config.type === 'security_door' && inter.lidMesh) {
        const [dw] = inter.config.doorSize || [3.2, 3.0, 0.32];
        const targetX = inter.doorOpen ? dw * 0.92 : 0;
        inter.lidMesh.position.x = THREE.MathUtils.damp(
          inter.lidMesh.position.x,
          targetX,
          8,
          dt
        );
      } else if (inter.used && inter.lidMesh) {
        inter.lidMesh.position.z = THREE.MathUtils.damp(inter.lidMesh.position.z, -0.35, 8, dt);
        inter.lidMesh.rotation.x = THREE.MathUtils.damp(inter.lidMesh.rotation.x, -0.9, 8, dt);
      }

      if (inter.used && inter.config.type !== 'security_door') continue;
      if (d < closestDist) {
        closestDist = d;
        closest = inter;
      }
    }

    if (!closest) {
      this.activePrompt = null;
      this.activeInteractionSubtext = null;
      this.interactionProgress = 0;
      return;
    }

    this.activePrompt = closest.config.interactionPrompt;
    this.activeInteractionSubtext = this.getInspectionSubtext(closest);

    if (this.keys['KeyE']) {
      this.interactionProgress += dt / Math.max(0.18, closest.config.interactionDurationSec);
      if (this.interactionProgress >= 1) {
        this.interactionProgress = 0;
        this.keys['KeyE'] = false;
        this.completeInteraction(closest);
      }
    } else {
      this.interactionProgress = Math.max(0, this.interactionProgress - dt * 2.5);
    }
  }

  private getInspectionSubtext(inter: RuntimeInteractable): string {
    const t = inter.config.type;
    if (t === 'medkit_small' || t === 'medkit_large') {
      const amt = inter.config.healAmount || (t === 'medkit_large' ? 60 : 35);
      return `${inter.config.label} · Operative HP: ${this.health}/${this.maxHealth}`;
    }
    if (t === 'armor_plate') {
      return `${inter.config.label} · Armor: ${this.armor}/${this.maxArmor} · Plates: ${this.armorPlates}/${this.maxArmorPlates}`;
    }
    if (t.startsWith('ammo_pack_')) {
      const w = this.slots[this.activeSlot];
      return `${inter.config.label} · Active Reserve: ${w.state.reserveAmmo}/${w.def.maxReserveAmmo}`;
    }
    if (t === 'supply_crate_tactical') {
      return 'Contains: +35 HP, +1 Armor Plate, Full Ammo, +1 Frag Grenade & +1 Scanner Charge';
    }
    if (t === 'security_door') {
      return inter.doorOpen ? 'Status: Bulkhead OPEN' : 'Status: Bulkhead CLOSED (Blocks Passage & LOS)';
    }
    return inter.config.label;
  }

  private completeInteraction(inter: RuntimeInteractable): void {
    const cfg = inter.config;

    // 1. Medkit Pickups (Small +35 HP / Large +60 HP)
    if (cfg.type === 'medkit_small' || cfg.type === 'medkit_large') {
      const healAmt = cfg.healAmount || (cfg.type === 'medkit_large' ? 60 : 35);
      if (this.health < this.maxHealth) {
        const res = applyMedkitHeal(this.health, this.maxHealth, healAmt, inter.used);
        if (res.collected) {
          this.health = res.newHealth;
          inter.used = true;
          inter.group.visible = false;
          this.audio.playObjectiveComplete();
          this.showToast(res.message);
        }
      } else if (this.medkitsCarried < this.maxMedkitsCarried) {
        this.medkitsCarried += 1;
        inter.used = true;
        inter.group.visible = false;
        this.audio.playWeaponSwitch();
        this.showToast(
          `HP Full — Stored Field Medkit in Pouch (${this.medkitsCarried}/${this.maxMedkitsCarried}) [Press H]`
        );
      } else {
        this.showToast(
          `Health (${this.maxHealth}/${this.maxHealth}) and Medkit Pouch already full!`
        );
      }
      return;
    }

    // 2. Armor Plate Pickup
    if (cfg.type === 'armor_plate') {
      const armorAmt = cfg.armorAmount || 35;
      const res = applyArmorPickup(
        this.armor,
        this.maxArmor,
        this.armorPlates,
        this.maxArmorPlates,
        armorAmt,
        inter.used
      );
      if (!res.collected) {
        this.showToast(res.message);
        return;
      }
      this.armor = res.newArmor;
      this.armorPlates = res.newPlates;
      inter.used = true;
      inter.group.visible = false;
      this.audio.playReload();
      this.showToast(res.message);
      return;
    }

    // 3. Individual Caliber Ammunition Pickups
    if (cfg.type.startsWith('ammo_pack_')) {
      const targetClass: WeaponClass | 'ANY' =
        cfg.type === 'ammo_pack_shotgun'
          ? WeaponClass.Shotgun
          : cfg.type === 'ammo_pack_pistol'
            ? WeaponClass.Sidearm
            : cfg.type === 'ammo_pack_sniper'
              ? WeaponClass.PrecisionRifle
              : 'ANY';

      const amt = cfg.ammoAmount || 45;
      let anyAdded = false;
      let totalAdded = 0;

      ([1, 2, 3] as const).forEach((s) => {
        const slot = this.slots[s];
        const res = applyWeaponAmmoPickup(slot.def, slot.state, targetClass, amt, inter.used);
        if (res.collected) {
          slot.state.reserveAmmo = res.newReserveAmmo;
          anyAdded = true;
          totalAdded += res.addedAmmo;
        }
      });

      if (!anyAdded) {
        this.showToast('Reserve Ammunition already at maximum capacity!');
        return;
      }
      inter.used = true;
      inter.group.visible = false;
      this.audio.playReload();
      this.showToast(`+${totalAdded} Rounds Added to Reserve Ammunition`);
      return;
    }

    // 4. Interactive Security Door (Open / Close with real CollisionWorld update)
    if (cfg.type === 'security_door') {
      inter.doorOpen = !inter.doorOpen;
      const [dw, dh, dd] = cfg.doorSize || [3.2, 3.0, 0.32];
      if (inter.doorOpen) {
        this.collisionWorld.removeBox(`interact_${cfg.id}`);
        this.showToast('Security Bulkhead Opened');
      } else {
        this.collisionWorld.addBox(
          `interact_${cfg.id}`,
          cfg.position[0],
          dh / 2,
          cfg.position[2],
          dw,
          dh,
          dd,
          { isCover: false, blocksVision: true, surfaceType: 'door' }
        );
        this.showToast('Security Bulkhead Closed');
      }
      this.audio.playWeaponSwitch();
      return;
    }

    // 5. Tactical Equipment Supply Crate
    if (cfg.type === 'supply_crate_tactical') {
      if (inter.used) return;
      inter.used = true;
      this.health = Math.min(this.maxHealth, this.health + 35);
      this.armor = Math.min(this.maxArmor, this.armor + 35);
      this.armorPlates = Math.min(this.maxArmorPlates, this.armorPlates + 1);
      this.scannerCharges = Math.min(this.maxScannerCharges, this.scannerCharges + 1);
      this.grenadeInventory.frag = Math.min(
        this.maxGrenadesPerType,
        this.grenadeInventory.frag + 1
      );
      this.grenadeInventory.smoke = Math.min(
        this.maxGrenadesPerType,
        this.grenadeInventory.smoke + 1
      );
      ([1, 2, 3] as const).forEach((s) => {
        this.slots[s].state.reserveAmmo = this.slots[s].def.maxReserveAmmo;
      });
      this.audio.playObjectiveComplete();
      this.showToast('Tactical Supply Crate Opened: Health, Armor, Ammo, Grenades & Scanner Restored!');
      return;
    }

    if (cfg.type === 'ammo_crate') {
      ([1, 2, 3] as const).forEach((s) => {
        this.slots[s].state.reserveAmmo = this.slots[s].def.maxReserveAmmo;
        this.slots[s].state.currentMag = this.slots[s].def.magazineSize;
      });
      this.grenadeInventory.frag = Math.min(
        this.maxGrenadesPerType,
        this.grenadeInventory.frag + 1
      );
      if (this.mission.mode !== GameMode.Survival && !cfg.objectiveId) {
        inter.used = true;
      }
      this.audio.playReload();
      this.showToast('Ammunition & Frag Grenades Resupplied');
    } else if (cfg.type === 'medkit_station') {
      if (this.health >= this.maxHealth && this.armor >= this.maxArmor && !cfg.objectiveId) {
        this.showToast('Health and Armor are already at maximum capacity!');
        return;
      }
      this.health = this.maxHealth;
      this.armor = Math.max(this.armor, 60);
      if (this.mission.mode !== GameMode.Survival && !cfg.objectiveId) {
        inter.used = true;
      }
      this.audio.playObjectiveComplete();
      this.showToast('Health & Tactical Armor Restored');
    }

    if (cfg.objectiveId) {
      inter.used = true;
      (inter.beaconMesh.material as THREE.MeshStandardMaterial).color.setHex(0x10b981);
      (inter.beaconMesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x10b981);

      const obj = this.objectives.find((o) => o.id === cfg.objectiveId);
      if (obj && !obj.completed) {
        obj.currentCount = Math.min(obj.targetCount, obj.currentCount + 1);
        if (obj.currentCount >= obj.targetCount) {
          obj.completed = true;
          this.audio.playObjectiveComplete();
          this.showToast(`Objective Complete: ${obj.title}`);
        } else {
          this.audio.playWeaponSwitch();
          this.showToast(`${obj.title}: ${obj.currentCount}/${obj.targetCount}`);
        }
      }
    }
  }

  private updateMissionRules(dt: number): void {
    const aliveEnemies = this.enemies.filter((e) => e.isAlive()).length;

    const nonExtractObjs = this.objectives.filter((o) => o.type !== 'reach_zone' && !o.optional);
    const allPrimaryDone = nonExtractObjs.every((o) => o.completed);

    if (this.extractionRing) {
      this.extractionRing.rotation.z += dt * 0.8;
      (this.extractionRing.material as THREE.MeshStandardMaterial).opacity = allPrimaryDone
        ? 0.9
        : 0.22;
    }

    if (this.mission.mode === GameMode.Survival) {
      if (aliveEnemies === 0) {
        this.waveCooldownTimer += dt;
        if (this.waveCooldownTimer >= 3.0) {
          this.waveCooldownTimer = 0;
          const waveObj = this.objectives.find((o) => o.type === 'survive_waves');
          if (waveObj) {
            waveObj.currentCount = this.survivalWave;
            if (this.survivalWave >= waveObj.targetCount && !waveObj.completed) {
              waveObj.completed = true;
              this.audio.playObjectiveComplete();
              this.finishMission(true);
              return;
            }
          }
          this.survivalWave += 1;
          this.spawnNextSurvivalWave(this.survivalWave);
        }
      }
      return;
    }

    const extractObj = this.objectives.find((o) => o.type === 'reach_zone');
    if (extractObj && allPrimaryDone) {
      const [exX, , exZ] = this.mission.extractionPoint;
      const distToExtract = Math.hypot(this.playerPos.x - exX, this.playerPos.z - exZ);
      if (distToExtract <= 3.6) {
        extractObj.currentCount = 1;
        extractObj.completed = true;
        this.audio.playObjectiveComplete();
        this.finishMission(true);
      }
    }
  }

  private spawnNextSurvivalWave(waveNum: number): void {
    this.showToast(`HOSTILE QRF WAVE ${waveNum} INBOUND!`);
    this.audio.playEnemyAlert();
    const spawnCoords: [number, number, number][] = [
      [-18, 0, -18],
      [18, 0, -18],
      [-18, 0, 4],
      [18, 0, 4],
      [0, 0, -28],
    ];
    const count = Math.min(7, 3 + waveNum);
    for (let i = 0; i < count; i++) {
      const pt = spawnCoords[i % spawnCoords.length];
      const pers =
        waveNum >= 3 && i % 2 === 0
          ? EnemyPersonality.Elite
          : i % 2 === 0
            ? EnemyPersonality.Assault
            : EnemyPersonality.Scout;
      const agent = new EnemyAgent(
        {
          id: `wave_${waveNum}_${i}`,
          personality: pers,
          position: [pt[0] + (Math.random() - 0.5) * 3, 0, pt[2]],
          patrolPoints: [pt, [0, 0, 12]],
          health: 95 + waveNum * 15,
          armor: 20 + waveNum * 12,
        },
        this.scene
      );
      agent.receiveSquadAlert(this.playerPos);
      this.enemies.push(agent);
    }
  }

  private finishMission(victory: boolean, failureReason?: string): void {
    if (this.missionEnded) return;
    this.missionEnded = true;
    this.isFiringHeld = false;
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }

    const completedCount = this.objectives.filter((o) => o.completed).length;
    this.onMissionFinish({
      victory,
      failureReason,
      completionTimeSec: this.missionTimeSec,
      enemiesDefeated: this.enemiesDefeated,
      headshots: this.headshots,
      shotsFired: this.shotsFired,
      shotsHit: this.shotsHit,
      damageReceived: this.damageReceived,
      objectivesCompleted: completedCount,
      totalObjectives: this.objectives.length,
      stealthBonusEarned: victory && this.stealthIntact,
      survivalWaveReached: this.mission.mode === GameMode.Survival ? this.survivalWave : 0,
      matchToken: `${this.mission.id}_${Math.round(this.missionTimeSec * 100)}_${Date.now()}`,
    });
  }

  private emitHudState(): void {
    const activeObj = this.slots[this.activeSlot];
    const spreadRad = this.isAiming ? activeObj.def.adsSpreadRad : activeObj.def.hipSpreadRad;
    const speedFactor = this.playerVel.length() > 1.5 ? 1.45 : 1.0;
    const crosshairSpreadPx = Math.round(spreadRad * speedFactor * 480);

    const nonExtractObjs = this.objectives.filter((o) => o.type !== 'reach_zone' && !o.optional);
    const allPrimaryComplete = nonExtractObjs.every((o) => o.completed);

    _playerEye.set(
      this.playerPos.x,
      this.playerPos.y + this.currentEyeHeight,
      this.playerPos.z
    );

    const radarBlips: RadarBlip[] = [];
    for (const enemy of this.enemies) {
      if (!enemy.isAlive()) continue;
      const dist = enemy.position.distanceTo(this.playerPos);
      _enemyEye.set(enemy.position.x, enemy.position.y + 1.5, enemy.position.z);

      // Realistic Radar Rules: Only reveal enemy if alerted/engaging, within 16m acoustic range, or within true Line-of-Sight
      const hasLos =
        dist <= 38 && this.collisionWorld.hasLineOfSight(_playerEye, _enemyEye);
      if (enemy.awareness >= 75 || dist <= 16 || hasLos) {
        radarBlips.push({
          id: enemy.id,
          x: enemy.position.x - this.playerPos.x,
          z: enemy.position.z - this.playerPos.z,
          type: enemy.awareness >= 75 ? 'enemy_alert' : 'enemy_unaware',
        });
      }
    }

    for (const inter of this.interactables) {
      if (inter.used) continue;
      if (inter.config.objectiveId) {
        radarBlips.push({
          id: inter.config.id,
          x: inter.config.position[0] - this.playerPos.x,
          z: inter.config.position[2] - this.playerPos.z,
          type: 'objective',
        });
      } else if (this.scannerActiveTimer > 0) {
        radarBlips.push({
          id: inter.config.id,
          x: inter.config.position[0] - this.playerPos.x,
          z: inter.config.position[2] - this.playerPos.z,
          type: 'supply',
        });
      }
    }

    if (allPrimaryComplete) {
      radarBlips.push({
        id: 'extraction_point',
        x: this.mission.extractionPoint[0] - this.playerPos.x,
        z: this.mission.extractionPoint[2] - this.playerPos.z,
        type: 'extraction',
      });
    }

    this.onHudUpdate({
      health: this.health,
      maxHealth: this.maxHealth,
      armor: this.armor,
      maxArmor: this.maxArmor,
      armorPlates: this.armorPlates,
      maxArmorPlates: this.maxArmorPlates,
      medkitsCarried: this.medkitsCarried,
      maxMedkitsCarried: this.maxMedkitsCarried,
      stamina: Math.round(this.stamina),
      maxStamina: this.maxStamina,
      isCrouching: this.isCrouching,
      isSprinting: this.isSprinting,
      isAiming: this.isAiming,
      dashCooldown: this.dashCooldown,
      activeSlot: this.activeSlot,
      activeWeapon: activeObj.def,
      activeAttachments: activeObj.attachments,
      weaponState: { ...activeObj.state },
      allWeapons: {
        1: { def: this.slots[1].def, state: { ...this.slots[1].state } },
        2: { def: this.slots[2].def, state: { ...this.slots[2].state } },
        3: { def: this.slots[3].def, state: { ...this.slots[3].state } },
      },
      activeGrenadeType: this.activeGrenadeType,
      grenadeInventory: { ...this.grenadeInventory },
      grenades: this.grenadeInventory[this.activeGrenadeType],
      maxGrenades: this.maxGrenadesPerType,
      grenadeCooldown: this.grenadeCooldown,
      scannerCharges: this.scannerCharges,
      maxScannerCharges: this.maxScannerCharges,
      scannerActiveTimer: this.scannerActiveTimer,
      scannerCooldown: this.scannerCooldown,
      flashlightOn: this.flashlightOn,
      flashlightBattery: Math.round(this.flashlightBattery),
      nightVisionActive: this.nightVisionActive,
      nightVisionBattery: Math.round(this.nightVisionBattery),
      crosshairSpreadPx,
      hitMarkerType: this.hitMarkerType,
      damageFlashIntensity: this.damageFlashIntensity,
      flashbangBlindIntensity: this.flashbangBlindIntensity,
      damageDirectionAngle: this.damageDirectionAngle,
      interactionPrompt: this.activePrompt,
      interactionSubtext: this.activeInteractionSubtext,
      interactionProgress: this.interactionProgress,
      objectives: this.objectives.map((o) => ({ ...o })),
      allPrimaryComplete,
      missionTimeSec: this.missionTimeSec,
      timeLimitSec: this.mission.timeLimitSec,
      survivalWave: this.survivalWave,
      enemiesRemaining: this.enemies.filter((e) => e.isAlive()).length,
      stealthIntact: this.stealthIntact,
      playerYaw: this.playerYaw,
      radarBlips,
      killFeed: [...this.killFeed],
      statusToast: this.statusToast,
      fps: this.fps,
      isPointerLocked: this.isPointerLocked,
    });
  }

  public dispose(): void {
    this.isDisposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.unbindEvents();
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }
    if (this.composer) {
      this.composer.dispose();
    }
    if (this.ssaoPass) {
      this.ssaoPass.dispose();
    }
    if (this.bloomPass) {
      this.bloomPass.dispose();
    }
    this.renderer.dispose();
  }
}
