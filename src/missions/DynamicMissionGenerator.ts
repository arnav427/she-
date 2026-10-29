import {
  EnemyPersonality,
  EnemySpawnConfig,
  GameMode,
  MapEnvironmentId,
  MissionDefinition,
} from '../types/game';

interface TacticalSectorSlot {
  sectorName: string;
  position: [number, number, number];
  patrolRoute: [number, number, number][];
}

/**
 * Validated, collision-free tactical sector slots per map environment.
 * Every coordinate has been verified against EnvironmentBuilder's structure blocks
 * so objectives and patrols never spawn inside walls or unreachable areas.
 */
const MAP_TACTICAL_SECTORS: Record<MapEnvironmentId, TacticalSectorSlot[]> = {
  training_compound: [
    {
      sectorName: 'Central Command Bunker',
      position: [0, 0, 6],
      patrolRoute: [
        [-3, 0, 7],
        [3, 0, 7],
      ],
    },
    {
      sectorName: 'West Killhouse Corridor',
      position: [-14, 0, 4],
      patrolRoute: [
        [-14, 0, 10],
        [-14, 0, -4],
      ],
    },
    {
      sectorName: 'East Flanking Annex',
      position: [14, 0, 4],
      patrolRoute: [
        [14, 0, 10],
        [14, 0, -4],
      ],
    },
    {
      sectorName: 'North-West Barracks Lane',
      position: [-13, 0, -22],
      patrolRoute: [
        [-13, 0, -18],
        [-6, 0, -24],
      ],
    },
    {
      sectorName: 'North-East Overwatch Alley',
      position: [13, 0, -22],
      patrolRoute: [
        [13, 0, -18],
        [6, 0, -24],
      ],
    },
    {
      sectorName: 'North Courtyard Plaza',
      position: [0, 0, -12],
      patrolRoute: [
        [-6, 0, -12],
        [6, 0, -12],
      ],
    },
  ],
  industrial_facility: [
    {
      sectorName: 'West Container Loading Bay',
      position: [-18, 0, 6],
      patrolRoute: [
        [-18, 0, 12],
        [-18, 0, -2],
      ],
    },
    {
      sectorName: 'East Refinery Processing Yard',
      position: [18, 0, 6],
      patrolRoute: [
        [18, 0, 12],
        [18, 0, -2],
      ],
    },
    {
      sectorName: 'South-West Pipeline Junction',
      position: [-7, 0, 14],
      patrolRoute: [
        [-7, 0, 18],
        [7, 0, 18],
      ],
    },
    {
      sectorName: 'North-East Silo Substation',
      position: [18, 0, -14],
      patrolRoute: [
        [16, 0, -12],
        [20, 0, -18],
      ],
    },
    {
      sectorName: 'North-West Chemical Depot',
      position: [-18, 0, -14],
      patrolRoute: [
        [-16, 0, -12],
        [-20, 0, -18],
      ],
    },
    {
      sectorName: 'North Dock Staging Area',
      position: [0, 0, -22],
      patrolRoute: [
        [-8, 0, -22],
        [8, 0, -22],
      ],
    },
  ],
  desert_outpost: [
    {
      sectorName: 'South-West Sandstone Bunker',
      position: [-16, 0, 10],
      patrolRoute: [
        [-18, 0, 8],
        [-12, 0, 12],
      ],
    },
    {
      sectorName: 'South-East Artillery Dugout',
      position: [16, 0, 10],
      patrolRoute: [
        [18, 0, 8],
        [12, 0, 12],
      ],
    },
    {
      sectorName: 'Central Oasis Courtyard',
      position: [0, 0, -6],
      patrolRoute: [
        [-5, 0, -6],
        [5, 0, -6],
      ],
    },
    {
      sectorName: 'North-West Citadel Bastion',
      position: [-11, 0, -18],
      patrolRoute: [
        [-12, 0, -14],
        [-6, 0, -22],
      ],
    },
    {
      sectorName: 'North-East Command Post',
      position: [11, 0, -18],
      patrolRoute: [
        [12, 0, -14],
        [6, 0, -22],
      ],
    },
    {
      sectorName: 'North Canyon Ridge',
      position: [0, 0, -24],
      patrolRoute: [
        [-8, 0, -24],
        [8, 0, -24],
      ],
    },
  ],
  night_infiltration: [
    {
      sectorName: 'West Perimeter Security Relay',
      position: [-18, 0, 12],
      patrolRoute: [
        [-18, 0, 14],
        [-12, 0, 8],
      ],
    },
    {
      sectorName: 'East Woods Guard Post',
      position: [18, 0, 12],
      patrolRoute: [
        [18, 0, 14],
        [12, 0, 8],
      ],
    },
    {
      sectorName: 'Central Underground Mainframe',
      position: [0, 0, -2],
      patrolRoute: [
        [-3, 0, 0],
        [3, 0, 0],
      ],
    },
    {
      sectorName: 'North-West Comms Array',
      position: [-12, 0, -18],
      patrolRoute: [
        [-14, 0, -16],
        [-6, 0, -22],
      ],
    },
    {
      sectorName: 'North-East Cryo Lab Annex',
      position: [12, 0, -18],
      patrolRoute: [
        [14, 0, -16],
        [6, 0, -22],
      ],
    },
    {
      sectorName: 'North Heli-Pad Approach',
      position: [0, 0, -24],
      patrolRoute: [
        [-7, 0, -24],
        [7, 0, -24],
      ],
    },
  ],
};

/**
 * Seeded pseudo-random generator (Mulberry32) so dynamic missions are reproducible and testable.
 */
function createSeededRng(seedNumber: number): () => number {
  let a = seedNumber >>> 0;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithRng<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export class DynamicMissionGenerator {
  /**
   * Generates a fresh dynamic mission configuration for a playthrough.
   * Randomizes objective locations across validated map sectors, varies enemy patrol
   * compositions and routes within a balanced difficulty budget, ensures safe spawn distance,
   * and updates the mission briefing dynamically.
   */
  public static generate(
    baseMission: MissionDefinition,
    customSeedNumber?: number
  ): MissionDefinition {
    // Deep clone base mission so we never mutate static definitions
    const mission: MissionDefinition = JSON.parse(JSON.stringify(baseMission));

    // Keep Training Range predictable for first-time tutorial clarity unless explicitly seeded
    if (mission.mode === GameMode.Training && customSeedNumber === undefined) {
      mission.dynamicSeed = 'QUAL-STANDARD';
      mission.dynamicReconSummary =
        'Standard qualification layout active. All targets and supply caches at fixed range markers.';
      mission.dynamicSectorTags = ['South Supply Pad', 'Central Firing Line', 'North Extraction Pad'];
      return mission;
    }

    const numericSeed =
      customSeedNumber !== undefined
        ? customSeedNumber
        : Math.floor(1000 + Math.random() * 9000);
    const rng = createSeededRng(numericSeed);

    const phonetic = ['ALPHA', 'BRAVO', 'SIERRA', 'VANGUARD', 'OMEGA', 'SPECTER', 'KILO', 'DELTA'];
    const codeSuffix = phonetic[numericSeed % phonetic.length];
    const seedCode = `OP-${numericSeed}-${codeSuffix}`;
    mission.dynamicSeed = seedCode;

    const candidateSectors = MAP_TACTICAL_SECTORS[mission.mapId] || MAP_TACTICAL_SECTORS.training_compound;
    const shuffledSectors = shuffleWithRng(candidateSectors, rng);

    // 1. Randomize placement of key objective interactables (Intel Terminals / Radar Jammers)
    const objectiveInteractables = mission.interactables.filter((i) => !!i.objectiveId);
    const fixedDoors = mission.interactables.filter((i) => i.type === 'security_door');
    const supplyInteractables = mission.interactables.filter(
      (i) => !i.objectiveId && i.type !== 'security_door'
    );

    const chosenObjectiveSectors: TacticalSectorSlot[] = [];

    objectiveInteractables.forEach((inter, idx) => {
      const slot = shuffledSectors[idx % shuffledSectors.length];
      chosenObjectiveSectors.push(slot);
      inter.position = [...slot.position];
      const baseTypeLabel =
        inter.type === 'radar_jammer' ? 'Signal Jammer' : 'Encrypted Intel Terminal';
      inter.label = `${slot.sectorName} ${baseTypeLabel}`;
    });

    // Randomize supply crate & field pickup positions among remaining sectors without overlapping walls or doors
    const remainingSectors = shuffledSectors.slice(objectiveInteractables.length);
    supplyInteractables.forEach((supply, idx) => {
      if (remainingSectors.length > 0) {
        const s = remainingSectors[idx % remainingSectors.length];
        const offsetX = idx % 2 === 0 ? 1.8 : -1.8;
        const offsetZ = idx < 2 ? 1.6 : -1.6;
        supply.position = [s.position[0] + offsetX, 0, s.position[2] + offsetZ];
      }
    });

    // Ensure every mission has field medkits, armor plates, and ammo packs in safe locations
    const hasSmallMedkit = mission.interactables.some(
      (i) => i.type === 'medkit_small' || i.type === 'medkit_large'
    );
    if (!hasSmallMedkit && shuffledSectors.length >= 2) {
      const sMed = shuffledSectors[shuffledSectors.length - 1];
      const sArm = shuffledSectors[shuffledSectors.length - 2];
      mission.interactables.push(
        {
          id: `dyn_medkit_${numericSeed}`,
          type: 'medkit_small',
          label: 'Field Medical Pack (+35 HP)',
          interactionPrompt: 'Press [E] to Collect Medkit (+35 HP)',
          position: [sMed.position[0] - 1.6, 0, sMed.position[2] - 1.4],
          healAmount: 35,
          interactionDurationSec: 0.25,
        },
        {
          id: `dyn_armor_${numericSeed}`,
          type: 'armor_plate',
          label: 'Ballistic SAPI Armor Plate (+35 Armor)',
          interactionPrompt: 'Press [E] to Equip / Store Armor Plate',
          position: [sArm.position[0] + 1.6, 0, sArm.position[2] - 1.4],
          armorAmount: 35,
          interactionDurationSec: 0.25,
        },
        {
          id: `dyn_ammo_${numericSeed}`,
          type: 'ammo_pack_rifle',
          label: 'Tactical Rifle Ammo Pack (+60 Rounds)',
          interactionPrompt: 'Press [E] to Collect Rifle Ammunition',
          position: [0, 0, 22],
          ammoAmount: 60,
          interactionDurationSec: 0.25,
        }
      );
    }

    // Keep fixed security doors at their architectural doorway positions
    fixedDoors.forEach((door) => {
      const orig = baseMission.interactables.find((b) => b.id === door.id);
      if (orig) {
        door.position = [...orig.position];
      }
    });

    // Update objective target positions and dynamic descriptions
    const activeSectorNames = chosenObjectiveSectors.map((s) => s.sectorName);
    mission.dynamicSectorTags =
      activeSectorNames.length > 0
        ? activeSectorNames
        : shuffledSectors.slice(0, 3).map((s) => s.sectorName);

    for (const obj of mission.objectives) {
      if (obj.type === 'interact_object' && chosenObjectiveSectors.length > 0) {
        if (chosenObjectiveSectors.length === 1) {
          obj.targetPosition = [...chosenObjectiveSectors[0].position];
          obj.description = `Locate and interact with the target terminal at ${chosenObjectiveSectors[0].sectorName} (Hold [E]).`;
        } else {
          obj.targetPosition = [...chosenObjectiveSectors[0].position];
          obj.description = `Neutralize ${chosenObjectiveSectors.length} tactical targets located across: ${activeSectorNames.join(' & ')}.`;
        }
      }
    }

    // 2. Dynamically randomize Enemy Patrols & Personalities (Balanced Difficulty Budget)
    const personalityPoolByDifficulty: Record<
      MissionDefinition['difficulty'],
      EnemyPersonality[]
    > = {
      Recruit: [
        EnemyPersonality.Guard,
        EnemyPersonality.Scout,
        EnemyPersonality.Defender,
        EnemyPersonality.Assault,
      ],
      Operative: [
        EnemyPersonality.Guard,
        EnemyPersonality.Scout,
        EnemyPersonality.Assault,
        EnemyPersonality.Defender,
        EnemyPersonality.Elite,
      ],
      Veteran: [
        EnemyPersonality.Scout,
        EnemyPersonality.Assault,
        EnemyPersonality.Defender,
        EnemyPersonality.Elite,
      ],
      Shadow: [
        EnemyPersonality.Assault,
        EnemyPersonality.Defender,
        EnemyPersonality.Elite,
        EnemyPersonality.Scout,
      ],
    };

    const allowedPersonalities = personalityPoolByDifficulty[mission.difficulty];
    const [spawnX, , spawnZ] = mission.playerSpawn;

    const routePool = shuffleWithRng(
      [
        ...shuffledSectors.map((s) => ({
          pos: s.position,
          route: s.patrolRoute,
        })),
        ...mission.enemies.map((e) => ({
          pos: e.position,
          route: e.patrolPoints,
        })),
      ],
      rng
    );

    const newEnemies: EnemySpawnConfig[] = mission.enemies.map((baseEnemy, idx) => {
      let candidate = routePool[idx % routePool.length];
      const distFromSpawn = Math.hypot(candidate.pos[0] - spawnX, candidate.pos[2] - spawnZ);
      if (distFromSpawn < 16) {
        candidate = { pos: baseEnemy.position, route: baseEnemy.patrolPoints };
      }

      const personality = baseEnemy.isCommander
        ? EnemyPersonality.Elite
        : allowedPersonalities[Math.floor(rng() * allowedPersonalities.length)];

      const assignedObjectiveSector = chosenObjectiveSectors[idx];
      if (assignedObjectiveSector) {
        const guardPos: [number, number, number] = [
          assignedObjectiveSector.position[0] + (rng() > 0.5 ? 2.2 : -2.2),
          0,
          assignedObjectiveSector.position[2] + 1.8,
        ];
        if (Math.hypot(guardPos[0] - spawnX, guardPos[2] - spawnZ) >= 16) {
          return {
            ...baseEnemy,
            personality: idx === 0 ? EnemyPersonality.Defender : personality,
            position: guardPos,
            patrolPoints: assignedObjectiveSector.patrolRoute,
          };
        }
      }

      return {
        ...baseEnemy,
        personality,
        position: [...candidate.pos],
        patrolPoints: candidate.route.map((pt) => [...pt] as [number, number, number]),
      };
    });

    mission.enemies = newEnemies;

    // 3. Summarize enemy squad composition for Dynamic Mission Briefing
    const counts: Partial<Record<EnemyPersonality, number>> = {};
    for (const e of mission.enemies) {
      counts[e.personality] = (counts[e.personality] || 0) + 1;
    }
    const squadBreakdown = Object.entries(counts)
      .map(([type, count]) => `${count}× ${type}`)
      .join(', ');

    const sectorSummaryText =
      activeSectorNames.length > 0
        ? `Primary objective signals triangulated at ${activeSectorNames.join(', ')}.`
        : `Hostile activity concentrated around ${mission.dynamicSectorTags.join(', ')}.`;

    mission.dynamicReconSummary = `[RECON SEED ${seedCode}] ${sectorSummaryText} Satellite thermal imaging confirms ${mission.enemies.length} hostile combatants (${squadBreakdown}) on randomized patrol vectors.`;

    mission.briefing = `${baseMission.briefing}\n\n• LIVE SATELLITE RECON (${seedCode}): ${sectorSummaryText} Expect ${squadBreakdown} units operating across shifting patrol routes.`;

    return mission;
  }

  /**
   * Builds a playable Custom Operation mission from user-selected parameters.
   */
  public static createCustomOperation(options: {
    mapId: MapEnvironmentId;
    atmosphere: MissionDefinition['atmosphere'];
    enemyCount: number;
    difficulty: MissionDefinition['difficulty'];
    seed?: number;
  }): MissionDefinition {
    const clampedEnemies = Math.max(4, Math.min(14, options.enemyCount));
    const sectors = MAP_TACTICAL_SECTORS[options.mapId] || MAP_TACTICAL_SECTORS.training_compound;

    const enemies: EnemySpawnConfig[] = Array.from({ length: clampedEnemies }, (_, i) => {
      const s = sectors[i % sectors.length];
      const isCmd = i === clampedEnemies - 1;
      return {
        id: `cust_e_${i + 1}`,
        personality: isCmd
          ? EnemyPersonality.Elite
          : i % 3 === 0
            ? EnemyPersonality.Assault
            : i % 2 === 0
              ? EnemyPersonality.Defender
              : EnemyPersonality.Scout,
        position: [s.position[0] + ((i % 3) - 1) * 2.2, 0, s.position[2]],
        patrolPoints: s.patrolRoute,
        health: options.difficulty === 'Shadow' ? 135 : options.difficulty === 'Veteran' ? 115 : 95,
        armor: options.difficulty === 'Shadow' ? 60 : options.difficulty === 'Veteran' ? 40 : 20,
        isCommander: isCmd,
      };
    });

    const baseCustom: MissionDefinition = {
      id: 'mode_custom_operation',
      index: 8,
      codeName: 'CUSTOM · TACTICAL SANDBOX',
      title: 'Custom Tactical Operation',
      subtitle: `${options.mapId.replace('_', ' ').toUpperCase()} · ${clampedEnemies} Hostiles`,
      mode: GameMode.Custom,
      mapId: options.mapId,
      atmosphere: options.atmosphere,
      difficulty: options.difficulty,
      briefing:
        'Custom Tactical Deployment configured by Commander. Disable the primary sector signal jammer, neutralize the hostile garrison, and exfiltrate at the North Beacon.',
      tacticalAdvice:
        'Use Tactical Scanner [V] to highlight field pickups and objectives, cycle Grenade types with [4], and toggle Flashlight [F] or Night Vision [N] in low-visibility weather.',
      playerSpawn: [0, 0, 36],
      playerSpawnYaw: 0,
      baseXpReward: 300 + clampedEnemies * 45,
      extractionPoint: [0, 0, -36],
      objectives: [
        {
          id: 'obj_cust_jammer',
          title: 'Disable Sector Signal Jammer',
          description: 'Locate and overload the primary hostile signal jammer.',
          type: 'interact_object',
          targetCount: 1,
          targetPosition: [...sectors[0].position],
        },
        {
          id: 'obj_cust_clear',
          title: `Neutralize Hostile Garrison (${clampedEnemies})`,
          description: `Eliminate all ${clampedEnemies} hostile operatives in the sector.`,
          type: 'eliminate_all',
          targetCount: clampedEnemies,
        },
        {
          id: 'obj_cust_extract',
          title: 'Exfiltrate at North Beacon',
          description: 'Proceed to the North extraction zone once primary objectives are complete.',
          type: 'reach_zone',
          targetCount: 1,
          targetPosition: [0, 0, -36],
        },
      ],
      interactables: [
        {
          id: 'int_cust_jammer',
          type: 'radar_jammer',
          label: 'Primary Signal Jammer',
          interactionPrompt: 'Hold [E] to Overload Jammer',
          position: [...sectors[0].position],
          objectiveId: 'obj_cust_jammer',
          interactionDurationSec: 1.5,
        },
        {
          id: 'int_cust_crate',
          type: 'supply_crate_tactical',
          label: 'Tactical Equipment Supply Crate',
          interactionPrompt: 'Hold [E] to Open Tactical Supply Crate',
          position: [...sectors[1].position],
          interactionDurationSec: 0.7,
        },
        {
          id: 'int_cust_medkit_lg',
          type: 'medkit_large',
          label: 'Surgical Trauma Kit (+60 HP)',
          interactionPrompt: 'Press [E] to Collect Large Medkit (+60 HP)',
          position: [-5, 0, 22],
          healAmount: 60,
          interactionDurationSec: 0.25,
        },
        {
          id: 'int_cust_armor',
          type: 'armor_plate',
          label: 'Ballistic Armor Plate (+35 Armor)',
          interactionPrompt: 'Press [E] to Equip / Store Armor Plate',
          position: [5, 0, 22],
          armorAmount: 35,
          interactionDurationSec: 0.25,
        },
      ],
      enemies,
    };

    return this.generate(baseCustom, options.seed);
  }
}

