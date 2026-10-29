import React, { useState } from 'react';
import {
  Shield,
  Heart,
  Flame,
  CheckCircle2,
  Circle,
  Pause,
  ChevronDown,
  ChevronUp,
  MousePointerClick,
  Radar,
  Flashlight,
  Eye,
  PlusSquare,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { HUDState, MissionDefinition } from '../types/game';

interface TacticalHUDProps {
  hud: HUDState;
  mission: MissionDefinition;
  showObjectivesOverlay: boolean;
  onRequestPointerLock: () => void;
  onPauseClick: () => void;
}

export const TacticalHUD: React.FC<TacticalHUDProps> = ({
  hud,
  mission,
  showObjectivesOverlay,
  onRequestPointerLock,
  onPauseClick,
}) => {
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [expandedMap, setExpandedMap] = useState(false);

  const formatTime = (sec: number) => {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  const remainingTime =
    hud.timeLimitSec !== undefined ? Math.max(0, hud.timeLimitSec - hud.missionTimeSec) : null;

  const spread = Math.max(6, Math.min(44, hud.crosshairSpreadPx));

  const grenadeLabels: Record<HUDState['activeGrenadeType'], string> = {
    frag: 'FRAG',
    smoke: 'SMOKE',
    flash: 'FLASH',
    emp: 'EMP',
  };

  return (
    <div className="fixed inset-0 pointer-events-none z-10 select-none overflow-hidden">
      {/* 0. Night-Vision Goggles (NVG) Tactical Green Phosphor Filter */}
      {hud.nightVisionActive && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle, rgba(16,185,129,0.14) 35%, rgba(6,78,59,0.48) 100%)',
            boxShadow: 'inset 0 0 90px rgba(4, 120, 87, 0.55)',
          }}
        />
      )}

      {/* Tactical Scanner Active Pulse Vignette */}
      {hud.scannerActiveTimer > 0 && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            boxShadow: 'inset 0 0 65px rgba(56, 189, 248, 0.28)',
          }}
        />
      )}

      {/* 1. Screen Damage Feedback Vignette */}
      {hud.damageFlashIntensity > 0 && (
        <div
          className="fixed inset-0 pointer-events-none transition-opacity duration-75"
          style={{
            opacity: hud.damageFlashIntensity * 0.75,
            background:
              'radial-gradient(circle, rgba(220,38,38,0) 45%, rgba(220,38,38,0.65) 100%)',
          }}
        />
      )}

      {/* Low Health Warning Edge */}
      {hud.health <= 30 && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle, rgba(153,27,27,0) 55%, rgba(185,28,28,0.42) 100%)',
          }}
        />
      )}

      {/* Precision Scope Overlay when ADS with SRS-99 Longbow or ACOG Optic */}
      {hud.isAiming &&
        (hud.activeWeapon.id === 'srs99_longbow' || hud.activeAttachments.optic === 'acog') && (
          <div className="fixed inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-[520px] h-[520px] rounded-full border-2 border-amber-400/60 shadow-[0_0_0_9999px_rgba(2,6,23,0.86)] relative flex items-center justify-center">
              <div className="w-full h-px bg-amber-400/40" />
              <div className="h-full w-px bg-amber-400/40 absolute" />
              <span className="absolute bottom-8 text-xs font-mono text-amber-400 tabular-nums">
                {hud.activeWeapon.id === 'srs99_longbow'
                  ? 'SRS-99 OPTIC · 6.5X MAGNIFICATION'
                  : 'ACOG TACTICAL OPTIC · 3.5X MAGNIFICATION'}
              </span>
            </div>
          </div>
        )}

      {/* 2. Dynamic Responsive Crosshair & Hit Marker */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative flex items-center justify-center">
          <div className="w-1 h-1 bg-amber-400 rounded-full" />

          <div
            className="absolute w-0.5 h-2.5 bg-slate-100/90"
            style={{ transform: `translateY(-${spread}px)` }}
          />
          <div
            className="absolute w-0.5 h-2.5 bg-slate-100/90"
            style={{ transform: `translateY(${spread}px)` }}
          />
          <div
            className="absolute h-0.5 w-2.5 bg-slate-100/90"
            style={{ transform: `translateX(-${spread}px)` }}
          />
          <div
            className="absolute h-0.5 w-2.5 bg-slate-100/90"
            style={{ transform: `translateX(${spread}px)` }}
          />

          {hud.hitMarkerType !== 'none' && (
            <div
              className={`absolute w-6 h-6 rotate-45 pointer-events-none ${
                hud.hitMarkerType === 'kill'
                  ? 'text-red-500 scale-125'
                  : hud.hitMarkerType === 'headshot'
                    ? 'text-amber-400 scale-110'
                    : 'text-white'
              }`}
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-2 bg-current" />
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0.5 h-2 bg-current" />
              <div className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 w-2 bg-current" />
              <div className="absolute right-0 top-1/2 -translate-y-1/2 h-0.5 w-2 bg-current" />
            </div>
          )}
        </div>
      </div>

      {/* 3. Top-Center Stack: Pointer Lock Banner & Status Toast (Non-Overlapping Flex Column) */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2.5 z-20">
        {!hud.isPointerLocked && (
          <button
            onClick={onRequestPointerLock}
            className="pointer-events-auto flex items-center gap-3 px-5 py-2.5 bg-slate-950/95 border border-amber-500/70 rounded-lg text-slate-100 shadow-xl hover:bg-slate-900 transition-colors cursor-pointer"
          >
            <MousePointerClick className="w-5 h-5 text-amber-400 shrink-0" />
            <div className="text-left">
              <div className="text-xs font-semibold text-amber-400 whitespace-nowrap">
                Click Viewport to Engage Tactical Mouse Look
              </div>
              <div className="text-[11px] text-slate-400 whitespace-nowrap">
                WASD Move · Mouse Aim/Fire · E Pickup/Interact · V Scanner · F Light · N NVG · G Grenade
              </div>
            </div>
          </button>
        )}

        {hud.statusToast && (
          <div className="px-4 py-1.5 bg-slate-950/95 border border-amber-500/60 rounded-md text-xs font-mono text-amber-300 shadow-lg whitespace-nowrap">
            {hud.statusToast}
          </div>
        )}

        {hud.scannerActiveTimer > 0 && (
          <div className="px-3.5 py-1 bg-sky-950/95 border border-sky-400/70 rounded text-[11px] font-mono text-sky-300 tabular-nums">
            TACTICAL SCANNER ACTIVE · {hud.scannerActiveTimer.toFixed(1)}s · HIGHLIGHTING PICKUPS & OBJECTIVES
          </div>
        )}
      </div>

      {/* 4. Top-Left Mission Objectives & Dynamic Seed Header */}
      <div className="fixed top-4 left-4 w-72 sm:w-80 bg-slate-950/90 border border-slate-800 rounded-lg p-3.5 text-slate-100">
        <div className="flex items-center justify-between gap-3 pb-2 mb-2 border-b border-slate-800/80">
          <div className="min-w-0">
            <h2 className="text-sm font-bold tracking-wide text-slate-100 font-display truncate">
              {mission.title}
            </h2>
            <p className="text-[11px] text-slate-400 tabular-nums truncate">
              {mission.mode} · {mission.difficulty}
              {mission.dynamicSeed ? ` · ${mission.dynamicSeed}` : ''}
            </p>
          </div>
          <div className="text-right font-mono text-xs tabular-nums shrink-0">
            <div
              className={
                remainingTime !== null && remainingTime <= 20
                  ? 'text-red-400 font-bold'
                  : 'text-amber-400'
              }
            >
              {remainingTime !== null ? formatTime(remainingTime) : formatTime(hud.missionTimeSec)}
            </div>
            <div className="text-[11px] text-slate-400">Hostiles: {hud.enemiesRemaining}</div>
          </div>
        </div>

        <div className="space-y-1.5">
          {hud.objectives.map((obj) => (
            <div
              key={obj.id}
              className={`flex items-start gap-2 text-xs ${
                obj.completed ? 'text-emerald-400 line-through opacity-75' : 'text-slate-200'
              }`}
            >
              {obj.completed ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <Circle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <span className="font-medium">{obj.title}</span>
                {obj.targetCount > 1 && (
                  <span className="ml-1.5 font-mono text-slate-400 tabular-nums">
                    ({obj.currentCount}/{obj.targetCount})
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {hud.allPrimaryComplete && (
          <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[11px] font-mono text-emerald-400">
            PRIMARY OBJECTIVES COMPLETE — PROCEED TO EXTRACTION BEACON
          </div>
        )}
      </div>

      {/* 5. Top-Right Tactical Radar Minimap, Kill Feed & Pause Control */}
      <div className="fixed top-4 right-4 flex flex-col items-end gap-2.5">
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="px-2.5 py-1.5 bg-slate-950/90 border border-slate-800 rounded text-xs font-mono text-slate-300 tabular-nums">
            {hud.fps} FPS · {hud.stealthIntact ? 'STEALTH INTACT' : 'COMBAT ALERT'}
          </div>
          <button
            onClick={() => setExpandedMap((m) => !m)}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-950/90 hover:bg-slate-900 border border-slate-700 rounded text-xs font-mono text-slate-300 cursor-pointer"
            title="Toggle Radar Size"
          >
            {expandedMap ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            onClick={onPauseClick}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950/90 hover:bg-slate-900 border border-slate-700 rounded text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Pause className="w-3.5 h-3.5" />
            <span>Pause [Esc]</span>
          </button>
        </div>

        {/* Tactical Radar Minimap */}
        <div
          className={`${
            expandedMap ? 'w-48 h-48' : 'w-32 h-32'
          } rounded-full bg-slate-950/90 border border-slate-700 relative overflow-hidden flex items-center justify-center transition-all`}
        >
          <div className="w-2/3 h-2/3 rounded-full border border-slate-800/80" />
          <div className="w-1/3 h-1/3 rounded-full border border-slate-800/80 absolute" />
          <div className="w-full h-px bg-slate-800/70 absolute" />
          <div className="h-full w-px bg-slate-800/70 absolute" />
          <div className="w-2 h-2 bg-slate-100 rounded-full z-10" />

          {hud.radarBlips.map((blip) => {
            const cos = Math.cos(hud.playerYaw);
            const sin = Math.sin(hud.playerYaw);
            const rx = blip.x * cos - blip.z * sin;
            const rz = blip.x * sin + blip.z * cos;
            const maxRadius = expandedMap ? 84 : 54;
            const scale = expandedMap ? 1.85 : 1.35;
            const px = Math.max(-maxRadius, Math.min(maxRadius, rx * scale));
            const py = Math.max(-maxRadius, Math.min(maxRadius, rz * scale));

            const colorClass =
              blip.type === 'enemy_alert'
                ? 'bg-red-500 w-2 h-2'
                : blip.type === 'enemy_unaware'
                  ? 'bg-amber-400 w-1.5 h-1.5'
                  : blip.type === 'objective'
                    ? 'bg-sky-400 w-2.5 h-2.5 rotate-45'
                    : blip.type === 'supply'
                      ? 'bg-purple-400 w-2 h-2'
                      : 'bg-emerald-400 w-2.5 h-2.5 rounded-sm';

            return (
              <div
                key={blip.id}
                className={`absolute rounded-full ${colorClass}`}
                style={{
                  transform: `translate(${px}px, ${py}px)`,
                }}
              />
            );
          })}
        </div>

        {/* Kill Notifications Feed */}
        {hud.killFeed.length > 0 && (
          <div className="space-y-1 text-right">
            {hud.killFeed.map((entry) => (
              <div
                key={entry.id}
                className="px-2.5 py-1 bg-slate-950/90 border border-slate-800 rounded text-xs text-slate-300 font-mono"
              >
                <span className="text-amber-400">{entry.weaponName}</span>
                <span className="mx-1.5 text-slate-500">·</span>
                <span className="text-slate-100">{entry.victim}</span>
                {entry.isHeadshot && (
                  <span className="ml-1.5 text-red-400 font-semibold">[HEADSHOT]</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 6. Contextual Interaction & Equipment Inspection Prompt */}
      {hud.interactionPrompt && (
        <div className="fixed bottom-36 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 bg-slate-950/95 border border-sky-500/60 px-4 py-2.5 rounded-lg shadow-lg">
          <div className="text-xs font-semibold text-sky-300 whitespace-nowrap">
            {hud.interactionPrompt}
          </div>
          {hud.interactionSubtext && (
            <div className="text-[11px] font-mono text-slate-400 whitespace-nowrap">
              {hud.interactionSubtext}
            </div>
          )}
          {hud.interactionProgress > 0 && (
            <div className="w-48 h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1">
              <div
                className="h-full bg-sky-400 transition-all duration-75"
                style={{ width: `${Math.min(100, Math.round(hud.interactionProgress * 100))}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* 7. Tab Key Detailed Briefing & Dynamic Recon Overlay */}
      {showObjectivesOverlay && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-950/85 z-20 p-6">
          <div className="max-w-xl w-full bg-slate-900 border border-slate-700 rounded-xl p-6 text-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <div className="text-xs font-mono text-amber-400">{mission.codeName}</div>
                <h3 className="text-xl font-bold font-display">{mission.title}</h3>
              </div>
              {mission.dynamicSeed && (
                <span className="text-xs font-mono text-sky-400">
                  SEED: {mission.dynamicSeed}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-300 whitespace-pre-line leading-relaxed">
              {mission.briefing}
            </p>
            <div className="space-y-2 pt-2">
              <div className="text-xs font-semibold text-slate-400">Active Objectives</div>
              {hud.objectives.map((o) => (
                <div
                  key={o.id}
                  className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-100">{o.title}</div>
                    <div className="text-slate-400">{o.description}</div>
                  </div>
                  <div className="font-mono tabular-nums text-amber-400">
                    {o.currentCount}/{o.targetCount}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 8. Unified Collapsible Bottom Control & Tactical Inventory Dock (Zero Overlap Layout) */}
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 w-full max-w-[1140px] px-4 pointer-events-auto flex flex-col items-center">
        <button
          onClick={() => setDockCollapsed((c) => !c)}
          className="flex items-center gap-1.5 px-3 py-1 bg-slate-950/90 border border-b-0 border-slate-800 rounded-t-md text-[11px] font-mono text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Show Tactical HUD</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>Collapse HUD</span>
            </>
          )}
        </button>

        {!dockCollapsed && (
          <div className="w-full bg-slate-950/95 border border-slate-800 rounded-xl px-4 py-3 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center shadow-2xl">
            {/* Left 3 Cols: Health, Armor & Stamina Bars (Well-separated from center slots) */}
            <div className="lg:col-span-3 space-y-1.5 pr-1">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-semibold text-slate-200">
                  <Heart className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <span>HP</span>
                </span>
                <span className="font-mono font-bold text-xs text-slate-100 tabular-nums">
                  {hud.health} / {hud.maxHealth}
                </span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-100 ${
                    hud.health <= 30 ? 'bg-red-500' : 'bg-emerald-400'
                  }`}
                  style={{ width: `${Math.round((hud.health / hud.maxHealth) * 100)}%` }}
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-0.5">
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-0.5">
                    <span className="flex items-center gap-1">
                      <Shield className="w-3 h-3 text-sky-400" /> Armor
                    </span>
                    <span className="font-mono tabular-nums text-sky-300">{hud.armor}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-sky-400 transition-all duration-100"
                      style={{ width: `${Math.round((hud.armor / hud.maxArmor) * 100)}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-0.5">
                    <span>{hud.isCrouching ? 'Crouch' : hud.isSprinting ? 'Sprint' : 'Stamina'}</span>
                    <span className="font-mono tabular-nums text-amber-300">{hud.stamina}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 transition-all duration-100"
                      style={{ width: `${hud.stamina}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Center 6 Cols: Weapon Slots [1/2/3] + Tactical Gadgets ([G] Grenade, [4] Type, [V] Scanner, [H] Medkit, [T] Plate) */}
            <div className="lg:col-span-6 flex flex-wrap items-center justify-center gap-1.5">
              {([1, 2, 3] as const).map((slotNum) => {
                const slotItem = hud.allWeapons[slotNum];
                const isSelected = hud.activeSlot === slotNum;
                return (
                  <div
                    key={slotNum}
                    className={`px-2.5 py-1.5 rounded-lg border text-left transition-colors min-w-[82px] ${
                      isSelected
                        ? 'bg-slate-900 border-amber-500/80 text-slate-100'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px] font-mono">
                      <span className={isSelected ? 'text-amber-400 font-bold' : 'text-slate-500'}>
                        [{slotNum}]
                      </span>
                      <span className="tabular-nums">
                        {slotItem.state.currentMag}/{slotItem.state.reserveAmmo}
                      </span>
                    </div>
                    <div className="text-[11px] font-semibold truncate max-w-[78px] mt-0.5">
                      {slotItem.def.name.split(' ')[0]}
                    </div>
                  </div>
                );
              })}

              {/* Grenade Slot [G] + Cycle [4] */}
              <div className="px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-950 text-left min-w-[74px]">
                <div className="flex items-center justify-between gap-1.5 text-[10px] font-mono text-slate-400">
                  <span>[G/4]</span>
                  <Flame className="w-3 h-3 text-orange-400" />
                </div>
                <div className="text-[11px] font-mono font-bold text-slate-200 tabular-nums mt-0.5">
                  {grenadeLabels[hud.activeGrenadeType]} {hud.grenades}
                </div>
              </div>

              {/* Tactical Scanner [V] */}
              <div
                className={`px-2.5 py-1.5 rounded-lg border text-left min-w-[68px] ${
                  hud.scannerActiveTimer > 0
                    ? 'bg-sky-950/60 border-sky-400 text-sky-200'
                    : 'bg-slate-950 border-slate-800 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-1 text-[10px] font-mono text-slate-400">
                  <span>[V]</span>
                  <Radar className="w-3 h-3 text-sky-400" />
                </div>
                <div className="text-[11px] font-mono font-bold tabular-nums mt-0.5">
                  {hud.scannerCooldown > 0
                    ? `${Math.ceil(hud.scannerCooldown)}s`
                    : `SCAN ×${hud.scannerCharges}`}
                </div>
              </div>

              {/* Carried Field Medkit [H] & Armor Plate [T] */}
              <div className="px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-950 text-left">
                <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-slate-400">
                  <span>[H] Med</span>
                  <PlusSquare className="w-3 h-3 text-emerald-400" />
                </div>
                <div className="text-[11px] font-mono font-bold text-slate-200 tabular-nums mt-0.5">
                  {hud.medkitsCarried} · [T] Plate {hud.armorPlates}
                </div>
              </div>
            </div>

            {/* Right 3 Cols: Active Weapon Ammo, Attachments & [F] Light / [N] NVG Status */}
            <div className="lg:col-span-3 flex items-center justify-between lg:justify-end gap-4">
              <div className="text-left lg:text-right min-w-0">
                <div className="text-xs font-semibold text-slate-200 truncate">
                  {hud.activeWeapon.name}
                </div>
                <div className="text-[10px] font-mono text-slate-400 truncate">
                  {hud.weaponState.isReloading
                    ? 'RELOADING MAGAZINE...'
                    : `${hud.activeAttachments.optic.toUpperCase()} · ${
                        hud.activeAttachments.barrel === 'suppressor' ? 'SUPP' : 'STD'
                      }`}
                </div>
                <div className="flex items-center lg:justify-end gap-2 mt-1 text-[10px] font-mono">
                  <span
                    className={`flex items-center gap-0.5 ${
                      hud.flashlightOn ? 'text-amber-300 font-bold' : 'text-slate-500'
                    }`}
                  >
                    <Flashlight className="w-3 h-3" /> [F] {hud.flashlightBattery}%
                  </span>
                  <span
                    className={`flex items-center gap-0.5 ${
                      hud.nightVisionActive ? 'text-emerald-400 font-bold' : 'text-slate-500'
                    }`}
                  >
                    <Eye className="w-3 h-3" /> [N] {hud.nightVisionBattery}%
                  </span>
                </div>
              </div>

              <div className="flex items-baseline gap-1 font-mono tabular-nums shrink-0">
                <span
                  className={`text-2xl font-bold ${
                    hud.weaponState.currentMag <= Math.ceil(hud.activeWeapon.magazineSize * 0.25)
                      ? 'text-red-400'
                      : 'text-amber-400'
                  }`}
                >
                  {String(hud.weaponState.currentMag).padStart(2, '0')}
                </span>
                <span className="text-slate-500 text-base">/</span>
                <span className="text-sm text-slate-300">{hud.weaponState.reserveAmmo}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
