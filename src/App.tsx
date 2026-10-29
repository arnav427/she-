import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  Lock,
  Check,
  RefreshCw,
  ChevronRight,
  Sliders,
} from 'lucide-react';
import {
  AtmospherePresetId,
  GameMode,
  GameSettings,
  HUDState,
  MissionDefinition,
  MissionResultSummary,
  SaveData,
  WeaponAttachmentConfig,
  WeaponId,
} from './types/game';
import { MISSION_DEFINITIONS } from './missions/MissionDefinitions';
import { DynamicMissionGenerator } from './missions/DynamicMissionGenerator';
import {
  DEFAULT_WEAPON_ATTACHMENTS,
  getEffectiveWeaponStats,
  WEAPON_DEFINITIONS,
  WEAPON_LIST,
} from './combat/WeaponDefinitions';
import { SaveManager } from './progression/SaveManager';
import { AudioManager } from './audio/AudioManager';
import { GameEngine } from './game/GameEngine';
import { TacticalHUD } from './ui/TacticalHUD';
import { runAllAutomatedTests, TestResult } from './tests/gameTests';

type NavTab = 'operations' | 'armory' | 'training' | 'statistics' | 'settings';

export default function App() {
  const [saveData, setSaveData] = useState<SaveData>(() => SaveManager.load());
  const [activeTab, setActiveTab] = useState<NavTab>('operations');
  const [modeFilter, setModeFilter] = useState<string>('ALL');

  const [selectedBaseMissionId, setSelectedBaseMissionId] = useState<string>(
    MISSION_DEFINITIONS[0].id
  );
  const [dynamicSeedCounter, setDynamicSeedCounter] = useState<number>(() =>
    Math.floor(1000 + Math.random() * 8999)
  );

  // Custom Operation Builder State
  const [customBaseId, setCustomBaseId] = useState<string>(MISSION_DEFINITIONS[0].id);
  const [customAtmosphere, setCustomAtmosphere] =
    useState<AtmospherePresetId>('clear_daylight');
  const [customEnemyCount, setCustomEnemyCount] = useState<number>(8);
  const [customDifficulty, setCustomDifficulty] = useState<'Recruit' | 'Operative' | 'Veteran'>(
    'Operative'
  );

  // Active 3D Game Session State
  const [inGame, setInGame] = useState(false);
  const [isCinematicLoading, setIsCinematicLoading] = useState(false);
  const [activeMission, setActiveMission] = useState<MissionDefinition | null>(null);
  const [hudState, setHudState] = useState<HUDState | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [pauseSubView, setPauseSubView] = useState<'main' | 'settings' | 'controls'>('main');
  const [showObjectivesOverlay, setShowObjectivesOverlay] = useState(false);
  const [missionSummary, setMissionSummary] = useState<MissionResultSummary | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showCreditsModal, setShowCreditsModal] = useState(false);

  // Automated test suite results (runs in isolated memory, never overwrites localStorage)
  const [testResults, setTestResults] = useState<TestResult[]>(() => runAllAutomatedTests());

  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const audioRef = useRef<AudioManager | null>(null);

  if (!audioRef.current) {
    audioRef.current = new AudioManager(saveData.settings);
  }

  // Generate dynamic mission preview whenever mission selection or seed changes
  const selectedBaseMission = useMemo(
    () =>
      MISSION_DEFINITIONS.find((m) => m.id === selectedBaseMissionId) ||
      MISSION_DEFINITIONS[0],
    [selectedBaseMissionId]
  );

  const previewDynamicMission = useMemo(
    () => DynamicMissionGenerator.generate(selectedBaseMission, dynamicSeedCounter),
    [selectedBaseMission, dynamicSeedCounter]
  );

  const filteredMissions = useMemo(() => {
    if (modeFilter === 'ALL' || modeFilter === GameMode.Custom) return MISSION_DEFINITIONS;
    return MISSION_DEFINITIONS.filter((m) => m.mode === modeFilter);
  }, [modeFilter]);

  // Mount / Unmount 3D GameEngine when `inGame` and `activeMission` are active
  useEffect(() => {
    if (!inGame || !activeMission || !canvasMountRef.current) return;

    const engine = new GameEngine({
      container: canvasMountRef.current,
      mission: activeMission,
      loadout: saveData.equippedLoadout,
      weaponAttachments: saveData.weaponAttachments,
      settings: saveData.settings,
      audio: audioRef.current!,
      onHudUpdate: (hud) => setHudState(hud),
      onPauseChange: (paused) => {
        setIsPaused(paused);
        if (!paused) setPauseSubView('main');
      },
      onToggleObjectives: (visible) => setShowObjectivesOverlay(visible),
      onMissionFinish: (stats) => {
        const { updatedSave, summary } = SaveManager.recordMissionOutcome(
          SaveManager.load(),
          activeMission,
          stats,
          { persistToStorage: true }
        );
        setSaveData(updatedSave);
        setMissionSummary(summary);
      },
    });

    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [inGame, activeMission]);

  const deployMission = (baseMission: MissionDefinition, customSeed?: number) => {
    audioRef.current?.playMenuClick();
    const seedToUse = customSeed ?? Math.floor(1000 + Math.random() * 8999);
    const generatedMission = DynamicMissionGenerator.generate(baseMission, seedToUse);
    setMissionSummary(null);
    setIsPaused(false);
    setPauseSubView('main');
    setIsCinematicLoading(true);
    setActiveMission(generatedMission);
    setInGame(true);
    window.setTimeout(() => setIsCinematicLoading(false), 2600);
  };

  const deployCustomOperation = () => {
    audioRef.current?.playMenuClick();
    const baseForMap =
      MISSION_DEFINITIONS.find((m) => m.id === customBaseId) || MISSION_DEFINITIONS[0];
    const customMission = DynamicMissionGenerator.createCustomOperation({
      mapId: baseForMap.mapId,
      atmosphere: customAtmosphere,
      enemyCount: customEnemyCount,
      difficulty: customDifficulty,
      seed: Math.floor(1000 + Math.random() * 8999),
    });
    setMissionSummary(null);
    setIsPaused(false);
    setPauseSubView('main');
    setIsCinematicLoading(true);
    setActiveMission(customMission);
    setInGame(true);
    window.setTimeout(() => setIsCinematicLoading(false), 2600);
  };

  const handleContinueCampaign = () => {
    const campaignMissions = MISSION_DEFINITIONS.filter((m) => m.mode === GameMode.Campaign);
    let target = campaignMissions[0];
    for (const m of campaignMissions) {
      if (SaveManager.isMissionUnlocked(m, saveData)) {
        target = m;
      }
    }
    deployMission(target);
  };

  const handleUpdateSettings = (partial: Partial<GameSettings>) => {
    const nextSettings: GameSettings = { ...saveData.settings, ...partial };
    const nextSave: SaveData = { ...saveData, settings: nextSettings };
    setSaveData(nextSave);
    SaveManager.save(nextSave);
    audioRef.current?.updateSettings(nextSettings);
    engineRef.current?.updateSettings(nextSettings);
  };

  const handleEquipWeapon = (weaponId: WeaponId, targetSlot: 'primary' | 'secondary' | 'sidearm') => {
    if (!saveData.unlockedWeapons.includes(weaponId)) return;
    audioRef.current?.playMenuClick();
    const nextLoadout = { ...saveData.equippedLoadout, [targetSlot]: weaponId };
    const nextSave: SaveData = { ...saveData, equippedLoadout: nextLoadout };
    setSaveData(nextSave);
    SaveManager.save(nextSave);
  };

  const handleUpdateAttachment = (
    weaponId: WeaponId,
    partial: Partial<WeaponAttachmentConfig>
  ) => {
    audioRef.current?.playMenuClick();
    const current =
      saveData.weaponAttachments?.[weaponId] || DEFAULT_WEAPON_ATTACHMENTS[weaponId];
    const nextAttachments = {
      ...(saveData.weaponAttachments || DEFAULT_WEAPON_ATTACHMENTS),
      [weaponId]: { ...current, ...partial },
    };
    const nextSave: SaveData = { ...saveData, weaponAttachments: nextAttachments };
    setSaveData(nextSave);
    SaveManager.save(nextSave);
  };

  const handleExitToMenu = () => {
    audioRef.current?.playMenuClick();
    audioRef.current?.stopAmbientDrone();
    setInGame(false);
    setActiveMission(null);
    setHudState(null);
    setMissionSummary(null);
    setIsPaused(false);
    setDynamicSeedCounter(Math.floor(1000 + Math.random() * 8999));
  };

  const overallAccuracy =
    saveData.statistics.shotsFired > 0
      ? Math.round((saveData.statistics.shotsHit / saveData.statistics.shotsFired) * 100)
      : 0;

  return (
    <div className="relative w-screen h-screen bg-slate-950 text-slate-100 overflow-hidden flex flex-col">
      {/* ACTIVE 3D GAMEPLAY VIEWPORT */}
      {inGame && activeMission ? (
        <div className="relative w-full h-full">
          {/* Isolated WebGL Canvas Mount Ref */}
          <div ref={canvasMountRef} className="w-full h-full" />

          {/* Cinematic mission deployment / loading sequence */}
          {isCinematicLoading && (
            <div className="fixed inset-0 z-[60] overflow-hidden bg-[#070b12] text-white flex items-end">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_35%,rgba(112,129,144,0.28),transparent_38%),linear-gradient(180deg,#101b2a_0%,#26313a_45%,#090d12_100%)]" />
              <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'linear-gradient(110deg,transparent 0%,rgba(255,255,255,.08) 48%,transparent 49%),repeating-linear-gradient(0deg,transparent 0px,transparent 3px,rgba(0,0,0,.24) 4px)' }} />
              <div className="absolute top-[16%] right-[12%] w-40 h-40 rounded-full border border-amber-200/20 shadow-[0_0_70px_rgba(245,158,11,0.12)]" />
              <div className="absolute top-[22%] right-[18%] w-28 h-28 rounded-full border border-white/10" />
              <div className="relative w-full p-8 md:p-14 animate-[fadeIn_.6s_ease-out]">
                <div className="max-w-3xl border-l-2 border-amber-400 pl-5">
                  <div className="text-[10px] md:text-xs font-mono uppercase tracking-[0.45em] text-amber-300">SHADOWSTRIKE // TACTICAL OPERATIONS</div>
                  <h1 className="mt-3 text-3xl md:text-6xl font-black uppercase tracking-tight">{activeMission.title}</h1>
                  <p className="mt-2 text-sm md:text-lg text-slate-300">{activeMission.subtitle}</p>
                  <p className="mt-5 max-w-2xl text-xs md:text-sm leading-6 text-slate-400">{activeMission.briefing}</p>
                </div>
                <div className="mt-8 max-w-xl">
                  <div className="flex justify-between text-[10px] font-mono tracking-[0.22em] text-slate-400"><span>INSERTION IN PROGRESS</span><span>ESTABLISHING SECURE LINK</span></div>
                  <div className="mt-2 h-1 bg-white/10 overflow-hidden"><div className="h-full w-full origin-left bg-amber-400 animate-[loadBar_2.5s_cubic-bezier(.2,.7,.2,1)]" /></div>
                </div>
              </div>
              <style>{`@keyframes loadBar{from{transform:scaleX(.03)}to{transform:scaleX(1)}}@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>
            </div>
          )}

          {/* Tactical HUD Overlay */}
          {hudState && !missionSummary && (
            <TacticalHUD
              hud={hudState}
              mission={activeMission}
              showObjectivesOverlay={showObjectivesOverlay}
              onRequestPointerLock={() => engineRef.current?.requestPointerLock()}
              onPauseClick={() => engineRef.current?.setPaused(true)}
            />
          )}

          {/* PAUSE MENU MODAL */}
          {isPaused && !missionSummary && (
            <div className="fixed inset-0 z-30 bg-slate-950/88 flex items-center justify-center p-6">
              <div className="max-w-lg w-full bg-slate-900 border border-slate-700 rounded-xl p-6 shadow-2xl space-y-5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div>
                    <div className="text-xs font-mono text-amber-400">
                      OPERATION PAUSED · {activeMission.dynamicSeed || activeMission.codeName}
                    </div>
                    <h2 className="text-2xl font-bold font-display text-slate-100">
                      {activeMission.title}
                    </h2>
                  </div>
                  <span className="text-xs font-mono text-slate-400">
                    {activeMission.difficulty}
                  </span>
                </div>

                {pauseSubView === 'main' && (
                  <div className="space-y-3">
                    <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 space-y-1">
                      <div className="font-semibold text-amber-400">
                        Live Tactical Recon Briefing
                      </div>
                      <p>{activeMission.dynamicReconSummary || activeMission.briefing}</p>
                    </div>

                    <button
                      onClick={() => {
                        engineRef.current?.setPaused(false);
                        engineRef.current?.requestPointerLock();
                      }}
                      className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Resume Operation
                    </button>

                    <button
                      onClick={() => {
                        const base =
                          MISSION_DEFINITIONS.find((m) => m.id === activeMission.id) ||
                          activeMission;
                        deployMission(base);
                      }}
                      className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-sm rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Restart Mission (New Dynamic Seed)
                    </button>

                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        onClick={() => setPauseSubView('controls')}
                        className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Controls Guide
                      </button>
                      <button
                        onClick={() => setPauseSubView('settings')}
                        className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Settings
                      </button>
                    </div>

                    <button
                      onClick={handleExitToMenu}
                      className="w-full py-2.5 px-4 bg-red-950/70 hover:bg-red-900/80 border border-red-800/60 text-red-200 font-medium text-xs rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Abort & Return to Main Menu
                    </button>
                  </div>
                )}

                {pauseSubView === 'controls' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      {[
                        ['W / A / S / D', 'Move Operative'],
                        ['Mouse / Right Click', 'Aim & ADS Zoom'],
                        ['Left Click / R', 'Fire / Reload'],
                        ['1 / 2 / 3', 'Switch Weapons'],
                        ['E', 'Interact / Collect Pickup'],
                        ['G / 4 (or B)', 'Throw / Cycle Grenade'],
                        ['V', 'Tactical Recon Scanner'],
                        ['H / T', 'Use Medkit / Armor Plate'],
                        ['F / N', 'Flashlight / Night Vision'],
                        ['Q (or Alt)', 'Tactical Evasion Dash'],
                        ['Shift / C', 'Sprint / Crouch'],
                        ['M / Tab', 'Expand Radar / Briefing'],
                      ].map(([key, action]) => (
                        <div
                          key={key}
                          className="p-2 bg-slate-950 border border-slate-800 rounded flex items-center justify-between gap-2"
                        >
                          <span className="text-amber-400 font-semibold whitespace-nowrap">
                            {key}
                          </span>
                          <span className="text-slate-300 font-sans text-right">{action}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => setPauseSubView('main')}
                      className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg cursor-pointer"
                    >
                      Back to Pause Menu
                    </button>
                  </div>
                )}

                {pauseSubView === 'settings' && (
                  <div className="space-y-4">
                    <div className="space-y-3 text-xs">
                      <div>
                        <div className="flex justify-between mb-1">
                          <span>Mouse Sensitivity</span>
                          <span className="font-mono tabular-nums text-amber-400">
                            {saveData.settings.mouseSensitivity.toFixed(2)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.2"
                          max="2.5"
                          step="0.05"
                          value={saveData.settings.mouseSensitivity}
                          onChange={(e) =>
                            handleUpdateSettings({ mouseSensitivity: parseFloat(e.target.value) })
                          }
                          className="w-full accent-amber-500"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between mb-1">
                          <span>Master Volume</span>
                          <span className="font-mono tabular-nums text-amber-400">
                            {Math.round(saveData.settings.masterVolume * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={saveData.settings.masterVolume}
                          onChange={(e) =>
                            handleUpdateSettings({ masterVolume: parseFloat(e.target.value) })
                          }
                          className="w-full accent-amber-500"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between mb-1">
                          <span>Field of View (FOV)</span>
                          <span className="font-mono tabular-nums text-amber-400">
                            {saveData.settings.fov}°
                          </span>
                        </div>
                        <input
                          type="range"
                          min="65"
                          max="100"
                          step="1"
                          value={saveData.settings.fov}
                          onChange={(e) =>
                            handleUpdateSettings({ fov: parseInt(e.target.value, 10) })
                          }
                          className="w-full accent-amber-500"
                        />
                      </div>

                      <label className="flex items-center justify-between p-2.5 bg-slate-950 border border-slate-800 rounded-lg cursor-pointer">
                        <div>
                          <div className="font-medium text-slate-200">
                            Glow Wall & Outline Shader (Pickups & Objectives)
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Highlights medkits, ammo & objectives through cover
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={saveData.settings.pickupHighlights !== false}
                          onChange={(e) =>
                            handleUpdateSettings({ pickupHighlights: e.target.checked })
                          }
                          className="accent-amber-500"
                        />
                      </label>

                      <div>
                        <label className="block text-slate-400 mb-1">Graphics Quality Preset</label>
                        <div className="flex gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                          {(['low', 'medium', 'high', 'ultra'] as const).map((q) => (
                            <button
                              key={q}
                              onClick={() => handleUpdateSettings({ graphicsQuality: q })}
                              className={`flex-1 py-1 rounded font-medium capitalize cursor-pointer ${
                                saveData.settings.graphicsQuality === q
                                  ? 'bg-amber-500 text-slate-950 font-semibold'
                                  : 'text-slate-400'
                              }`}
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => setPauseSubView('main')}
                      className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg cursor-pointer"
                    >
                      Back to Pause Menu
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* MISSION RESULTS DEBRIEFING MODAL */}
          {missionSummary && (
            <div className="fixed inset-0 z-30 bg-slate-950/92 flex items-center justify-center p-6 overflow-y-auto">
              <div className="max-w-xl w-full bg-slate-900 border border-slate-700 rounded-xl p-6 shadow-2xl space-y-5">
                <div className="border-b border-slate-800 pb-4 flex items-center justify-between">
                  <div>
                    <div
                      className={`text-xs font-mono font-semibold ${
                        missionSummary.victory ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {missionSummary.victory
                        ? 'OPERATION ACCOMPLISHED'
                        : `OPERATION FAILED · ${missionSummary.failureReason || 'KIA'}`}
                    </div>
                    <h2 className="text-2xl font-bold font-display text-slate-100 mt-0.5">
                      {missionSummary.mission.title}
                    </h2>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-xs text-slate-400">XP EARNED</div>
                    <div className="text-xl font-bold text-amber-400 tabular-nums">
                      +{missionSummary.xpEarned} XP
                    </div>
                  </div>
                </div>

                {/* Telemetry Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono">
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                    <div className="text-[11px] text-slate-400 font-sans">Objectives</div>
                    <div className="text-lg font-bold text-slate-100 tabular-nums">
                      {missionSummary.objectivesCompleted} / {missionSummary.totalObjectives}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                    <div className="text-[11px] text-slate-400 font-sans">Hostiles Defeated</div>
                    <div className="text-lg font-bold text-slate-100 tabular-nums">
                      {missionSummary.enemiesDefeated}{' '}
                      <span className="text-xs text-amber-400">
                        ({missionSummary.headshots} HS)
                      </span>
                    </div>
                  </div>
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                    <div className="text-[11px] text-slate-400 font-sans">Weapon Accuracy</div>
                    <div className="text-lg font-bold text-slate-100 tabular-nums">
                      {missionSummary.accuracyPercent}%
                    </div>
                  </div>
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                    <div className="text-[11px] text-slate-400 font-sans">Completion Time</div>
                    <div className="text-lg font-bold text-slate-100 tabular-nums">
                      {missionSummary.completionTimeSec}s
                    </div>
                  </div>
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                    <div className="text-[11px] text-slate-400 font-sans">Damage Received</div>
                    <div className="text-lg font-bold text-slate-100 tabular-nums">
                      {missionSummary.damageReceived} HP
                    </div>
                  </div>
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                    <div className="text-[11px] text-slate-400 font-sans">Dynamic Seed</div>
                    <div className="text-sm font-bold text-sky-400 truncate">
                      {missionSummary.mission.dynamicSeed || 'STANDARD'}
                    </div>
                  </div>
                </div>

                {/* Unlocks Banner */}
                {(missionSummary.newlyUnlockedWeapons.length > 0 ||
                  missionSummary.newlyUnlockedAchievements.length > 0) && (
                  <div className="p-3.5 bg-amber-500/10 border border-amber-500/40 rounded-lg space-y-1 text-xs">
                    <div className="font-semibold text-amber-300">
                      New Commendations & Equipment Unlocked!
                    </div>
                    {missionSummary.newlyUnlockedWeapons.map((wId) => (
                      <div key={wId} className="text-slate-200">
                        • Weapon Unlocked: {WEAPON_DEFINITIONS[wId].name}
                      </div>
                    ))}
                    {missionSummary.newlyUnlockedAchievements.map((ach) => (
                      <div key={ach} className="text-slate-200">
                        • Achievement Unlocked: {ach}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  {missionSummary.victory &&
                    MISSION_DEFINITIONS[missionSummary.mission.index + 1] && (
                      <button
                        onClick={() => {
                          const nextM = MISSION_DEFINITIONS[missionSummary.mission.index + 1];
                          setSelectedBaseMissionId(nextM.id);
                          deployMission(nextM);
                        }}
                        className="flex-1 py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Deploy Next Operation
                      </button>
                    )}

                  <button
                    onClick={() => {
                      const base =
                        MISSION_DEFINITIONS.find((m) => m.id === missionSummary.mission.id) ||
                        missionSummary.mission;
                      deployMission(base);
                    }}
                    className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-sm rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Replay (New Dynamic Layout)
                  </button>

                  <button
                    onClick={handleExitToMenu}
                    className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-sm rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Main Menu
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* COMMAND CENTER MAIN MENU INTERFACE */
        <div className="flex flex-col h-full w-full overflow-hidden">
          {/* Mandatory 3-Zone Top Bar Contract */}
          <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-800 bg-slate-950 shrink-0">
            {/* Zone 1: Single text element wordmark */}
            <a
              href="#top"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('operations');
              }}
              className="text-xl font-bold tracking-wider text-slate-100 font-display whitespace-nowrap shrink-0"
            >
              SHADOWSTRIKE
            </a>

            {/* Zone 2: 5 single-line navigation links */}
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
              {(
                [
                  ['operations', 'Operations'],
                  ['armory', 'Armory'],
                  ['training', 'Training'],
                  ['statistics', 'Statistics'],
                  ['settings', 'Settings'],
                ] as const
              ).map(([tabId, label]) => (
                <button
                  key={tabId}
                  onClick={() => {
                    audioRef.current?.playMenuClick();
                    setActiveTab(tabId);
                  }}
                  className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-0.5 ${
                    activeTab === tabId
                      ? 'text-amber-400 border-b-2 border-amber-400'
                      : 'hover:text-slate-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>

            {/* Zone 3: 1 primary action */}
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={handleContinueCampaign}
                className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Continue Campaign
              </button>
            </div>
          </header>

          {/* Mobile Navigation Bar */}
          <div className="flex md:hidden items-center justify-around border-b border-slate-800 bg-slate-900/60 px-2 py-2 text-xs">
            {(
              [
                ['operations', 'Operations'],
                ['armory', 'Armory'],
                ['training', 'Training'],
                ['statistics', 'Statistics'],
                ['settings', 'Settings'],
              ] as const
            ).map(([tabId, label]) => (
              <button
                key={tabId}
                onClick={() => setActiveTab(tabId)}
                className={`px-2.5 py-1 rounded font-medium whitespace-nowrap ${
                  activeTab === tabId ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Main Scrollable Workspace Container */}
          <main className="flex-1 overflow-y-auto px-6 py-6">
            <div className="max-w-[1240px] mx-auto space-y-6">
              {/* TAB 1: OPERATIONS & DYNAMIC MISSION BRIEFING */}
              {activeTab === 'operations' && (
                <div className="space-y-6">
                  {/* Top Operative Summary Strip */}
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-800">
                    <div>
                      <p className="text-xs text-slate-400">
                        Tactical Combat Operations · Dynamic Recon, Pickups & Interactive Sectors
                      </p>
                      <h1 className="text-3xl font-bold font-display text-slate-100 mt-0.5">
                        Mission Operations Command
                      </h1>
                    </div>

                    {/* Interactive Mode Filter Segmented Control */}
                    <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg self-start">
                      {[
                        ['ALL', 'All Modes'],
                        [GameMode.Campaign, 'Campaign'],
                        [GameMode.Survival, 'Survival'],
                        [GameMode.TimeChallenge, 'Time Blitz'],
                        [GameMode.Hardcore, 'Hardcore'],
                        [GameMode.Training, 'Qualification'],
                        [GameMode.Custom, 'Custom Op'],
                      ].map(([val, label]) => (
                        <button
                          key={val}
                          onClick={() => setModeFilter(val)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            modeFilter === val
                              ? 'bg-amber-500 text-slate-950 font-semibold'
                              : 'text-slate-400 hover:text-slate-100'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {modeFilter === GameMode.Custom ? (
                    /* CUSTOM OPERATION GENERATOR PANEL */
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5 max-w-3xl">
                      <div>
                        <div className="text-xs font-mono text-amber-400">
                          CUSTOM OPERATION GENERATOR · PROCEDURAL SECTOR CONFIGURATOR
                        </div>
                        <h2 className="text-2xl font-bold font-display text-slate-100 mt-1">
                          Configure Custom Tactical Deployment
                        </h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Select base architecture, atmospheric lighting preset, hostile squad
                          density, and combat difficulty. All pickups, medkits, ammo caches, and
                          patrol routes are dynamically placed.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                        <div className="space-y-1.5">
                          <label className="text-slate-300 font-semibold block">
                            1. Combat Sector Architecture
                          </label>
                          <select
                            value={customBaseId}
                            onChange={(e) => setCustomBaseId(e.target.value)}
                            className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                          >
                            {MISSION_DEFINITIONS.filter((m) => m.mode === GameMode.Campaign).map(
                              (m) => (
                                <option key={m.id} value={m.id}>
                                  {m.title} ({m.codeName})
                                </option>
                              )
                            )}
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-slate-300 font-semibold block">
                            2. Atmospheric Sky & Lighting Preset
                          </label>
                          <select
                            value={customAtmosphere}
                            onChange={(e) =>
                              setCustomAtmosphere(e.target.value as AtmospherePresetId)
                            }
                            className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                          >
                            <option value="clear_daylight">
                              Clear Daylight (High Visibility)
                            </option>
                            <option value="golden_sunset">Golden-Hour Sunset</option>
                            <option value="overcast_industrial">Overcast Tactical Haze</option>
                            <option value="night_operation">
                              Night Operation (Searchlights & NVG)
                            </option>
                            <option value="dusty_desert">Dusty Desert Storm (Reduced LOS)</option>
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex justify-between">
                            <label className="text-slate-300 font-semibold">
                              3. Hostile Garrison Strength
                            </label>
                            <span className="font-mono text-amber-400 tabular-nums">
                              {customEnemyCount} Hostiles
                            </span>
                          </div>
                          <input
                            type="range"
                            min="4"
                            max="16"
                            step="1"
                            value={customEnemyCount}
                            onChange={(e) => setCustomEnemyCount(parseInt(e.target.value, 10))}
                            className="w-full accent-amber-500"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-slate-300 font-semibold block">
                            4. AI Tactical Difficulty
                          </label>
                          <div className="flex gap-1.5">
                            {(['Recruit', 'Operative', 'Veteran'] as const).map((diff) => (
                              <button
                                key={diff}
                                onClick={() => setCustomDifficulty(diff)}
                                className={`flex-1 py-2 rounded-lg font-semibold cursor-pointer ${
                                  customDifficulty === diff
                                    ? 'bg-amber-500 text-slate-950'
                                    : 'bg-slate-950 border border-slate-800 text-slate-400'
                                }`}
                              >
                                {diff}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={deployCustomOperation}
                        className="w-full py-3.5 px-6 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>Deploy Custom Operation ({customEnemyCount} Hostiles)</span>
                      </button>
                    </div>
                  ) : (
                    /* Two-Column Split: Mission List (Left) + Dynamic Briefing & Loadout Preview (Right) */
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                      {/* Left 5 Cols: Operations List */}
                      <div className="lg:col-span-5 space-y-3">
                        {filteredMissions.map((m) => {
                          const unlocked = SaveManager.isMissionUnlocked(m, saveData);
                          const record = saveData.missionRecords[m.id];
                          const isSelected = selectedBaseMission.id === m.id;

                          return (
                            <button
                              key={m.id}
                              onClick={() => {
                                audioRef.current?.playMenuClick();
                                setSelectedBaseMissionId(m.id);
                                setDynamicSeedCounter(Math.floor(1000 + Math.random() * 8999));
                              }}
                              className={`w-full text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-slate-900 border-amber-500/80'
                                  : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-base font-bold font-display text-slate-100">
                                  {m.title}
                                </span>
                                {!unlocked ? (
                                  <Lock className="w-4 h-4 text-slate-500 shrink-0" />
                                ) : record?.completed ? (
                                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-amber-400 shrink-0" />
                                )}
                              </div>

                              <p className="text-xs text-slate-400 mt-0.5">{m.subtitle}</p>

                              {/* Zero-Pill Unboxed Metadata with middot separators */}
                              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-2.5 font-mono tabular-nums">
                                <span className="text-amber-400">{m.mode}</span>
                                <span aria-hidden="true">·</span>
                                <span>Difficulty: {m.difficulty}</span>
                                <span aria-hidden="true">·</span>
                                <span>+{m.baseXpReward} XP</span>
                                {record?.completed && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="text-emerald-400">
                                      Best: {record.bestTimeSec}s ({record.bestAccuracy}%)
                                    </span>
                                  </>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Right 7 Cols: Dynamic Mission Briefing & Tactical Deployment Panel */}
                      <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                          <div>
                            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                              <span className="text-amber-400">
                                {previewDynamicMission.codeName}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>SEED: {previewDynamicMission.dynamicSeed}</span>
                              {previewDynamicMission.atmosphere && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-sky-400 uppercase">
                                    {previewDynamicMission.atmosphere.replace('_', ' ')}
                                  </span>
                                </>
                              )}
                            </div>
                            <h2 className="text-2xl font-bold font-display text-slate-100 mt-1">
                              {previewDynamicMission.title}
                            </h2>
                            <p className="text-xs text-slate-400">
                              {previewDynamicMission.subtitle}
                            </p>
                          </div>

                          <button
                            onClick={() => {
                              audioRef.current?.playMenuClick();
                              setDynamicSeedCounter(Math.floor(1000 + Math.random() * 8999));
                            }}
                            className="flex items-center gap-1.5 px-3 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-700 rounded-lg text-xs font-medium text-sky-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer self-start"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Reroll Dynamic Recon</span>
                          </button>
                        </div>

                        {/* Dynamic Briefing Narrative */}
                        <div className="space-y-2">
                          <h3 className="text-xs font-semibold text-slate-300">
                            01. Tactical Briefing & Satellite Recon
                          </h3>
                          <p className="text-sm text-slate-300 whitespace-pre-line leading-relaxed bg-slate-950 border border-slate-800/80 rounded-lg p-4">
                            {previewDynamicMission.briefing}
                          </p>
                        </div>

                        {/* Dynamic Randomized Objectives List */}
                        <div className="space-y-2">
                          <h3 className="text-xs font-semibold text-slate-300">
                            02. Assigned Mission Objectives (Dynamic Sectors)
                          </h3>
                          <div className="space-y-2">
                            {previewDynamicMission.objectives.map((obj, idx) => (
                              <div
                                key={obj.id}
                                className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-start justify-between gap-4"
                              >
                                <div>
                                  <div className="text-xs font-semibold text-slate-100">
                                    {idx + 1}. {obj.title}
                                  </div>
                                  <div className="text-xs text-slate-400 mt-0.5">
                                    {obj.description}
                                  </div>
                                </div>
                                <span className="text-xs font-mono text-amber-400 tabular-nums shrink-0">
                                  Target ×{obj.targetCount}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Equipped Loadout Bar */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <h3 className="text-xs font-semibold text-slate-300">
                              03. Operative Equipment Loadout
                            </h3>
                            <button
                              onClick={() => setActiveTab('armory')}
                              className="text-xs text-amber-400 hover:underline cursor-pointer"
                            >
                              Customize Weapons & Attachments →
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                            {(
                              [
                                ['Slot 1 · Primary', saveData.equippedLoadout.primary],
                                ['Slot 2 · Secondary', saveData.equippedLoadout.secondary],
                                ['Slot 3 · Sidearm', saveData.equippedLoadout.sidearm],
                              ] as const
                            ).map(([slotLabel, wId]) => {
                              const att =
                                saveData.weaponAttachments?.[wId] ||
                                DEFAULT_WEAPON_ATTACHMENTS[wId];
                              const w = getEffectiveWeaponStats(WEAPON_DEFINITIONS[wId], att);
                              return (
                                <div
                                  key={slotLabel}
                                  className="p-3 bg-slate-950 border border-slate-800 rounded-lg"
                                >
                                  <div className="text-[11px] text-slate-400 font-mono">
                                    {slotLabel}
                                  </div>
                                  <div className="font-semibold text-slate-100 mt-0.5 truncate">
                                    {w.name}
                                  </div>
                                  <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                                    {w.magazineSize}/{w.maxReserveAmmo} · {att.optic.toUpperCase()}
                                    {att.barrel === 'suppressor' ? ' · SUPP' : ''}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Deploy Action */}
                        <div className="pt-2">
                          {SaveManager.isMissionUnlocked(selectedBaseMission, saveData) ? (
                            <button
                              onClick={() =>
                                deployMission(selectedBaseMission, dynamicSeedCounter)
                              }
                              className="w-full py-3.5 px-6 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                            >
                              <Play className="w-4 h-4 fill-current" />
                              <span>
                                Deploy Into {previewDynamicMission.title} (
                                {previewDynamicMission.dynamicSeed})
                              </span>
                            </button>
                          ) : (
                            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-400 flex items-center justify-between">
                              <span>
                                Locked: Complete previous campaign operation to unlock deployment.
                              </span>
                              <Lock className="w-4 h-4 text-slate-500" />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: ARMORY & WEAPON ATTACHMENT CUSTOMIZATION */}
              {activeTab === 'armory' && (
                <div className="space-y-6">
                  <div className="border-b border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <p className="text-xs text-slate-400">
                        Ballistic Arsenal · 5 Weapon Classes, Modular Attachments & 4 Grenade Types
                      </p>
                      <h1 className="text-3xl font-bold font-display text-slate-100 mt-0.5">
                        Tactical Armory & Loadout
                      </h1>
                    </div>
                    <div className="text-xs font-mono text-slate-300 tabular-nums">
                      Operative XP:{' '}
                      <span className="text-amber-400 font-bold">{saveData.xp} XP</span> ·
                      Unlocked: {saveData.unlockedWeapons.length}/{WEAPON_LIST.length}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {WEAPON_LIST.map((baseWeapon) => {
                      const isUnlocked = saveData.unlockedWeapons.includes(baseWeapon.id);
                      const isEquipped =
                        saveData.equippedLoadout.primary === baseWeapon.id ||
                        saveData.equippedLoadout.secondary === baseWeapon.id ||
                        saveData.equippedLoadout.sidearm === baseWeapon.id;

                      const att =
                        saveData.weaponAttachments?.[baseWeapon.id] ||
                        DEFAULT_WEAPON_ATTACHMENTS[baseWeapon.id];
                      const weapon = getEffectiveWeaponStats(baseWeapon, att);

                      return (
                        <div
                          key={weapon.id}
                          className={`p-5 rounded-xl border space-y-4 ${
                            isEquipped
                              ? 'bg-slate-900 border-amber-500/70'
                              : 'bg-slate-900/50 border-slate-800'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-xs font-mono text-amber-400">
                                {weapon.weaponClass} · Slot: {weapon.slotType.toUpperCase()}
                              </div>
                              <h3 className="text-xl font-bold font-display text-slate-100 mt-0.5">
                                {weapon.name}
                              </h3>
                              <p className="text-xs text-slate-400 font-mono">
                                {weapon.designation}
                              </p>
                            </div>
                            <div className="text-right text-xs font-mono">
                              {isEquipped ? (
                                <span className="text-emerald-400 font-semibold">EQUIPPED</span>
                              ) : isUnlocked ? (
                                <span className="text-slate-400">UNLOCKED</span>
                              ) : (
                                <span className="text-red-400 flex items-center gap-1">
                                  <Lock className="w-3.5 h-3.5" /> LOCKED
                                </span>
                              )}
                            </div>
                          </div>

                          <p className="text-xs text-slate-300 leading-relaxed">
                            {weapon.description}
                          </p>

                          {/* Ballistic Telemetry Bars (reflects active attachments) */}
                          <div className="grid grid-cols-2 gap-3 text-xs font-mono tabular-nums bg-slate-950 p-3.5 rounded-lg border border-slate-800">
                            <div>
                              <div className="text-slate-400 text-[11px]">Damage</div>
                              <div className="text-slate-100 font-bold">
                                {weapon.damage}
                                {weapon.pellets > 1 ? ` × ${weapon.pellets} pellets` : ''} (HS ×
                                {weapon.headshotMultiplier})
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-400 text-[11px]">Acoustic Signature</div>
                              <div className="text-slate-100 font-bold">
                                {weapon.soundRadiusMeters}m{' '}
                                {weapon.isSuppressed ? '(Suppressed)' : '(Unsuppressed)'}
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-400 text-[11px]">Effective Range</div>
                              <div className="text-slate-100 font-bold">
                                {weapon.effectiveRange}m / {weapon.maxRange}m (ADS{' '}
                                {weapon.adsZoomFov}°)
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-400 text-[11px]">Ammunition</div>
                              <div className="text-slate-100 font-bold">
                                {weapon.magazineSize} Mag / {weapon.maxReserveAmmo} Res
                              </div>
                            </div>
                          </div>

                          {/* Modular Attachment Rails (Unlocked Weapons) */}
                          {isUnlocked && (
                            <div className="p-3.5 bg-slate-950/90 border border-slate-800 rounded-lg space-y-2.5 text-xs">
                              <div className="flex items-center gap-1.5 text-amber-400 font-mono text-[11px]">
                                <Sliders className="w-3.5 h-3.5" />
                                <span>MODULAR PICATINNY ATTACHMENTS (3D VIEWMODEL & STATS)</span>
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <div>
                                  <label className="block text-[10px] text-slate-400 mb-1">
                                    Optic Sight
                                  </label>
                                  <select
                                    value={att.optic}
                                    onChange={(e) =>
                                      handleUpdateAttachment(weapon.id, {
                                        optic: e.target.value as WeaponAttachmentConfig['optic'],
                                      })
                                    }
                                    className="w-full p-1.5 bg-slate-900 border border-slate-700 rounded text-slate-100 text-[11px]"
                                  >
                                    <option value="iron">Iron Sights</option>
                                    <option value="red_dot">Red Dot</option>
                                    <option value="holo">Holo Sight</option>
                                    <option value="acog">4x ACOG</option>
                                  </select>
                                </div>

                                <div>
                                  <label className="block text-[10px] text-slate-400 mb-1">
                                    Muzzle / Barrel
                                  </label>
                                  <select
                                    value={att.barrel}
                                    onChange={(e) =>
                                      handleUpdateAttachment(weapon.id, {
                                        barrel: e.target.value as WeaponAttachmentConfig['barrel'],
                                      })
                                    }
                                    className="w-full p-1.5 bg-slate-900 border border-slate-700 rounded text-slate-100 text-[11px]"
                                  >
                                    <option value="none">Standard</option>
                                    <option value="suppressor">Suppressor</option>
                                  </select>
                                </div>

                                <div>
                                  <label className="block text-[10px] text-slate-400 mb-1">
                                    Magazine
                                  </label>
                                  <select
                                    value={att.magazine}
                                    onChange={(e) =>
                                      handleUpdateAttachment(weapon.id, {
                                        magazine:
                                          e.target.value as WeaponAttachmentConfig['magazine'],
                                      })
                                    }
                                    className="w-full p-1.5 bg-slate-900 border border-slate-700 rounded text-slate-100 text-[11px]"
                                  >
                                    <option value="standard">Standard</option>
                                    <option value="extended">Extended Mag</option>
                                  </select>
                                </div>

                                <div>
                                  <label className="block text-[10px] text-slate-400 mb-1">
                                    Underbarrel
                                  </label>
                                  <select
                                    value={att.underbarrel}
                                    onChange={(e) =>
                                      handleUpdateAttachment(weapon.id, {
                                        underbarrel:
                                          e.target.value as WeaponAttachmentConfig['underbarrel'],
                                      })
                                    }
                                    className="w-full p-1.5 bg-slate-900 border border-slate-700 rounded text-slate-100 text-[11px]"
                                  >
                                    <option value="none">None</option>
                                    <option value="foregrip">Foregrip (-Recoil)</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="flex items-center justify-between gap-3 pt-1">
                            <span className="text-xs text-slate-400">
                              {weapon.unlockConditionText}
                            </span>

                            {isUnlocked && (
                              <button
                                onClick={() => handleEquipWeapon(weapon.id, weapon.slotType)}
                                disabled={isEquipped}
                                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                  isEquipped
                                    ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-700/50 cursor-default'
                                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                                }`}
                              >
                                {isEquipped
                                  ? `Equipped in ${weapon.slotType.toUpperCase()}`
                                  : `Equip as ${weapon.slotType.toUpperCase()}`}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 3: TRAINING & TACTICAL FIELD MANUAL */}
              {activeTab === 'training' && (
                <div className="space-y-6">
                  <div className="border-b border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <p className="text-xs text-slate-400">
                        Live-Fire Qualification Course · Controls, Pickups & Enemy AI Dossier
                      </p>
                      <h1 className="text-3xl font-bold font-display text-slate-100 mt-0.5">
                        Operative Combat Training
                      </h1>
                    </div>
                    <button
                      onClick={() => {
                        const trainMission =
                          MISSION_DEFINITIONS.find((m) => m.mode === GameMode.Training) ||
                          MISSION_DEFINITIONS[0];
                        deployMission(trainMission);
                      }}
                      className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Launch Live-Fire Training Course
                    </button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Desktop Controls Table */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                      <h2 className="text-lg font-bold font-display text-slate-100">
                        01. First-Person Tactical & Equipment Controls
                      </h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                        {[
                          ['W, A, S, D', 'Move Forward / Strafe / Back'],
                          ['Mouse / Right Click', '360° Aim / Aim Down Sights'],
                          ['Left Click / R', 'Fire Weapon / Reload Magazine'],
                          ['1, 2, 3 Keys', 'Primary / Secondary / Sidearm'],
                          ['E Key', 'Collect Medkit, Ammo, Armor or Hack'],
                          ['G / 4 (or B)', 'Throw Grenade / Cycle Frag-Smoke-Flash-EMP'],
                          ['V Key', 'Tactical Recon Scanner (Highlights Pickups)'],
                          ['H / T Keys', 'Use Carried Medkit (+35HP) / Armor Plate'],
                          ['F / N Keys', 'Tactical Flashlight / Night Vision (NVG)'],
                          ['Q (or Left Alt)', 'Tactical Evasion Dash Burst'],
                          ['Shift / C', 'Tactical Sprint / Crouch Stance'],
                          ['M / Tab / Esc', 'Expand Radar / Recon Briefing / Pause'],
                        ].map(([k, desc]) => (
                          <div
                            key={k}
                            className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between gap-2"
                          >
                            <span className="font-mono font-bold text-amber-400 whitespace-nowrap">
                              {k}
                            </span>
                            <span className="text-slate-300 text-right">{desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Hostile AI Personalities Dossier */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                      <h2 className="text-lg font-bold font-display text-slate-100">
                        02. Hostile AI Squad Personalities & Countermeasures
                      </h2>
                      <div className="space-y-2.5 text-xs">
                        {[
                          [
                            'Guard (Cyan Visor)',
                            'Patrols sector routes, detects line-of-sight threats, and broadcasts radio alerts. Use suppressed weapons or crouch behind cover to bypass.',
                          ],
                          [
                            'Scout (Lime Visor)',
                            'Extended visual and acoustic perception range. Investigates unsuppressed gunfire and sprinting footsteps.',
                          ],
                          [
                            'Assault (Orange Visor)',
                            'Advances aggressively toward your last known position. Deploy M18 Smoke Grenades to break line-of-sight or M84 Flashbangs to stun.',
                          ],
                          [
                            'Defender (Blue Visor)',
                            'Anchors near key mission objectives (Intel Terminals & Radar Jammers) and utilizes low barriers for cover.',
                          ],
                          [
                            'Elite / Commander (Red Visor)',
                            'Heavily armored tactical veterans. Use EMP Grenades to strip their armor and disable nearby radar jammers or security doors.',
                          ],
                        ].map(([title, desc]) => (
                          <div
                            key={title}
                            className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-1"
                          >
                            <div className="font-semibold text-slate-100">{title}</div>
                            <p className="text-slate-400 leading-relaxed">{desc}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: STATISTICS, ACHIEVEMENTS & AUTOMATED VERIFICATION */}
              {activeTab === 'statistics' && (
                <div className="space-y-6">
                  <div className="border-b border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <p className="text-xs text-slate-400">
                        Persistent Service Record · Rank: {saveData.rankTitle}
                      </p>
                      <h1 className="text-3xl font-bold font-display text-slate-100 mt-0.5">
                        Operative Statistics & Verification
                      </h1>
                    </div>
                    <div className="flex items-center gap-2">
                      {!confirmReset ? (
                        <button
                          onClick={() => setConfirmReset(true)}
                          className="px-3.5 py-2 bg-slate-900 hover:bg-red-950/60 border border-slate-800 text-xs text-slate-300 rounded-lg transition-colors cursor-pointer"
                        >
                          Reset Career Save Data
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              const fresh = SaveManager.reset();
                              setSaveData(fresh);
                              setConfirmReset(false);
                            }}
                            className="px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg cursor-pointer"
                          >
                            Confirm Reset
                          </button>
                          <button
                            onClick={() => setConfirmReset(false)}
                            className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-lg cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Career Metrics Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono tabular-nums">
                    <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
                      <div className="text-xs text-slate-400 font-sans">Missions Completed</div>
                      <div className="text-2xl font-bold text-amber-400 mt-1">
                        {saveData.statistics.missionsCompleted}
                      </div>
                    </div>
                    <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
                      <div className="text-xs text-slate-400 font-sans">Hostiles Defeated</div>
                      <div className="text-2xl font-bold text-slate-100 mt-1">
                        {saveData.statistics.enemiesDefeated}{' '}
                        <span className="text-xs text-amber-400">
                          ({saveData.statistics.headshots} HS)
                        </span>
                      </div>
                    </div>
                    <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
                      <div className="text-xs text-slate-400 font-sans">Career Accuracy</div>
                      <div className="text-2xl font-bold text-slate-100 mt-1">
                        {overallAccuracy}%
                      </div>
                    </div>
                    <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
                      <div className="text-xs text-slate-400 font-sans">Best Survival Wave</div>
                      <div className="text-2xl font-bold text-sky-400 mt-1">
                        Wave {saveData.statistics.bestSurvivalWave}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Achievements */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                      <h2 className="text-lg font-bold font-display text-slate-100">
                        Combat Commendations & Achievements
                      </h2>
                      <div className="space-y-2.5">
                        {saveData.achievements.map((ach) => (
                          <div
                            key={ach.id}
                            className={`p-3.5 rounded-lg border flex items-center justify-between gap-3 ${
                              ach.unlocked
                                ? 'bg-slate-950 border-amber-500/50'
                                : 'bg-slate-950/50 border-slate-800 opacity-60'
                            }`}
                          >
                            <div>
                              <div className="text-xs font-semibold text-slate-100">
                                {ach.title}
                              </div>
                              <div className="text-xs text-slate-400">{ach.description}</div>
                            </div>
                            <span
                              className={`text-xs font-mono ${
                                ach.unlocked ? 'text-emerald-400 font-semibold' : 'text-slate-500'
                              }`}
                            >
                              {ach.unlocked ? 'UNLOCKED' : 'LOCKED'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Deterministic Automated System Diagnostics */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold font-display text-slate-100">
                          Automated Engine Verification Suite ({testResults.filter((t) => t.passed).length}/
                          {testResults.length} Passed)
                        </h2>
                        <button
                          onClick={() => setTestResults(runAllAutomatedTests())}
                          className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-mono text-amber-400 rounded cursor-pointer"
                        >
                          Re-Run Tests
                        </button>
                      </div>
                      <div className="space-y-2">
                        {testResults.map((t) => (
                          <div
                            key={t.name}
                            className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between gap-3 text-xs"
                          >
                            <div>
                              <div className="font-semibold text-slate-200">{t.name}</div>
                              <div className="text-[11px] font-mono text-slate-400">
                                {t.category} · {t.details}
                              </div>
                            </div>
                            <span
                              className={`font-mono font-bold shrink-0 ${
                                t.passed ? 'text-emerald-400' : 'text-red-400'
                              }`}
                            >
                              {t.passed ? 'PASS' : 'FAIL'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: SETTINGS */}
              {activeTab === 'settings' && (
                <div className="space-y-6 max-w-3xl">
                  <div className="border-b border-slate-800 pb-4">
                    <p className="text-xs text-slate-400">
                      Persistent Configuration · Automatically Saved to Browser Storage
                    </p>
                    <h1 className="text-3xl font-bold font-display text-slate-100 mt-0.5">
                      System & Tactical Settings
                    </h1>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6 text-sm">
                    {/* Controls & Camera */}
                    <div className="space-y-4">
                      <h2 className="text-base font-bold font-display text-amber-400">
                        Mouse, Aim & Camera
                      </h2>

                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span>Mouse Look Sensitivity</span>
                          <span className="font-mono tabular-nums text-amber-400">
                            {saveData.settings.mouseSensitivity.toFixed(2)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.2"
                          max="2.5"
                          step="0.05"
                          value={saveData.settings.mouseSensitivity}
                          onChange={(e) =>
                            handleUpdateSettings({ mouseSensitivity: parseFloat(e.target.value) })
                          }
                          className="w-full accent-amber-500"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span>Horizontal Field of View (FOV)</span>
                          <span className="font-mono tabular-nums text-amber-400">
                            {saveData.settings.fov}°
                          </span>
                        </div>
                        <input
                          type="range"
                          min="65"
                          max="100"
                          step="1"
                          value={saveData.settings.fov}
                          onChange={(e) =>
                            handleUpdateSettings({ fov: parseInt(e.target.value, 10) })
                          }
                          className="w-full accent-amber-500"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                        <label className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-lg cursor-pointer">
                          <span>Invert Mouse Y</span>
                          <input
                            type="checkbox"
                            checked={saveData.settings.invertMouseY}
                            onChange={(e) =>
                              handleUpdateSettings({ invertMouseY: e.target.checked })
                            }
                            className="accent-amber-500"
                          />
                        </label>
                        <label className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-lg cursor-pointer">
                          <span>Recoil Camera Shake</span>
                          <input
                            type="checkbox"
                            checked={saveData.settings.cameraShake}
                            onChange={(e) =>
                              handleUpdateSettings({ cameraShake: e.target.checked })
                            }
                            className="accent-amber-500"
                          />
                        </label>
                        <label className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-lg cursor-pointer">
                          <span>Weapon Bob & Motion</span>
                          <input
                            type="checkbox"
                            checked={saveData.settings.motionEffects}
                            onChange={(e) =>
                              handleUpdateSettings({ motionEffects: e.target.checked })
                            }
                            className="accent-amber-500"
                          />
                        </label>
                        <label className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-lg cursor-pointer">
                          <span>Glow Wall & Outline Shader (Pickups & Objectives)</span>
                          <input
                            type="checkbox"
                            checked={saveData.settings.pickupHighlights !== false}
                            onChange={(e) =>
                              handleUpdateSettings({ pickupHighlights: e.target.checked })
                            }
                            className="accent-amber-500"
                          />
                        </label>
                      </div>
                    </div>

                    {/* Audio Synthesizer */}
                    <div className="space-y-4 pt-4 border-t border-slate-800">
                      <h2 className="text-base font-bold font-display text-amber-400">
                        Web Audio API Mixing
                      </h2>

                      {(
                        [
                          ['masterVolume', 'Master Volume'],
                          ['sfxVolume', 'Combat Effects Volume'],
                          ['musicVolume', 'Tactical Ambient Drone Volume'],
                        ] as const
                      ).map(([field, label]) => (
                        <div key={field}>
                          <div className="flex justify-between text-xs mb-1">
                            <span>{label}</span>
                            <span className="font-mono tabular-nums text-amber-400">
                              {Math.round(saveData.settings[field] * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={saveData.settings[field]}
                            onChange={(e) =>
                              handleUpdateSettings({ [field]: parseFloat(e.target.value) })
                            }
                            className="w-full accent-amber-500"
                          />
                        </div>
                      ))}
                    </div>

                    {/* Graphics & Combat Difficulty */}
                    <div className="space-y-4 pt-4 border-t border-slate-800">
                      <h2 className="text-base font-bold font-display text-amber-400">
                        WebGL Graphics & Combat Difficulty
                      </h2>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                        <div>
                          <label className="block text-slate-400 mb-1.5">Graphics Preset</label>
                          <div className="flex gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                            {(['low', 'medium', 'high', 'ultra'] as const).map((q) => (
                              <button
                                key={q}
                                onClick={() => handleUpdateSettings({ graphicsQuality: q })}
                                className={`flex-1 py-1.5 rounded font-medium capitalize cursor-pointer ${
                                  saveData.settings.graphicsQuality === q
                                    ? 'bg-amber-500 text-slate-950 font-semibold'
                                    : 'text-slate-400'
                                }`}
                              >
                                {q}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="block text-slate-400 mb-1.5">
                            AI Combat Damage Scaling
                          </label>
                          <div className="flex gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                            {(['easy', 'normal', 'hard'] as const).map((d) => (
                              <button
                                key={d}
                                onClick={() => handleUpdateSettings({ difficultyMultiplier: d })}
                                className={`flex-1 py-1.5 rounded font-medium capitalize cursor-pointer ${
                                  saveData.settings.difficultyMultiplier === d
                                    ? 'bg-amber-500 text-slate-950 font-semibold'
                                    : 'text-slate-400'
                                }`}
                              >
                                {d}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </main>

          {/* Clean Quiet Footer with Credits Modal Trigger */}
          <footer className="px-6 py-3 border-t border-slate-800/80 bg-slate-950 flex items-center justify-between text-xs text-slate-500 shrink-0">
            <div>
              SHADOWSTRIKE — Tactical Combat Operations · Rank: {saveData.rankTitle} ({saveData.xp}{' '}
              XP)
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowCreditsModal(true)}
                className="hover:text-slate-300 transition-colors cursor-pointer"
              >
                Credits & Architecture
              </button>
            </div>
          </footer>

          {/* Credits Modal */}
          {showCreditsModal && (
            <div className="fixed inset-0 z-40 bg-slate-950/85 flex items-center justify-center p-6">
              <div className="max-w-md w-full bg-slate-900 border border-slate-700 rounded-xl p-6 space-y-4">
                <h3 className="text-xl font-bold font-display text-slate-100">
                  SHADOWSTRIKE — Engineering Credits
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Built with TypeScript, Three.js WebGL PBR rendering, procedural multi-part 3D
                  geometry, A* spatial navigation, finite-state squad AI, seeded dynamic mission
                  generation, tactical equipment & pickup systems, and procedural Web Audio API
                  synthesis.
                </p>
                <button
                  onClick={() => setShowCreditsModal(false)}
                  className="w-full py-2 bg-amber-500 text-slate-950 font-semibold text-xs rounded-lg cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
