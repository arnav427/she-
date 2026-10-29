import {
  WeaponAttachmentConfig,
  WeaponClass,
  WeaponDefinition,
  WeaponId,
  WeaponRuntimeState,
  WeaponSkinDefinition,
  WeaponSkinId,
} from '../types/game';

export const ALL_WEAPON_SKIN_IDS: WeaponSkinId[] = [
  'tactical_black',
  'carbon_fiber',
  'woodland_camo',
  'desert_camo',
  'urban_digital',
  'titanium_gold',
];

export const WEAPON_SKIN_DEFINITIONS: Record<WeaponSkinId, WeaponSkinDefinition> = {
  tactical_black: {
    id: 'tactical_black',
    name: 'Tactical Matte',
    patternType: 'Matte',
    description: 'Anti-reflective anodized gunmetal with bead-blasted tactical finish.',
    rarity: 'Standard',
    previewColor: '#1c1f24',
    accentColor: '#38bdf8',
    metalness: 0.88,
    roughness: 0.35,
  },
  carbon_fiber: {
    id: 'carbon_fiber',
    name: 'Carbon Fiber',
    patternType: 'Woven Composite',
    description: 'High-modulus twill-weave carbon fiber composite with protective polymer gloss clearcoat.',
    rarity: 'Tactical',
    previewColor: '#18181b',
    accentColor: '#38bdf8',
    metalness: 0.75,
    roughness: 0.22,
  },
  woodland_camo: {
    id: 'woodland_camo',
    name: 'Woodland M81',
    patternType: 'Military Camo',
    description: '4-tone disruptive military forest camouflage in NATO green, coyote brown, and black.',
    rarity: 'Tactical',
    previewColor: '#3a4b35',
    accentColor: '#10b981',
    metalness: 0.45,
    roughness: 0.65,
  },
  desert_camo: {
    id: 'desert_camo',
    name: 'Desert Stalker',
    patternType: 'Arid Disruptive',
    description: 'Tri-color arid concealment pattern with baked Cerakote heat-resistant durability.',
    rarity: 'Elite',
    previewColor: '#c2b280',
    accentColor: '#f59e0b',
    metalness: 0.42,
    roughness: 0.62,
  },
  urban_digital: {
    id: 'urban_digital',
    name: 'Urban Digital',
    patternType: 'Digital Hex',
    description: 'Sub-zero digital micro-pixel camouflage optimized for metropolitan and night operations.',
    rarity: 'Elite',
    previewColor: '#475569',
    accentColor: '#38bdf8',
    metalness: 0.65,
    roughness: 0.48,
  },
  titanium_gold: {
    id: 'titanium_gold',
    name: 'Titanium Gold',
    patternType: 'Precious Alloy',
    description: 'Mirror-polished titanium nitride gold plating with brushed chrome tactical appointments.',
    rarity: 'Legendary',
    previewColor: '#d4af37',
    accentColor: '#fbbf24',
    metalness: 0.95,
    roughness: 0.18,
  },
};

export const DEFAULT_WEAPON_SKINS: Record<WeaponId, WeaponSkinId> = {
  vx47_carbine: 'tactical_black',
  k7_vector: 'tactical_black',
  m870_breacher: 'tactical_black',
  srs99_longbow: 'woodland_camo',
  p226_tactical: 'tactical_black',
};

export const WEAPON_DEFINITIONS: Record<WeaponId, WeaponDefinition> = {
  vx47_carbine: {
    id: 'vx47_carbine',
    name: 'VX-47 Tactical Carbine',
    designation: '5.56×45mm NATO Modular Rifle',
    weaponClass: WeaponClass.AssaultRifle,
    slotType: 'primary',
    damage: 30,
    headshotMultiplier: 2.0,
    fireRateRPM: 650,
    automatic: true,
    magazineSize: 30,
    maxReserveAmmo: 150,
    reloadTimeSec: 2.1,
    pellets: 1,
    hipSpreadRad: 0.026,
    adsSpreadRad: 0.004,
    recoilPitch: 0.018,
    recoilYaw: 0.007,
    effectiveRange: 45,
    maxRange: 110,
    adsZoomFov: 52,
    moveSpeedMultiplier: 0.96,
    unlockMissionIndex: 0,
    unlockConditionText: 'Standard Issue Operative Primary',
    description:
      'Balanced gas-operated tactical carbine. Offers dependable stopping power, manageable recoil, and high versatility across medium-range firefights.',
    defaultSkin: 'tactical_black',
    availableSkins: ALL_WEAPON_SKIN_IDS,
  },
  k7_vector: {
    id: 'k7_vector',
    name: 'K7 Specter SMG',
    designation: '.45 ACP Delayed-Blowback Submachine Gun',
    weaponClass: WeaponClass.SubmachineGun,
    slotType: 'secondary',
    damage: 21,
    headshotMultiplier: 1.75,
    fireRateRPM: 920,
    automatic: true,
    magazineSize: 35,
    maxReserveAmmo: 175,
    reloadTimeSec: 1.65,
    pellets: 1,
    hipSpreadRad: 0.022,
    adsSpreadRad: 0.007,
    recoilPitch: 0.013,
    recoilYaw: 0.009,
    effectiveRange: 24,
    maxRange: 65,
    adsZoomFov: 60,
    moveSpeedMultiplier: 1.04,
    unlockMissionIndex: 0,
    unlockConditionText: 'Standard Issue Close-Quarters Submachine Gun',
    description:
      'Ultra-high cyclic rate submachine gun engineered for rapid room clearing and aggressive flanking maneuvers with minimal handling weight.',
  },
  m870_breacher: {
    id: 'm870_breacher',
    name: 'M870 Combat Breacher',
    designation: '12-Gauge 00-Buckshot Tactical Shotgun',
    weaponClass: WeaponClass.Shotgun,
    slotType: 'secondary',
    damage: 19, // Per pellet (8 pellets = 152 max close-range damage)
    headshotMultiplier: 1.5,
    fireRateRPM: 85,
    automatic: false,
    magazineSize: 6,
    maxReserveAmmo: 36,
    reloadTimeSec: 2.5,
    pellets: 8,
    hipSpreadRad: 0.068,
    adsSpreadRad: 0.042,
    recoilPitch: 0.062,
    recoilYaw: 0.018,
    effectiveRange: 14,
    maxRange: 36,
    adsZoomFov: 62,
    moveSpeedMultiplier: 0.94,
    unlockMissionIndex: 1,
    unlockConditionText: 'Complete Operation Iron Gate (Mission 1) or earn 300 XP',
    description:
      'Heavy pump-action combat shotgun firing eight 00-buckshot pellets per shell. Devastating at close quarters with steep ballistic falloff over distance.',
  },
  srs99_longbow: {
    id: 'srs99_longbow',
    name: 'SRS-99 Longbow DMR',
    designation: '.338 Lapua Magnum Precision Rifle',
    weaponClass: WeaponClass.PrecisionRifle,
    slotType: 'primary',
    damage: 92,
    headshotMultiplier: 2.5,
    fireRateRPM: 65,
    automatic: false,
    magazineSize: 8,
    maxReserveAmmo: 40,
    reloadTimeSec: 2.6,
    pellets: 1,
    hipSpreadRad: 0.055,
    adsSpreadRad: 0.0006,
    recoilPitch: 0.058,
    recoilYaw: 0.01,
    effectiveRange: 85,
    maxRange: 180,
    adsZoomFov: 28,
    moveSpeedMultiplier: 0.9,
    unlockMissionIndex: 2,
    unlockConditionText: 'Complete Operation Silent Ash (Mission 2) or earn 700 XP',
    description:
      'Long-range precision marksman rifle fitted with a variable tele-optic. Capable of neutralizing heavily armored hostiles with a single precision headshot.',
  },
  p226_tactical: {
    id: 'p226_tactical',
    name: 'P226 Shadow Sidearm',
    designation: '9×19mm Parabellum Suppressed Pistol',
    weaponClass: WeaponClass.Sidearm,
    slotType: 'sidearm',
    damage: 34,
    headshotMultiplier: 2.1,
    fireRateRPM: 360,
    automatic: false,
    magazineSize: 15,
    maxReserveAmmo: 75,
    reloadTimeSec: 1.35,
    pellets: 1,
    hipSpreadRad: 0.018,
    adsSpreadRad: 0.003,
    recoilPitch: 0.022,
    recoilYaw: 0.005,
    effectiveRange: 25,
    maxRange: 65,
    adsZoomFov: 64,
    moveSpeedMultiplier: 1.06,
    unlockMissionIndex: 0,
    unlockConditionText: 'Standard Issue Tactical Backup Sidearm',
    description:
      'Reliable semi-automatic tactical pistol with an integrated sound suppressor—reduces acoustic detection radius and draws rapidly in emergencies.',
  },
};

export const WEAPON_LIST: WeaponDefinition[] = Object.values(WEAPON_DEFINITIONS);

export const DEFAULT_WEAPON_ATTACHMENTS: Record<WeaponId, WeaponAttachmentConfig> = {
  vx47_carbine: {
    optic: 'red_dot',
    barrel: 'none',
    magazine: 'standard',
    underbarrel: 'foregrip',
  },
  k7_vector: {
    optic: 'holo',
    barrel: 'none',
    magazine: 'standard',
    underbarrel: 'none',
  },
  m870_breacher: {
    optic: 'iron',
    barrel: 'none',
    magazine: 'standard',
    underbarrel: 'foregrip',
  },
  srs99_longbow: {
    optic: 'acog',
    barrel: 'none',
    magazine: 'standard',
    underbarrel: 'none',
  },
  p226_tactical: {
    optic: 'iron',
    barrel: 'suppressor',
    magazine: 'standard',
    underbarrel: 'none',
  },
};

export function getEffectiveWeaponStats(
  weapon: WeaponDefinition,
  attachments?: WeaponAttachmentConfig
): WeaponDefinition & { soundRadiusMeters: number; isSuppressed: boolean } {
  const att = attachments || DEFAULT_WEAPON_ATTACHMENTS[weapon.id];
  const magMultiplier = att.magazine === 'extended' ? 1.35 : 1.0;
  const effectiveMag = Math.max(weapon.magazineSize, Math.round(weapon.magazineSize * magMultiplier));

  const recoilMultiplier = att.underbarrel === 'foregrip' ? 0.72 : 1.0;
  const opticSpreadMult =
    att.optic === 'acog' ? 0.7 : att.optic === 'red_dot' || att.optic === 'holo' ? 0.82 : 1.0;
  const effectiveAdsFov =
    weapon.id === 'srs99_longbow'
      ? weapon.adsZoomFov
      : att.optic === 'acog'
        ? 40
        : att.optic === 'holo' || att.optic === 'red_dot'
          ? 52
          : weapon.adsZoomFov;

  const isSuppressed = att.barrel === 'suppressor' || weapon.id === 'p226_tactical';
  const soundRadiusMeters = isSuppressed ? 9 : 34;

  return {
    ...weapon,
    magazineSize: effectiveMag,
    recoilPitch: Number((weapon.recoilPitch * recoilMultiplier).toFixed(4)),
    recoilYaw: Number((weapon.recoilYaw * recoilMultiplier).toFixed(4)),
    adsSpreadRad: Number((weapon.adsSpreadRad * opticSpreadMult).toFixed(5)),
    adsZoomFov: effectiveAdsFov,
    soundRadiusMeters,
    isSuppressed,
  };
}

/**
 * Deterministic ballistic damage calculator accounting for distance falloff,
 * headshot multiplier, and target armor mitigation.
 */
export function calculateBallisticDamage(
  weapon: WeaponDefinition,
  distanceMeters: number,
  isHeadshot: boolean,
  targetArmor: number
): { healthDamage: number; armorDamage: number } {
  if (distanceMeters > weapon.maxRange) {
    return { healthDamage: 0, armorDamage: 0 };
  }

  let distanceFactor = 1.0;
  if (distanceMeters > weapon.effectiveRange) {
    const excess = distanceMeters - weapon.effectiveRange;
    const span = Math.max(1, weapon.maxRange - weapon.effectiveRange);
    const minFactor = weapon.weaponClass === WeaponClass.Shotgun ? 0.15 : 0.45;
    distanceFactor = Math.max(minFactor, 1.0 - (excess / span) * (1.0 - minFactor));
  }

  const rawDamage = weapon.damage * distanceFactor * (isHeadshot ? weapon.headshotMultiplier : 1.0);

  if (targetArmor <= 0) {
    return {
      healthDamage: Math.round(rawDamage),
      armorDamage: 0,
    };
  }

  // Headshots bypass 75% of armor; body shots are absorbed 55% by armor
  const armorAbsorptionRatio = isHeadshot ? 0.25 : 0.55;
  const absorbedByArmor = Math.min(targetArmor, rawDamage * armorAbsorptionRatio);
  const healthDamage = Math.max(1, Math.round(rawDamage - absorbedByArmor));
  const armorDamage = Math.round(absorbedByArmor);

  return { healthDamage, armorDamage };
}

/**
 * Deterministic explosive damage calculator with radial distance falloff.
 */
export function calculateExplosionDamage(
  distanceMeters: number,
  blastRadiusMeters = 7.5,
  maxDamage = 165
): number {
  if (distanceMeters >= blastRadiusMeters) return 0;
  const normalized = 1 - distanceMeters / blastRadiusMeters;
  return Math.round(maxDamage * Math.pow(normalized, 1.35));
}

/**
 * Deterministic Medkit Pickup Validator & Applicator
 * Never exceeds maxHealth and refuses collection if player is already at full health.
 */
export function applyMedkitHeal(
  currentHealth: number,
  maxHealth: number,
  healAmount: number,
  alreadyUsed: boolean
): {
  collected: boolean;
  newHealth: number;
  restoredAmount: number;
  message: string;
} {
  if (alreadyUsed) {
    return {
      collected: false,
      newHealth: currentHealth,
      restoredAmount: 0,
      message: 'Medical supply already collected.',
    };
  }
  if (currentHealth >= maxHealth) {
    return {
      collected: false,
      newHealth: currentHealth,
      restoredAmount: 0,
      message: `Health already at maximum (${maxHealth}/${maxHealth}) — Medkit not needed.`,
    };
  }
  const newHealth = Math.min(maxHealth, currentHealth + Math.max(1, healAmount));
  const restoredAmount = newHealth - currentHealth;
  return {
    collected: true,
    newHealth,
    restoredAmount,
    message: `Field Medkit Applied (+${restoredAmount} HP)`,
  };
}

/**
 * Deterministic Armor Plate Pickup Validator & Applicator
 * Restores armor up to maxArmor or stores a spare plate up to maxPlates.
 */
export function applyArmorPickup(
  currentArmor: number,
  maxArmor: number,
  currentPlates: number,
  maxPlates: number,
  armorAmount: number,
  alreadyUsed: boolean
): {
  collected: boolean;
  newArmor: number;
  newPlates: number;
  restoredArmor: number;
  message: string;
} {
  if (alreadyUsed) {
    return {
      collected: false,
      newArmor: currentArmor,
      newPlates: currentPlates,
      restoredArmor: 0,
      message: 'Armor plate already collected.',
    };
  }
  if (currentArmor < maxArmor) {
    const newArmor = Math.min(maxArmor, currentArmor + Math.max(1, armorAmount));
    const restoredArmor = newArmor - currentArmor;
    return {
      collected: true,
      newArmor,
      newPlates: currentPlates,
      restoredArmor,
      message: `Ballistic Armor Plate Equipped (+${restoredArmor} Armor)`,
    };
  }
  if (currentPlates < maxPlates) {
    return {
      collected: true,
      newArmor: currentArmor,
      newPlates: currentPlates + 1,
      restoredArmor: 0,
      message: `Ballistic Armor Plate Stored in Pouch (${currentPlates + 1}/${maxPlates})`,
    };
  }
  return {
    collected: false,
    newArmor: currentArmor,
    newPlates: currentPlates,
    restoredArmor: 0,
    message: 'Armor and Reserve Plate Pouch already at maximum capacity.',
  };
}

/**
 * Deterministic Ammunition Pickup Validator & Applicator
 * Replenishes compatible weapon reserve ammo while respecting maxReserveAmmo.
 */
export function applyWeaponAmmoPickup(
  weaponDef: WeaponDefinition,
  weaponState: WeaponRuntimeState,
  compatibleClass: WeaponClass | 'ANY',
  ammoAmount: number,
  alreadyUsed: boolean
): {
  collected: boolean;
  newReserveAmmo: number;
  addedAmmo: number;
  message: string;
} {
  if (alreadyUsed) {
    return {
      collected: false,
      newReserveAmmo: weaponState.reserveAmmo,
      addedAmmo: 0,
      message: 'Ammunition pack already collected.',
    };
  }
  if (compatibleClass !== 'ANY' && weaponDef.weaponClass !== compatibleClass) {
    return {
      collected: false,
      newReserveAmmo: weaponState.reserveAmmo,
      addedAmmo: 0,
      message: `Incompatible ammunition (Requires ${compatibleClass}).`,
    };
  }
  if (weaponState.reserveAmmo >= weaponDef.maxReserveAmmo) {
    return {
      collected: false,
      newReserveAmmo: weaponState.reserveAmmo,
      addedAmmo: 0,
      message: `${weaponDef.name} reserve ammunition is already full (${weaponDef.maxReserveAmmo}).`,
    };
  }
  const newReserveAmmo = Math.min(weaponDef.maxReserveAmmo, weaponState.reserveAmmo + Math.max(1, ammoAmount));
  const addedAmmo = newReserveAmmo - weaponState.reserveAmmo;
  return {
    collected: true,
    newReserveAmmo,
    addedAmmo,
    message: `+${addedAmmo} ${weaponDef.weaponClass} Rounds Collected`,
  };
}
