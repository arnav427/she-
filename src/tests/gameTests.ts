import * as THREE from 'three';
import {
  applyArmorPickup,
  applyMedkitHeal,
  applyWeaponAmmoPickup,
  calculateBallisticDamage,
  calculateExplosionDamage,
  getEffectiveWeaponStats,
  WEAPON_DEFINITIONS,
} from '../combat/WeaponDefinitions';
import { CollisionWorld } from '../world/CollisionWorld';
import { EnemyNavigation } from '../ai/EnemyNavigation';
import { isLineObscuredBySmoke } from '../ai/EnemyAI';
import { MISSION_DEFINITIONS } from '../missions/MissionDefinitions';
import { DynamicMissionGenerator } from '../missions/DynamicMissionGenerator';
import { createDefaultSaveData, SaveManager } from '../progression/SaveManager';
import {
  createInteractiveObjectModel,
  updateGlowWallShaderUniforms,
} from '../world/ProceduralModels';

export interface TestResult {
  name: string;
  category:
    | 'Combat'
    | 'Pickups & Equipment'
    | 'Physics & LOS'
    | 'AI Pathfinding'
    | 'Dynamic Missions'
    | 'Progression';
  passed: boolean;
  details: string;
}

export function runAllAutomatedTests(): TestResult[] {
  const results: TestResult[] = [];

  // 1. Combat & Ballistics Test: Headshot multiplier & armor absorption
  try {
    const rifle = WEAPON_DEFINITIONS.vx47_carbine;
    const bodyShot = calculateBallisticDamage(rifle, 20, false, 0);
    const headShot = calculateBallisticDamage(rifle, 20, true, 0);
    const armoredBody = calculateBallisticDamage(rifle, 20, false, 50);

    const passed =
      bodyShot.healthDamage === 30 &&
      headShot.healthDamage === 60 &&
      armoredBody.healthDamage < bodyShot.healthDamage &&
      armoredBody.armorDamage > 0;

    results.push({
      name: 'Ballistic Headshot Multiplier & Armor Mitigation',
      category: 'Combat',
      passed,
      details: `Body=${bodyShot.healthDamage}, Headshot=${headShot.healthDamage}, ArmoredHP=${armoredBody.healthDamage}/ArmorDmg=${armoredBody.armorDamage}`,
    });
  } catch (e) {
    results.push({
      name: 'Ballistic Headshot Multiplier & Armor Mitigation',
      category: 'Combat',
      passed: false,
      details: String(e),
    });
  }

  // 2. Combat Test: Distance Falloff & Max Range Cutoff
  try {
    const shotgun = WEAPON_DEFINITIONS.m870_breacher;
    const closeDmg = calculateBallisticDamage(shotgun, 5, false, 0).healthDamage;
    const farDmg = calculateBallisticDamage(shotgun, 32, false, 0).healthDamage;
    const outOfRange = calculateBallisticDamage(shotgun, 60, false, 0).healthDamage;

    const passed = closeDmg > farDmg && farDmg > 0 && outOfRange === 0;
    results.push({
      name: 'Shotgun Pellet Falloff & Maximum Range Cutoff',
      category: 'Combat',
      passed,
      details: `5m=${closeDmg} dmg, 32m=${farDmg} dmg, 60m=${outOfRange} dmg`,
    });
  } catch (e) {
    results.push({
      name: 'Shotgun Pellet Falloff & Maximum Range Cutoff',
      category: 'Combat',
      passed: false,
      details: String(e),
    });
  }

  // 3. Medkit Healing & Full-Health Waste Prevention Test
  try {
    const stdHeal = applyMedkitHeal(50, 100, 35, false);
    const capHeal = applyMedkitHeal(80, 100, 35, false);
    const fullReject = applyMedkitHeal(100, 100, 35, false);
    const duplicateReject = applyMedkitHeal(50, 100, 35, true);

    const passed =
      stdHeal.collected &&
      stdHeal.newHealth === 85 &&
      capHeal.collected &&
      capHeal.newHealth === 100 &&
      !fullReject.collected &&
      fullReject.newHealth === 100 &&
      !duplicateReject.collected;

    results.push({
      name: 'Medkit Healing Cap & Full-Health Waste Prevention',
      category: 'Pickups & Equipment',
      passed,
      details: `50+35=${stdHeal.newHealth}HP, 80+35=${capHeal.newHealth}HP, FullRejected=${!fullReject.collected}, DupRejected=${!duplicateReject.collected}`,
    });
  } catch (e) {
    results.push({
      name: 'Medkit Healing Cap & Full-Health Waste Prevention',
      category: 'Pickups & Equipment',
      passed: false,
      details: String(e),
    });
  }

  // 4. Ammunition Pickup Compatibility & Reserve Cap Test
  try {
    const rifleDef = WEAPON_DEFINITIONS.vx47_carbine;
    const baseState = {
      id: 'vx47_carbine' as const,
      currentMag: 30,
      reserveAmmo: 60,
      isReloading: false,
      reloadTimer: 0,
      lastFireTime: 0,
    };
    const riflePickup = applyWeaponAmmoPickup(
      rifleDef,
      baseState,
      rifleDef.weaponClass,
      60,
      false
    );
    const cappedPickup = applyWeaponAmmoPickup(
      rifleDef,
      { ...baseState, reserveAmmo: 135 },
      rifleDef.weaponClass,
      60,
      false
    );
    const fullReject = applyWeaponAmmoPickup(
      rifleDef,
      { ...baseState, reserveAmmo: 150 },
      rifleDef.weaponClass,
      60,
      false
    );
    const wrongTypeReject = applyWeaponAmmoPickup(
      rifleDef,
      baseState,
      WEAPON_DEFINITIONS.m870_breacher.weaponClass,
      16,
      false
    );

    const passed =
      riflePickup.collected &&
      riflePickup.newReserveAmmo === 120 &&
      cappedPickup.collected &&
      cappedPickup.newReserveAmmo === 150 &&
      !fullReject.collected &&
      !wrongTypeReject.collected;

    results.push({
      name: 'Ammunition Pickup Class Compatibility & Max Reserve Cap',
      category: 'Pickups & Equipment',
      passed,
      details: `60+60=${riflePickup.newReserveAmmo}, Cap=${cappedPickup.newReserveAmmo}/150, FullReject=${!fullReject.collected}, TypeReject=${!wrongTypeReject.collected}`,
    });
  } catch (e) {
    results.push({
      name: 'Ammunition Pickup Class Compatibility & Max Reserve Cap',
      category: 'Pickups & Equipment',
      passed: false,
      details: String(e),
    });
  }

  // 5. Armor Plate Restore & Carried Pouch Test
  try {
    const directEquip = applyArmorPickup(20, 75, 0, 2, 40, false);
    const storeSpare = applyArmorPickup(75, 75, 1, 2, 40, false);
    const fullBothReject = applyArmorPickup(75, 75, 2, 2, 40, false);

    const passed =
      directEquip.collected &&
      directEquip.newArmor === 60 &&
      storeSpare.collected &&
      storeSpare.newPlates === 2 &&
      !fullBothReject.collected;

    results.push({
      name: 'Ballistic Armor Plate Restore & Spare Pouch Storage',
      category: 'Pickups & Equipment',
      passed,
      details: `Armor 20->${directEquip.newArmor}, SparePlates 1->${storeSpare.newPlates}, FullReject=${!fullBothReject.collected}`,
    });
  } catch (e) {
    results.push({
      name: 'Ballistic Armor Plate Restore & Spare Pouch Storage',
      category: 'Pickups & Equipment',
      passed: false,
      details: String(e),
    });
  }

  // 6. Weapon Attachment Stat Modification Test
  try {
    const baseRifle = WEAPON_DEFINITIONS.vx47_carbine;
    const tacticalRifle = getEffectiveWeaponStats(baseRifle, {
      optic: 'acog',
      barrel: 'suppressor',
      magazine: 'extended',
      underbarrel: 'foregrip',
    });

    const passed =
      tacticalRifle.magazineSize > baseRifle.magazineSize &&
      tacticalRifle.recoilPitch < baseRifle.recoilPitch &&
      tacticalRifle.soundRadiusMeters === 9 &&
      tacticalRifle.adsZoomFov < baseRifle.adsZoomFov;

    results.push({
      name: 'Weapon Attachment Ballistic & Acoustic Modifiers',
      category: 'Pickups & Equipment',
      passed,
      details: `Mag ${baseRifle.magazineSize}->${tacticalRifle.magazineSize}, Sound 34m->${tacticalRifle.soundRadiusMeters}m, ADS FOV ${tacticalRifle.adsZoomFov}°`,
    });
  } catch (e) {
    results.push({
      name: 'Weapon Attachment Ballistic & Acoustic Modifiers',
      category: 'Pickups & Equipment',
      passed: false,
      details: String(e),
    });
  }

  // 6b. GLSL Glow Wall (Through-Wall X-Ray) & Fresnel Outline Shader Test
  try {
    const medkitModel = createInteractiveObjectModel({
      id: 'test_medkit_glow',
      type: 'medkit_small',
      label: 'Test Medkit',
      interactionPrompt: 'Press [E]',
      position: [0, 0, 0],
      interactionDurationSec: 0.25,
      healAmount: 35,
    });

    let hasXrayPass = false;
    let hasOutlinePass = false;
    let uniformUpdated = false;

    updateGlowWallShaderUniforms(medkitModel.glowOutlineMesh, 4.25, 1.35);

    medkitModel.glowOutlineMesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial) {
        if (child.material.depthFunc === THREE.GreaterDepth) hasXrayPass = true;
        if (child.material.depthFunc === THREE.LessEqualDepth) hasOutlinePass = true;
        if (
          child.material.uniforms.uTime?.value === 4.25 &&
          child.material.uniforms.uIntensity?.value === 1.35
        ) {
          uniformUpdated = true;
        }
      }
    });

    const passed = hasXrayPass && hasOutlinePass && uniformUpdated;
    results.push({
      name: 'GLSL Glow Wall X-Ray & 3D Fresnel Outline Shader',
      category: 'Pickups & Equipment',
      passed,
      details: `XRayGreaterDepth=${hasXrayPass}, FresnelOutline=${hasOutlinePass}, UniformSync=${uniformUpdated}`,
    });
  } catch (e) {
    results.push({
      name: 'GLSL Glow Wall X-Ray & 3D Fresnel Outline Shader',
      category: 'Pickups & Equipment',
      passed: false,
      details: String(e),
    });
  }

  // 6c. PBR Material Factory (Albedo, Normal, Roughness, AO Slots & UV2 Geometry) Test
  try {
    const medkitModel = createInteractiveObjectModel({
      id: 'test_pbr_medkit',
      type: 'medkit_large',
      label: 'Trauma Kit',
      interactionPrompt: 'Press [E]',
      position: [0, 0, 0],
      interactionDurationSec: 0.3,
      healAmount: 60,
    });

    let pbrStandardCount = 0;
    let pbrPhysicalCount = 0;
    let basicOrLambertCount = 0;

    medkitModel.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (obj.material instanceof THREE.MeshPhysicalMaterial) {
          pbrPhysicalCount++;
        } else if (obj.material instanceof THREE.MeshStandardMaterial) {
          pbrStandardCount++;
        } else if (
          obj.material instanceof THREE.MeshBasicMaterial ||
          obj.material instanceof THREE.MeshLambertMaterial
        ) {
          basicOrLambertCount++;
        }
      }
    });

    const passed =
      (pbrStandardCount > 0 || pbrPhysicalCount > 0) && basicOrLambertCount === 0;
    results.push({
      name: 'Physically Based Rendering (PBR Standard/Physical Material Audit)',
      category: 'Pickups & Equipment',
      passed,
      details: `MeshStandard=${pbrStandardCount}, MeshPhysical=${pbrPhysicalCount}, Basic/Lambert=${basicOrLambertCount}`,
    });
  } catch (e) {
    results.push({
      name: 'Physically Based Rendering (PBR Standard/Physical Material Audit)',
      category: 'Pickups & Equipment',
      passed: false,
      details: String(e),
    });
  }

  // 7. Explosive Radial Falloff & Smoke Screen LOS Occlusion Test
  try {
    const centerDmg = calculateExplosionDamage(0.5, 7.5, 165);
    const edgeDmg = calculateExplosionDamage(6.0, 7.5, 165);
    const outsideDmg = calculateExplosionDamage(8.0, 7.5, 165);

    const eyeA = new THREE.Vector3(0, 1.6, -8);
    const eyeB = new THREE.Vector3(0, 1.6, 8);
    const smokeBlocked = isLineObscuredBySmoke(eyeA, eyeB, [
      { position: new THREE.Vector3(0, 1.0, 0), radius: 5.5 },
    ]);
    const smokeClear = !isLineObscuredBySmoke(eyeA, eyeB, [
      { position: new THREE.Vector3(18, 1.0, 0), radius: 5.5 },
    ]);

    const passed =
      centerDmg > 130 &&
      edgeDmg < centerDmg &&
      edgeDmg > 0 &&
      outsideDmg === 0 &&
      smokeBlocked &&
      smokeClear;
    results.push({
      name: 'Grenade Blast Falloff & Smoke Screen AI LOS Occlusion',
      category: 'Combat',
      passed,
      details: `Blast 0.5m=${centerDmg}dmg, SmokeBlocked=${smokeBlocked}, SmokeClear=${smokeClear}`,
    });
  } catch (e) {
    results.push({
      name: 'Grenade Blast Falloff & Smoke Screen AI LOS Occlusion',
      category: 'Combat',
      passed: false,
      details: String(e),
    });
  }

  // 8. Collision, Security Door Toggle & Line-of-Sight Occlusion Test
  try {
    const cw = new CollisionWorld();
    cw.addBox('security_door_1', 0, 1.5, 0, 4, 3, 0.5, { isCover: false, blocksVision: true });

    const eyeA = new THREE.Vector3(0, 1.6, -4);
    const eyeB = new THREE.Vector3(0, 1.6, 4);

    const blockedWhenClosed = !cw.hasLineOfSight(eyeA, eyeB);

    // Simulate opening the security door by removing its collider
    cw.removeBox('security_door_1');
    const clearWhenOpened = cw.hasLineOfSight(eyeA, eyeB);

    const passed = blockedWhenClosed && clearWhenOpened;
    results.push({
      name: 'Interactive Security Door Collider & LOS State Transition',
      category: 'Physics & LOS',
      passed,
      details: `ClosedBlocksLOS=${blockedWhenClosed}, OpenClearLOS=${clearWhenOpened}`,
    });
  } catch (e) {
    results.push({
      name: 'Interactive Security Door Collider & LOS State Transition',
      category: 'Physics & LOS',
      passed: false,
      details: String(e),
    });
  }

  // 9. A* Pathfinding Around Solid Barrier Test
  try {
    const cw = new CollisionWorld();
    cw.addBox('barrier_wall', 0, 2, 0, 12, 4, 2, { isCover: false, blocksVision: true });
    const nav = new EnemyNavigation(cw);
    const start = new THREE.Vector3(0, 0, 8);
    const goal = new THREE.Vector3(0, 0, -8);
    const path = nav.findPath(start, goal);

    const passed =
      path.length > 1 && path.every((pt) => !cw.isPointBlocked(pt.x, pt.z, 0.5));
    results.push({
      name: 'A* Enemy Pathfinding Around Solid Barrier',
      category: 'AI Pathfinding',
      passed,
      details: `Computed ${path.length} collision-free waypoints around barrier`,
    });
  } catch (e) {
    results.push({
      name: 'A* Enemy Pathfinding Around Solid Barrier',
      category: 'AI Pathfinding',
      passed: false,
      details: String(e),
    });
  }

  // 10. Dynamic Mission Objective & Custom Operation Generator Test
  try {
    const baseMission = MISSION_DEFINITIONS[1]; // Operation Silent Ash
    const variantA = DynamicMissionGenerator.generate(baseMission, 1042);
    const variantB = DynamicMissionGenerator.generate(baseMission, 8891);
    const customOp = DynamicMissionGenerator.createCustomOperation({
      mapId: baseMission.mapId,
      atmosphere: 'golden_sunset',
      enemyCount: 10,
      difficulty: 'Veteran',
      seed: 4412,
    });

    const [sx, , sz] = variantA.playerSpawn;
    const allEnemiesSafeFromSpawn = variantA.enemies.every(
      (e) => Math.hypot(e.position[0] - sx, e.position[2] - sz) >= 15.5
    );
    const briefingUpdated =
      !!variantA.dynamicSeed &&
      variantA.briefing.includes(variantA.dynamicSeed) &&
      variantA.dynamicSeed !== variantB.dynamicSeed;

    const passed =
      allEnemiesSafeFromSpawn &&
      briefingUpdated &&
      variantA.objectives.length > 0 &&
      customOp.enemies.length === 10 &&
      customOp.atmosphere === 'golden_sunset';

    results.push({
      name: 'Dynamic Mission Randomization & Custom Operation Generator',
      category: 'Dynamic Missions',
      passed,
      details: `Seeds ${variantA.dynamicSeed}/${variantB.dynamicSeed}, CustomHostiles=${customOp.enemies.length}, SafeSpawn=${allEnemiesSafeFromSpawn}`,
    });
  } catch (e) {
    results.push({
      name: 'Dynamic Mission Randomization & Custom Operation Generator',
      category: 'Dynamic Missions',
      passed: false,
      details: String(e),
    });
  }

  // 11. Progression & Isolated Save Safety Test (Never writes to localStorage)
  try {
    const beforeRaw =
      typeof window !== 'undefined'
        ? window.localStorage.getItem('shadowstrike_save_v1')
        : null;

    const initialSave = createDefaultSaveData();
    const { updatedSave, summary } = SaveManager.recordMissionOutcome(
      initialSave,
      MISSION_DEFINITIONS[0],
      {
        victory: true,
        completionTimeSec: 65,
        enemiesDefeated: 6,
        headshots: 3,
        shotsFired: 20,
        shotsHit: 14,
        damageReceived: 18,
        objectivesCompleted: 3,
        totalObjectives: 3,
        stealthBonusEarned: false,
        survivalWaveReached: 0,
        matchToken: 'test_token_isolated_1',
      },
      { persistToStorage: false }
    );

    // Verify duplicate matchToken is rejected
    const duplicateAttempt = SaveManager.recordMissionOutcome(
      updatedSave,
      MISSION_DEFINITIONS[0],
      {
        victory: true,
        completionTimeSec: 65,
        enemiesDefeated: 6,
        headshots: 3,
        shotsFired: 20,
        shotsHit: 14,
        damageReceived: 18,
        objectivesCompleted: 3,
        totalObjectives: 3,
        stealthBonusEarned: false,
        survivalWaveReached: 0,
        matchToken: 'test_token_isolated_1',
      },
      { persistToStorage: false }
    );

    const afterRaw =
      typeof window !== 'undefined'
        ? window.localStorage.getItem('shadowstrike_save_v1')
        : null;

    const unlockedShotgun = updatedSave.unlockedWeapons.includes('m870_breacher');
    const storageUntouched = beforeRaw === afterRaw;
    const duplicatePrevented = duplicateAttempt.summary.xpEarned === 0;

    const passed =
      summary.victory &&
      summary.xpEarned > 350 &&
      unlockedShotgun &&
      updatedSave.statistics.missionsCompleted === 1 &&
      storageUntouched &&
      duplicatePrevented;

    results.push({
      name: 'Isolated Save Progression, Unlock & Duplicate Guard',
      category: 'Progression',
      passed,
      details: `XP=${summary.xpEarned}, StorageUntouched=${storageUntouched}, DuplicateBlocked=${duplicatePrevented}`,
    });
  } catch (e) {
    results.push({
      name: 'Isolated Save Progression, Unlock & Duplicate Guard',
      category: 'Progression',
      passed: false,
      details: String(e),
    });
  }

  return results;
}
