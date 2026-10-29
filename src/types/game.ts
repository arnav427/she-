export enum GameMode {
  Campaign = 'CAMPAIGN',
  Survival = 'SURVIVAL',
  TimeChallenge = 'TIME_CHALLENGE',
  Training = 'TRAINING',
  Hardcore = 'HARDCORE',
  Custom = 'CUSTOM_OP',
}

export enum WeaponClass {
  AssaultRifle = 'Assault Rifle',
  SubmachineGun = 'Submachine Gun',
  Shotgun = 'Tactical Shotgun',
  PrecisionRifle = 'Precision Rifle',
  Sidearm = 'Sidearm',
}

export type MapEnvironmentId =
  | 'training_compound'
  | 'industrial_facility'
  | 'desert_outpost'
  | 'night_infiltration'
  | 'urban_warzone'
  | 'jungle_valley'
  | 'snowbound_base'
  | 'naval_dockyard'
  | 'construction_site'
  | 'mountain_fortress'
  | 'rural_battlefield'
  | 'airfield_assault'
  | 'research_facility'
  | 'coastal_port';

export type AtmospherePresetId =
  | 'clear_daylight'
  | 'golden_sunset'
  | 'overcast_industrial'
  | 'night_operation'
  | 'dusty_desert';

export type SurfaceMaterialType =
  | 'concrete'
  | 'metal'
  | 'dirt'
  | 'wood'
  | 'glass'
  | 'explosive_barrel'
  | 'destructible_crate'
  | 'door';

export type WeaponId =
  | 'vx47_carbine'
  | 'k7_vector'
  | 'm870_breacher'
  | 'srs99_longbow'
  | 'p226_tactical';

export type WeaponSkinId =
  | 'tactical_black'
  | 'carbon_fiber'
  | 'woodland_camo'
  | 'desert_camo'
  | 'urban_digital'
  | 'titanium_gold';

export interface WeaponSkinDefinition {
  id: WeaponSkinId;
  name: string;
  patternType: 'Matte' | 'Woven Composite' | 'Military Camo' | 'Arid Disruptive' | 'Digital Hex' | 'Precious Alloy';
  description: string;
  rarity: 'Standard' | 'Tactical' | 'Elite' | 'Legendary';
  previewColor: string;
  accentColor: string;
  metalness: number;
  roughness: number;
}

export type GrenadeType = 'frag' | 'smoke' | 'flash' | 'emp';

export type OpticAttachmentId = 'iron' | 'red_dot' | 'holo' | 'acog';
export type BarrelAttachmentId = 'none' | 'suppressor';
export type MagAttachmentId = 'standard' | 'extended';
export type UnderbarrelAttachmentId = 'none' | 'foregrip';

export interface WeaponAttachmentConfig {
  optic: OpticAttachmentId;
  barrel: BarrelAttachmentId;
  magazine: MagAttachmentId;
  underbarrel: UnderbarrelAttachmentId;
}

export interface WeaponDefinition {
  id: WeaponId;
  name: string;
  designation: string;
  weaponClass: WeaponClass;
  slotType: 'primary' | 'secondary' | 'sidearm';
  damage: number;
  headshotMultiplier: number;
  fireRateRPM: number;
  automatic: boolean;
  magazineSize: number;
  maxReserveAmmo: number;
  reloadTimeSec: number;
  pellets: number;
  hipSpreadRad: number;
  adsSpreadRad: number;
  adsZoomFov: number;
  recoilPitch: number;
  recoilYaw: number;
  effectiveRange: number;
  maxRange: number;
  moveSpeedMultiplier: number;
  unlockMissionIndex: number;
  unlockConditionText: string;
  description: string;
  defaultSkin?: WeaponSkinId;
  availableSkins?: WeaponSkinId[];
}

export interface WeaponRuntimeState {
  id: WeaponId;
  currentMag: number;
  effectiveMagSize?: number;
  reserveAmmo: number;
  isReloading: boolean;
  reloadTimer: number;
  lastFireTime: number;
}

export enum EnemyPersonality {
  Guard = 'Guard',
  Assault = 'Assault',
  Defender = 'Defender',
  Scout = 'Scout',
  Elite = 'Elite',
}

export enum EnemyAIState {
  Patrol = 'PATROL',
  Guard = 'GUARD',
  Suspicious = 'SUSPICIOUS',
  Investigate = 'INVESTIGATE',
  Alert = 'ALERT',
  SeekCover = 'SEEK_COVER',
  Engage = 'ENGAGE',
  Flank = 'FLANK',
  Retreat = 'RETREAT',
  Search = 'SEARCH',
  ReturnToPatrol = 'RETURN_TO_PATROL',
  Defeated = 'DEFEATED',
}

export type ObjectiveType =
  | 'eliminate_all'
  | 'interact_object'
  | 'reach_zone'
  | 'survive_waves'
  | 'defend_zone';

export interface MissionObjective {
  id: string;
  title: string;
  description: string;
  type: ObjectiveType;
  targetCount: number;
  currentCount: number;
  completed: boolean;
  failed: boolean;
  optional?: boolean;
  targetPosition?: [number, number, number];
}

export type InteractiveObjectType =
  | 'intel_terminal'
  | 'radar_jammer'
  | 'ammo_crate'
  | 'medkit_station'
  | 'medkit_small'
  | 'medkit_large'
  | 'armor_plate'
  | 'ammo_pack_rifle'
  | 'ammo_pack_shotgun'
  | 'ammo_pack_pistol'
  | 'ammo_pack_sniper'
  | 'supply_crate_tactical'
  | 'security_door'
  | 'extraction_beacon';

export interface InteractiveObjectConfig {
  id: string;
  type: InteractiveObjectType;
  label: string;
  interactionPrompt: string;
  position: [number, number, number];
  objectiveId?: string;
  interactionDurationSec: number;
  healAmount?: number;
  armorAmount?: number;
  ammoAmount?: number;
  doorSize?: [number, number, number];
  requiresObjectiveId?: string;
}

export interface EnemySpawnConfig {
  id: string;
  personality: EnemyPersonality;
  position: [number, number, number];
  patrolPoints: [number, number, number][];
  health: number;
  armor: number;
  isCommander?: boolean;
}

export interface MissionDefinition {
  id: string;
  index: number;
  codeName: string;
  title: string;
  subtitle: string;
  mode: GameMode;
  mapId: MapEnvironmentId;
  atmosphere?: AtmospherePresetId;
  difficulty: 'Recruit' | 'Operative' | 'Veteran' | 'Shadow';
  briefing: string;
  tacticalAdvice: string;
  unlockRequirementMissionId?: string;
  timeLimitSec?: number;
  playerSpawn: [number, number, number];
  playerSpawnYaw: number;
  objectives: Omit<MissionObjective, 'currentCount' | 'completed' | 'failed'>[];
  interactables: InteractiveObjectConfig[];
  enemies: EnemySpawnConfig[];
  extractionPoint: [number, number, number];
  baseXpReward: number;
  dynamicSeed?: string;
  dynamicReconSummary?: string;
  dynamicSectorTags?: string[];
}

export interface GameSettings {
  mouseSensitivity: number;
  invertMouseY: boolean;
  fov: number;
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  graphicsQuality: 'low' | 'medium' | 'high' | 'ultra';
  resolutionScale: number;
  cameraShake: boolean;
  motionEffects: boolean;
  difficultyMultiplier: 'easy' | 'normal' | 'hard';
  pickupHighlights: boolean;
}

export interface MissionBestRecord {
  missionId: string;
  completed: boolean;
  bestScore: number;
  bestTimeSec: number;
  bestAccuracy: number;
  stars: number;
}

export interface PlayerAchievement {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  unlockedAt?: string;
}

export interface PlayerStatistics {
  missionsCompleted: number;
  enemiesDefeated: number;
  headshots: number;
  shotsFired: number;
  shotsHit: number;
  totalPlaytimeSec: number;
  bestSurvivalWave: number;
  objectivesCompleted: number;
}

export interface SaveData {
  version: number;
  xp: number;
  rankTitle: string;
  unlockedWeapons: WeaponId[];
  equippedLoadout: {
    primary: WeaponId;
    secondary: WeaponId;
    sidearm: WeaponId;
  };
  weaponAttachments: Record<WeaponId, WeaponAttachmentConfig>;
  weaponSkins?: Record<WeaponId, WeaponSkinId>;
  missionRecords: Record<string, MissionBestRecord>;
  achievements: PlayerAchievement[];
  statistics: PlayerStatistics;
  settings: GameSettings;
}

export interface RadarBlip {
  id: string;
  x: number;
  z: number;
  type: 'enemy_unaware' | 'enemy_alert' | 'objective' | 'extraction' | 'supply';
}

export interface KillFeedEntry {
  id: string;
  killer: string;
  victim: string;
  weaponName: string;
  isHeadshot: boolean;
  timestamp: number;
}

export interface HUDState {
  health: number;
  maxHealth: number;
  armor: number;
  maxArmor: number;
  armorPlates: number;
  maxArmorPlates: number;
  medkitsCarried: number;
  maxMedkitsCarried: number;
  stamina: number;
  maxStamina: number;
  isCrouching: boolean;
  isSprinting: boolean;
  isAiming: boolean;
  dashCooldown: number;
  activeSlot: 1 | 2 | 3;
  activeWeapon: WeaponDefinition;
  activeAttachments: WeaponAttachmentConfig;
  weaponState: WeaponRuntimeState;
  allWeapons: Record<1 | 2 | 3, { def: WeaponDefinition; state: WeaponRuntimeState }>;
  activeGrenadeType: GrenadeType;
  grenadeInventory: Record<GrenadeType, number>;
  grenades: number;
  maxGrenades: number;
  grenadeCooldown: number;
  scannerCharges: number;
  maxScannerCharges: number;
  scannerActiveTimer: number;
  scannerCooldown: number;
  flashlightOn: boolean;
  flashlightBattery: number;
  nightVisionActive: boolean;
  nightVisionBattery: number;
  crosshairSpreadPx: number;
  hitMarkerType: 'none' | 'normal' | 'headshot' | 'kill';
  damageFlashIntensity: number;
  flashbangBlindIntensity: number;
  damageDirectionAngle: number | null;
  interactionPrompt: string | null;
  interactionSubtext?: string | null;
  interactionProgress: number;
  objectives: MissionObjective[];
  allPrimaryComplete: boolean;
  missionTimeSec: number;
  timeLimitSec?: number;
  survivalWave: number;
  enemiesRemaining: number;
  stealthIntact: boolean;
  playerYaw: number;
  radarBlips: RadarBlip[];
  killFeed: KillFeedEntry[];
  statusToast: string | null;
  fps: number;
  isPointerLocked: boolean;
}

export interface MissionResultSummary {
  mission: MissionDefinition;
  victory: boolean;
  failureReason?: string;
  completionTimeSec: number;
  enemiesDefeated: number;
  headshots: number;
  shotsFired: number;
  shotsHit: number;
  accuracyPercent: number;
  damageReceived: number;
  objectivesCompleted: number;
  totalObjectives: number;
  stealthBonusEarned: boolean;
  xpEarned: number;
  newlyUnlockedWeapons: WeaponId[];
  newlyUnlockedAchievements: string[];
  survivalWaveReached: number;
}
