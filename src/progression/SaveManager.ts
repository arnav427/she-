import {
  GameSettings,
  MissionDefinition,
  MissionResultSummary,
  PlayerAchievement,
  SaveData,
  WeaponAttachmentConfig,
  WeaponId,
  WeaponSkinId,
} from '../types/game';
import { MISSION_DEFINITIONS } from '../missions/MissionDefinitions';
import { DEFAULT_WEAPON_ATTACHMENTS, DEFAULT_WEAPON_SKINS } from '../combat/WeaponDefinitions';

const STORAGE_KEY = 'SHADOWSTRIKE_SAVE_V1';
const CURRENT_VERSION = 1;

export const DEFAULT_SETTINGS: GameSettings = {
  mouseSensitivity: 1.0,
  invertMouseY: false,
  fov: 75,
  masterVolume: 0.8,
  musicVolume: 0.45,
  sfxVolume: 0.85,
  graphicsQuality: 'high',
  resolutionScale: 1.0,
  cameraShake: true,
  motionEffects: true,
  difficultyMultiplier: 'normal',
  pickupHighlights: true,
};

export const INITIAL_ACHIEVEMENTS: PlayerAchievement[] = [
  {
    id: 'ach_first_blood',
    title: 'First Contact',
    description: 'Complete your first tactical operation.',
    unlocked: false,
  },
  {
    id: 'ach_sharpshooter',
    title: 'Surgical Precision',
    description: 'Complete an operation with at least 50% weapon accuracy.',
    unlocked: false,
  },
  {
    id: 'ach_headhunter',
    title: 'Headhunter',
    description: 'Score 10 cumulative headshot eliminations across operations.',
    unlocked: false,
  },
  {
    id: 'ach_survivalist',
    title: 'Unbreakable Bastion',
    description: 'Survive at least 3 waves in Operation Last Stand (Survival Mode).',
    unlocked: false,
  },
  {
    id: 'ach_shadow_master',
    title: 'Shadow Operative',
    description: 'Complete all 4 Campaign Operations.',
    unlocked: false,
  },
];

export function getRankForXp(xp: number): string {
  if (xp >= 2800) return 'Shadow Commander (Tier-1)';
  if (xp >= 1800) return 'Master Ghost Operative';
  if (xp >= 1000) return 'Senior Recon Specialist';
  if (xp >= 400) return 'Tactical Vanguard';
  return 'Field Operative';
}

export function createDefaultSaveData(): SaveData {
  return {
    version: CURRENT_VERSION,
    xp: 0,
    rankTitle: getRankForXp(0),
    unlockedWeapons: ['vx47_carbine', 'k7_vector', 'p226_tactical'],
    equippedLoadout: {
      primary: 'vx47_carbine',
      secondary: 'k7_vector',
      sidearm: 'p226_tactical',
    },
    weaponAttachments: JSON.parse(JSON.stringify(DEFAULT_WEAPON_ATTACHMENTS)),
    weaponSkins: { ...DEFAULT_WEAPON_SKINS },
    missionRecords: {},
    statistics: {
      missionsCompleted: 0,
      enemiesDefeated: 0,
      headshots: 0,
      shotsFired: 0,
      shotsHit: 0,
      totalPlaytimeSec: 0,
      bestSurvivalWave: 0,
      objectivesCompleted: 0,
    },
    achievements: INITIAL_ACHIEVEMENTS.map((a) => ({ ...a })),
    settings: { ...DEFAULT_SETTINGS },
  };
}

export class SaveManager {
  private static lastProcessedMatchToken: string | null = null;

  static load(): SaveData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return createDefaultSaveData();
      }
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      if (!parsed || typeof parsed !== 'object') {
        return createDefaultSaveData();
      }
      const defaults = createDefaultSaveData();
      const validQualities = ['low', 'medium', 'high', 'ultra'] as const;
      const rawQuality = parsed.settings?.graphicsQuality;
      const graphicsQuality = validQualities.includes(rawQuality as (typeof validQualities)[number])
        ? (rawQuality as (typeof validQualities)[number])
        : 'high';

      const mergedSettings: GameSettings = {
        ...defaults.settings,
        ...(parsed.settings || {}),
        graphicsQuality,
        mouseSensitivity: Math.max(
          0.1,
          Math.min(3.0, Number(parsed.settings?.mouseSensitivity ?? 1.0))
        ),
        fov: Math.max(60, Math.min(105, Number(parsed.settings?.fov ?? 75))),
        masterVolume: Math.max(0, Math.min(1, Number(parsed.settings?.masterVolume ?? 0.8))),
        musicVolume: Math.max(0, Math.min(1, Number(parsed.settings?.musicVolume ?? 0.45))),
        sfxVolume: Math.max(0, Math.min(1, Number(parsed.settings?.sfxVolume ?? 0.85))),
        pickupHighlights:
          typeof parsed.settings?.pickupHighlights === 'boolean'
            ? parsed.settings.pickupHighlights
            : true,
      };

      const unlockedWeapons = Array.isArray(parsed.unlockedWeapons)
        ? (Array.from(
            new Set(['vx47_carbine', 'k7_vector', 'p226_tactical', ...parsed.unlockedWeapons])
          ) as WeaponId[])
        : defaults.unlockedWeapons;

      const mergedAttachments: Record<WeaponId, WeaponAttachmentConfig> = {
        ...JSON.parse(JSON.stringify(DEFAULT_WEAPON_ATTACHMENTS)),
        ...(parsed.weaponAttachments || {}),
      };

      const mergedSkins: Record<WeaponId, WeaponSkinId> = {
        ...DEFAULT_WEAPON_SKINS,
        ...(parsed.weaponSkins || {}),
      };

      return {
        version: CURRENT_VERSION,
        xp: typeof parsed.xp === 'number' && parsed.xp >= 0 ? parsed.xp : 0,
        rankTitle: getRankForXp(typeof parsed.xp === 'number' ? parsed.xp : 0),
        unlockedWeapons,
        equippedLoadout: {
          primary: unlockedWeapons.includes(parsed.equippedLoadout?.primary as WeaponId)
            ? (parsed.equippedLoadout!.primary as WeaponId)
            : 'vx47_carbine',
          secondary: unlockedWeapons.includes(parsed.equippedLoadout?.secondary as WeaponId)
            ? (parsed.equippedLoadout!.secondary as WeaponId)
            : 'k7_vector',
          sidearm: 'p226_tactical',
        },
        weaponAttachments: mergedAttachments,
        weaponSkins: mergedSkins,
        missionRecords:
          parsed.missionRecords && typeof parsed.missionRecords === 'object'
            ? parsed.missionRecords
            : {},
        statistics: {
          ...defaults.statistics,
          ...(parsed.statistics || {}),
        },
        achievements: INITIAL_ACHIEVEMENTS.map((initAch) => {
          const existing = parsed.achievements?.find((a) => a.id === initAch.id);
          return existing
            ? { ...initAch, unlocked: !!existing.unlocked, unlockedAt: existing.unlockedAt }
            : { ...initAch };
        }),
        settings: mergedSettings,
      };
    } catch {
      return createDefaultSaveData();
    }
  }

  static save(data: SaveData): boolean {
    try {
      data.rankTitle = getRankForXp(data.xp);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  static reset(): SaveData {
    const fresh = createDefaultSaveData();
    this.save(fresh);
    return fresh;
  }

  static isMissionUnlocked(mission: MissionDefinition, saveData: SaveData): boolean {
    if (!mission.unlockRequirementMissionId) return true;
    return !!saveData.missionRecords[mission.unlockRequirementMissionId]?.completed;
  }

  /**
   * Records mission outcome and updates XP, unlocks, achievements, and statistics.
   * When `options.persistToStorage` is false (e.g., during automated tests), it NEVER writes to localStorage.
   */
  static recordMissionOutcome(
    saveData: SaveData,
    mission: MissionDefinition,
    stats: {
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
    },
    options?: { persistToStorage?: boolean }
  ): { updatedSave: SaveData; summary: MissionResultSummary } {
    const persist = options?.persistToStorage ?? true;
    const updated: SaveData = JSON.parse(JSON.stringify(saveData));
    const accuracyPercent =
      stats.shotsFired > 0 ? Math.round((stats.shotsHit / stats.shotsFired) * 100) : 0;

    // Duplicate reward guard if same match token is submitted twice
    const isDuplicateSubmission =
      persist && stats.matchToken && this.lastProcessedMatchToken === stats.matchToken;
    if (persist && stats.matchToken) {
      this.lastProcessedMatchToken = stats.matchToken;
    }

    let xpEarned = 0;
    const newlyUnlockedWeapons: WeaponId[] = [];
    const newlyUnlockedAchievements: string[] = [];

    if (!isDuplicateSubmission) {
      updated.statistics.enemiesDefeated += stats.enemiesDefeated;
      updated.statistics.headshots += stats.headshots;
      updated.statistics.shotsFired += stats.shotsFired;
      updated.statistics.shotsHit += stats.shotsHit;
      updated.statistics.totalPlaytimeSec += Math.round(stats.completionTimeSec);
      updated.statistics.objectivesCompleted += stats.objectivesCompleted;

      if (stats.survivalWaveReached > updated.statistics.bestSurvivalWave) {
        updated.statistics.bestSurvivalWave = stats.survivalWaveReached;
      }

      if (stats.victory) {
        updated.statistics.missionsCompleted += 1;
        const accuracyBonus = Math.round(accuracyPercent * 2);
        const headshotBonus = stats.headshots * 25;
        const stealthBonus = stats.stealthBonusEarned ? 150 : 0;
        xpEarned = mission.baseXpReward + accuracyBonus + headshotBonus + stealthBonus;

        const stars =
          stats.damageReceived < 40 && accuracyPercent >= 45
            ? 3
            : stats.damageReceived < 85
              ? 2
              : 1;

        const prevRecord = updated.missionRecords[mission.id];
        updated.missionRecords[mission.id] = {
          missionId: mission.id,
          completed: true,
          bestTimeSec: prevRecord
            ? Math.min(prevRecord.bestTimeSec, Math.round(stats.completionTimeSec))
            : Math.round(stats.completionTimeSec),
          bestAccuracy: prevRecord
            ? Math.max(prevRecord.bestAccuracy, accuracyPercent)
            : accuracyPercent,
          bestScore: prevRecord ? Math.max(prevRecord.bestScore, xpEarned) : xpEarned,
          stars: prevRecord ? Math.max(prevRecord.stars, stars) : stars,
        };
      } else {
        xpEarned = Math.round(stats.enemiesDefeated * 18 + stats.objectivesCompleted * 40);
      }

      updated.xp += xpEarned;
      updated.rankTitle = getRankForXp(updated.xp);

      const unlockRules: { id: WeaponId; condition: boolean }[] = [
        {
          id: 'm870_breacher',
          condition: !!updated.missionRecords['op_iron_gate']?.completed || updated.xp >= 300,
        },
        {
          id: 'srs99_longbow',
          condition: !!updated.missionRecords['op_silent_ash']?.completed || updated.xp >= 700,
        },
      ];

      for (const rule of unlockRules) {
        if (rule.condition && !updated.unlockedWeapons.includes(rule.id)) {
          updated.unlockedWeapons.push(rule.id);
          newlyUnlockedWeapons.push(rule.id);
        }
      }

      const unlockAch = (id: string) => {
        const ach = updated.achievements.find((a) => a.id === id);
        if (ach && !ach.unlocked) {
          ach.unlocked = true;
          ach.unlockedAt = new Date().toISOString();
          newlyUnlockedAchievements.push(ach.title);
        }
      };

      if (stats.victory) {
        unlockAch('ach_first_blood');
        if (accuracyPercent >= 50 && stats.shotsFired >= 5) {
          unlockAch('ach_sharpshooter');
        }
      }
      if (updated.statistics.headshots >= 10) {
        unlockAch('ach_headhunter');
      }
      if (updated.statistics.bestSurvivalWave >= 3) {
        unlockAch('ach_survivalist');
      }

      const campaignIds = MISSION_DEFINITIONS.filter((m) => m.index <= 3).map((m) => m.id);
      if (campaignIds.every((id) => updated.missionRecords[id]?.completed)) {
        unlockAch('ach_shadow_master');
      }

      if (persist) {
        this.save(updated);
      }
    }

    return {
      updatedSave: updated,
      summary: {
        mission,
        victory: stats.victory,
        failureReason: stats.failureReason,
        completionTimeSec: Math.round(stats.completionTimeSec),
        enemiesDefeated: stats.enemiesDefeated,
        headshots: stats.headshots,
        shotsFired: stats.shotsFired,
        shotsHit: stats.shotsHit,
        accuracyPercent,
        damageReceived: Math.round(stats.damageReceived),
        objectivesCompleted: stats.objectivesCompleted,
        totalObjectives: stats.totalObjectives,
        stealthBonusEarned: stats.stealthBonusEarned,
        survivalWaveReached: stats.survivalWaveReached,
        xpEarned,
        newlyUnlockedWeapons,
        newlyUnlockedAchievements,
      },
    };
  }
}
