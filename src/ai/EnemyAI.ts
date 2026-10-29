import * as THREE from 'three';
import { EnemyAIState, EnemyPersonality, EnemySpawnConfig } from '../types/game';
import { CollisionWorld } from '../world/CollisionWorld';
import { EnemyNavigation } from './EnemyNavigation';
import { createEnemyCharacterModel, EnemyMeshRig } from '../world/ProceduralModels';

const _toPlayer = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _enemyEye = new THREE.Vector3();
const _playerEye = new THREE.Vector3();
const _stepVec = new THREE.Vector3();
const _segDir = new THREE.Vector3();
const _toCloud = new THREE.Vector3();

export interface EnemyShotEvent {
  enemyId: string;
  origin: THREE.Vector3;
  direction: THREE.Vector3;
  damage: number;
}

export interface SmokeCloudVolume {
  position: THREE.Vector3;
  radius: number;
}

export function isLineObscuredBySmoke(
  eyeA: THREE.Vector3,
  eyeB: THREE.Vector3,
  smokeClouds: SmokeCloudVolume[]
): boolean {
  if (smokeClouds.length === 0) return false;
  _segDir.subVectors(eyeB, eyeA);
  const segLen = _segDir.length();
  if (segLen < 0.001) return false;
  _segDir.divideScalar(segLen);

  for (const cloud of smokeClouds) {
    _toCloud.subVectors(cloud.position, eyeA);
    const t = Math.max(0, Math.min(segLen, _toCloud.dot(_segDir)));
    const closestX = eyeA.x + _segDir.x * t;
    const closestY = eyeA.y + _segDir.y * t;
    const closestZ = eyeA.z + _segDir.z * t;
    const distSq =
      (closestX - cloud.position.x) ** 2 +
      (closestY - cloud.position.y) ** 2 +
      (closestZ - cloud.position.z) ** 2;
    if (distSq <= cloud.radius * cloud.radius) {
      return true;
    }
  }
  return false;
}

export class EnemyAgent {
  public id: string;
  public personality: EnemyPersonality;
  public isCommander: boolean;
  public state: EnemyAIState = EnemyAIState.Patrol;
  public health: number;
  public maxHealth: number;
  public armor: number;
  public maxArmor: number;

  public position: THREE.Vector3;
  public velocity = new THREE.Vector3();
  public yaw = 0;

  public rig: EnemyMeshRig;
  public patrolPoints: THREE.Vector3[];
  private currentPatrolIndex = 0;

  public lastKnownPlayerPos: THREE.Vector3 | null = null;
  public timeSinceSawPlayer = 999;
  public awareness = 0; // 0 to 100
  public stunTimer = 0;
  public lootDropped = false;

  private waypoints: THREE.Vector3[] = [];
  private repathTimer = 0;
  private stateTimer = 0;
  private fireCooldown = 0;
  private burstRemaining = 0;
  private hitFlashTimer = 0;
  private stuckTimer = 0;
  private lastCheckedPos = new THREE.Vector3();
  private walkPhase = 0;
  private hasBroadcastAlert = false;

  constructor(config: EnemySpawnConfig, scene: THREE.Scene) {
    this.id = config.id;
    this.personality = config.personality;
    this.isCommander = !!config.isCommander;
    this.health = config.health;
    this.maxHealth = config.health;
    this.armor = config.armor;
    this.maxArmor = config.armor;

    this.position = new THREE.Vector3(config.position[0], config.position[1], config.position[2]);
    this.lastCheckedPos.copy(this.position);

    this.patrolPoints = config.patrolPoints.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    if (this.patrolPoints.length <= 1) {
      this.state = EnemyAIState.Guard;
    }

    this.rig = createEnemyCharacterModel(this.id, this.personality, this.isCommander);
    this.rig.root.position.copy(this.position);
    scene.add(this.rig.root);
  }

  public isAlive(): boolean {
    return this.state !== EnemyAIState.Defeated && this.health > 0;
  }

  /**
   * Applies Flashbang or EMP tactical disruption stun for `durationSec`.
   */
  public applyFlashStun(durationSec: number): void {
    if (!this.isAlive()) return;
    this.stunTimer = Math.max(this.stunTimer, durationSec);
    this.burstRemaining = 0;
    this.fireCooldown = Math.max(this.fireCooldown, durationSec);
  }

  /**
   * Notifies the enemy of a loud sound (gunshot, grenade, sprinting) at `soundOrigin`.
   */
  public notifySound(soundOrigin: THREE.Vector3, radius: number): void {
    if (!this.isAlive()) return;
    const dist = this.position.distanceTo(soundOrigin);
    const effectiveRadius = this.personality === EnemyPersonality.Scout ? radius * 1.35 : radius;
    if (dist <= effectiveRadius) {
      this.lastKnownPlayerPos = soundOrigin.clone();
      this.awareness = Math.min(100, this.awareness + 55);
      if (
        this.state === EnemyAIState.Patrol ||
        this.state === EnemyAIState.Guard ||
        this.state === EnemyAIState.ReturnToPatrol
      ) {
        this.transitionTo(EnemyAIState.Investigate);
      }
    }
  }

  /**
   * Receives squad radio alert from a nearby ally.
   */
  public receiveSquadAlert(targetPos: THREE.Vector3): void {
    if (!this.isAlive()) return;
    this.lastKnownPlayerPos = targetPos.clone();
    this.awareness = 100;
    if (
      this.state === EnemyAIState.Patrol ||
      this.state === EnemyAIState.Guard ||
      this.state === EnemyAIState.Suspicious ||
      this.state === EnemyAIState.Investigate
    ) {
      if (
        this.personality === EnemyPersonality.Elite ||
        this.personality === EnemyPersonality.Assault
      ) {
        this.transitionTo(EnemyAIState.Flank);
      } else {
        this.transitionTo(EnemyAIState.Alert);
      }
    }
  }

  /**
   * Applies damage to this enemy and triggers immediate combat awareness.
   */
  public applyDamage(
    healthDamage: number,
    armorDamage: number,
    attackerPos: THREE.Vector3
  ): { defeated: boolean } {
    if (!this.isAlive()) return { defeated: false };

    this.armor = Math.max(0, this.armor - armorDamage);
    this.health = Math.max(0, this.health - healthDamage);
    this.hitFlashTimer = 0.16;
    this.lastKnownPlayerPos = attackerPos.clone();
    this.awareness = 100;
    this.timeSinceSawPlayer = 0;

    if (this.health <= 0) {
      this.transitionTo(EnemyAIState.Defeated);
      return { defeated: true };
    }

    const healthRatio = this.health / this.maxHealth;
    if (healthRatio < 0.38 && this.personality !== EnemyPersonality.Assault) {
      this.transitionTo(EnemyAIState.SeekCover);
    } else if (
      this.state !== EnemyAIState.Engage &&
      this.state !== EnemyAIState.SeekCover &&
      this.state !== EnemyAIState.Flank
    ) {
      this.transitionTo(EnemyAIState.Engage);
    }

    return { defeated: false };
  }

  private transitionTo(nextState: EnemyAIState): void {
    if (this.state === EnemyAIState.Defeated) return;
    this.state = nextState;
    this.stateTimer = 0;
    this.repathTimer = 0;
  }

  public update(
    dt: number,
    playerPos: THREE.Vector3,
    playerCrouching: boolean,
    collisionWorld: CollisionWorld,
    navigation: EnemyNavigation,
    allAllies: EnemyAgent[],
    difficultyMultiplier: 'easy' | 'normal' | 'hard',
    cameraPos: THREE.Vector3,
    smokeClouds: SmokeCloudVolume[] = []
  ): { shotEvent: EnemyShotEvent | null; alertedJustNow: boolean } {
    let alertedJustNow = false;

    // 1. Handle Defeated collapse animation
    if (this.state === EnemyAIState.Defeated) {
      this.rig.root.rotation.x = THREE.MathUtils.damp(
        this.rig.root.rotation.x,
        -Math.PI / 2,
        8,
        dt
      );
      this.rig.root.position.y = THREE.MathUtils.damp(this.rig.root.position.y, 0.18, 8, dt);
      if (this.rig.healthBarFill.parent) {
        this.rig.healthBarFill.parent.visible = false;
      }
      return { shotEvent: null, alertedJustNow: false };
    }

    this.stateTimer += dt;
    this.repathTimer -= dt;
    this.fireCooldown -= dt;
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt;
    }

    // Update overhead HUD billboard orientation toward player camera
    const hudParent = this.rig.healthBarFill.parent;
    if (hudParent) {
      hudParent.lookAt(cameraPos);
      const hpRatio = Math.max(0.01, this.health / this.maxHealth);
      this.rig.healthBarFill.scale.x = hpRatio;
    }

    // Handle Flashbang / EMP Stun state
    if (this.stunTimer > 0) {
      this.stunTimer -= dt;
      this.rig.bodyGroup.rotation.z = Math.sin(this.stateTimer * 18) * 0.08;
      const stateMat = this.rig.stateIndicatorMesh.material as THREE.MeshStandardMaterial;
      stateMat.color.setHex(0xfef08a);
      stateMat.emissive.setHex(0xfef08a);
      return { shotEvent: null, alertedJustNow: false };
    } else {
      this.rig.bodyGroup.rotation.z = THREE.MathUtils.damp(
        this.rig.bodyGroup.rotation.z,
        0,
        10,
        dt
      );
    }

    // 2. Perception: Distance + FOV + True Line of Sight (Wall Occlusion + Smoke Cloud Occlusion)
    _enemyEye.set(this.position.x, this.position.y + 1.55, this.position.z);
    _playerEye.set(playerPos.x, playerPos.y + (playerCrouching ? 0.95 : 1.55), playerPos.z);

    const distToPlayer = this.position.distanceTo(playerPos);
    const maxSightRange =
      (this.personality === EnemyPersonality.Scout ? 46 : 38) * (playerCrouching ? 0.72 : 1.0);

    _toPlayer.subVectors(playerPos, this.position).setY(0).normalize();
    _forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).normalize();
    const dot = _forward.dot(_toPlayer);
    const fovThreshold =
      this.awareness >= 70 || distToPlayer < 7 ? -0.35 : Math.cos(THREE.MathUtils.degToRad(68));

    const canSeePlayer =
      distToPlayer <= maxSightRange &&
      dot >= fovThreshold &&
      collisionWorld.hasLineOfSight(_enemyEye, _playerEye) &&
      !isLineObscuredBySmoke(_enemyEye, _playerEye, smokeClouds);

    if (canSeePlayer) {
      this.timeSinceSawPlayer = 0;
      this.lastKnownPlayerPos = playerPos.clone();
      const detectionRate = distToPlayer < 14 ? 220 : 125;
      this.awareness = Math.min(100, this.awareness + detectionRate * dt);

      if (this.awareness >= 100 && !this.hasBroadcastAlert) {
        this.hasBroadcastAlert = true;
        alertedJustNow = true;
        for (const ally of allAllies) {
          if (
            ally.id !== this.id &&
            ally.isAlive() &&
            ally.position.distanceTo(this.position) <= 24
          ) {
            ally.receiveSquadAlert(playerPos);
          }
        }
      }
    } else {
      this.timeSinceSawPlayer += dt;
      if (this.timeSinceSawPlayer > 4.0) {
        this.awareness = Math.max(0, this.awareness - 12 * dt);
      }
    }

    // 3. Finite State Machine Decision Logic
    const hpRatio = this.health / this.maxHealth;

    switch (this.state) {
      case EnemyAIState.Patrol:
      case EnemyAIState.Guard: {
        if (canSeePlayer && this.awareness >= 90) {
          this.transitionTo(EnemyAIState.Engage);
        } else if (canSeePlayer && this.awareness >= 40) {
          this.transitionTo(EnemyAIState.Suspicious);
        } else if (this.state === EnemyAIState.Patrol && this.patrolPoints.length > 1) {
          const targetPt = this.patrolPoints[this.currentPatrolIndex];
          if (this.position.distanceTo(targetPt) < 1.2) {
            this.currentPatrolIndex = (this.currentPatrolIndex + 1) % this.patrolPoints.length;
          }
          this.moveAlongPathTo(
            this.patrolPoints[this.currentPatrolIndex],
            2.4,
            dt,
            navigation,
            collisionWorld
          );
        } else {
          this.yaw += Math.sin(this.stateTimer * 0.9) * 0.35 * dt;
        }
        break;
      }

      case EnemyAIState.Suspicious: {
        if (this.lastKnownPlayerPos) {
          this.turnToward(this.lastKnownPlayerPos, 4.5, dt);
        }
        if (canSeePlayer && this.awareness >= 95) {
          this.transitionTo(EnemyAIState.Engage);
        } else if (this.stateTimer > 2.2) {
          if (this.lastKnownPlayerPos) {
            this.transitionTo(EnemyAIState.Investigate);
          } else {
            this.transitionTo(EnemyAIState.ReturnToPatrol);
          }
        }
        break;
      }

      case EnemyAIState.Investigate:
      case EnemyAIState.Alert: {
        if (canSeePlayer) {
          this.transitionTo(EnemyAIState.Engage);
          break;
        }
        if (this.lastKnownPlayerPos) {
          const dist = this.position.distanceTo(this.lastKnownPlayerPos);
          if (dist > 2.0) {
            this.moveAlongPathTo(this.lastKnownPlayerPos, 3.4, dt, navigation, collisionWorld);
          } else {
            this.transitionTo(EnemyAIState.Search);
          }
        } else {
          this.transitionTo(EnemyAIState.ReturnToPatrol);
        }
        break;
      }

      case EnemyAIState.Engage: {
        if (this.lastKnownPlayerPos) {
          this.turnToward(this.lastKnownPlayerPos, 7.5, dt);
        }

        if (hpRatio < 0.32 && this.stateTimer > 1.2) {
          this.transitionTo(
            this.personality === EnemyPersonality.Scout
              ? EnemyAIState.Retreat
              : EnemyAIState.SeekCover
          );
          break;
        }

        if (!canSeePlayer && this.timeSinceSawPlayer > 1.8) {
          if (
            this.personality === EnemyPersonality.Elite ||
            this.personality === EnemyPersonality.Assault
          ) {
            this.transitionTo(EnemyAIState.Flank);
          } else {
            this.transitionTo(EnemyAIState.Investigate);
          }
          break;
        }

        const idealRange =
          this.personality === EnemyPersonality.Assault
            ? 9
            : this.personality === EnemyPersonality.Defender
              ? 18
              : 14;

        if (distToPlayer > idealRange + 3 && this.lastKnownPlayerPos) {
          this.moveAlongPathTo(this.lastKnownPlayerPos, 3.8, dt, navigation, collisionWorld);
        } else if (distToPlayer < 5.5 && this.personality !== EnemyPersonality.Assault) {
          const retreatPt = this.position.clone().sub(_toPlayer.clone().multiplyScalar(4));
          this.moveAlongPathTo(retreatPt, 2.8, dt, navigation, collisionWorld);
        } else {
          const strafeDir = Math.sin(this.stateTimer * 2.2) > 0 ? 1 : -1;
          const sideVec = new THREE.Vector3(-_toPlayer.z * strafeDir, 0, _toPlayer.x * strafeDir);
          const strafeTarget = this.position.clone().addScaledVector(sideVec, 2.0);
          if (!collisionWorld.isPointBlocked(strafeTarget.x, strafeTarget.z, 0.6)) {
            this.position.addScaledVector(sideVec, 1.6 * dt);
          }
        }
        break;
      }

      case EnemyAIState.SeekCover: {
        const threat = this.lastKnownPlayerPos || playerPos;
        const coverPt = collisionWorld.findBestCoverPosition(this.position, threat, this.id);
        if (coverPt && this.position.distanceTo(coverPt) > 1.1) {
          this.moveAlongPathTo(coverPt, 4.3, dt, navigation, collisionWorld);
        } else {
          this.turnToward(threat, 6.0, dt);
          if (this.stateTimer > 2.6) {
            this.transitionTo(canSeePlayer ? EnemyAIState.Engage : EnemyAIState.Alert);
          }
        }
        break;
      }

      case EnemyAIState.Flank: {
        if (canSeePlayer && distToPlayer < 14 && this.stateTimer > 1.2) {
          this.transitionTo(EnemyAIState.Engage);
          break;
        }
        const target = this.lastKnownPlayerPos || playerPos;
        const flankSign = this.id.charCodeAt(this.id.length - 1) % 2 === 0 ? 1 : -1;
        const flankOffset = new THREE.Vector3(
          -_toPlayer.z * flankSign * 7,
          0,
          _toPlayer.x * flankSign * 7
        );
        const flankGoal = target.clone().add(flankOffset);
        this.moveAlongPathTo(flankGoal, 4.2, dt, navigation, collisionWorld);
        if (this.stateTimer > 5.0) {
          this.transitionTo(EnemyAIState.Engage);
        }
        break;
      }

      case EnemyAIState.Retreat: {
        const awayVec = this.position.clone().sub(playerPos).setY(0).normalize();
        const retreatGoal = this.position.clone().addScaledVector(awayVec, 10);
        this.moveAlongPathTo(retreatGoal, 4.2, dt, navigation, collisionWorld);
        if (this.stateTimer > 3.0) {
          this.transitionTo(EnemyAIState.SeekCover);
        }
        break;
      }

      case EnemyAIState.Search: {
        this.yaw += 1.6 * dt;
        if (canSeePlayer) {
          this.transitionTo(EnemyAIState.Engage);
        } else if (this.stateTimer > 4.0) {
          this.transitionTo(EnemyAIState.ReturnToPatrol);
        }
        break;
      }

      case EnemyAIState.ReturnToPatrol: {
        if (canSeePlayer) {
          this.transitionTo(EnemyAIState.Engage);
          break;
        }
        const homePt = this.patrolPoints[0];
        if (this.position.distanceTo(homePt) > 1.3) {
          this.moveAlongPathTo(homePt, 2.8, dt, navigation, collisionWorld);
        } else {
          this.hasBroadcastAlert = false;
          this.transitionTo(
            this.patrolPoints.length > 1 ? EnemyAIState.Patrol : EnemyAIState.Guard
          );
        }
        break;
      }
    }

    // 4. Firing Logic (Only fires when enemy has true unobstructed Line of Sight!)
    let shotEvent: EnemyShotEvent | null = null;
    if (
      canSeePlayer &&
      (this.state === EnemyAIState.Engage ||
        this.state === EnemyAIState.Flank ||
        this.state === EnemyAIState.SeekCover)
    ) {
      if (this.fireCooldown <= 0) {
        this.burstRemaining = this.personality === EnemyPersonality.Elite ? 3 : 2;
        this.fireCooldown =
          this.personality === EnemyPersonality.Elite
            ? 1.05
            : this.personality === EnemyPersonality.Assault
              ? 1.25
              : 1.55;
      }

      if (this.burstRemaining > 0 && this.fireCooldown <= 0.85) {
        this.burstRemaining--;
        this.fireCooldown += 0.16;

        const diffScale =
          difficultyMultiplier === 'easy' ? 0.65 : difficultyMultiplier === 'hard' ? 1.25 : 1.0;

        const spread =
          this.personality === EnemyPersonality.Elite
            ? 0.032
            : this.personality === EnemyPersonality.Defender
              ? 0.045
              : 0.058;

        const aimDir = _playerEye.clone().sub(_enemyEye).normalize();
        aimDir.x += (Math.random() - 0.5) * spread;
        aimDir.y += (Math.random() - 0.5) * spread;
        aimDir.z += (Math.random() - 0.5) * spread;
        aimDir.normalize();

        const baseDmg = this.isCommander
          ? 14
          : this.personality === EnemyPersonality.Elite
            ? 11
            : 8;
        shotEvent = {
          enemyId: this.id,
          origin: _enemyEye.clone(),
          direction: aimDir,
          damage: Math.round(baseDmg * diffScale),
        };
      }
    }

    // 5. Resolve Physical Collision & Update Articulated Visual Rig
    collisionWorld.resolveCylinderMovement(this.position, this.velocity, 0.45, 1.8);
    this.rig.root.position.copy(this.position);
    this.rig.root.rotation.y = this.yaw;

    // Articulated stance crouch when taking cover & hit-flinch pitch
    const isCrouchingInCover =
      this.state === EnemyAIState.SeekCover && !canSeePlayer;
    const targetBodyY = isCrouchingInCover ? 0.62 : 0.82;
    this.rig.bodyGroup.position.y = THREE.MathUtils.damp(
      this.rig.bodyGroup.position.y,
      targetBodyY,
      10,
      dt
    );
    const flinchPitch = this.hitFlashTimer > 0 ? -0.18 : 0;
    this.rig.bodyGroup.rotation.x = THREE.MathUtils.damp(
      this.rig.bodyGroup.rotation.x,
      flinchPitch,
      14,
      dt
    );

    // Update AI State color crystal above head
    const stateColor =
      this.state === EnemyAIState.Engage || this.state === EnemyAIState.Flank
        ? 0xef4444
        : this.state === EnemyAIState.Investigate ||
            this.state === EnemyAIState.Suspicious ||
            this.state === EnemyAIState.Alert ||
            this.state === EnemyAIState.Search
          ? 0xf59e0b
          : 0x38bdf8;
    const stateMat = this.rig.stateIndicatorMesh.material as THREE.MeshStandardMaterial;
    stateMat.color.setHex(stateColor);
    stateMat.emissive.setHex(stateColor);

    const visorMat = this.rig.visorMesh.material as THREE.MeshStandardMaterial;
    visorMat.emissiveIntensity = this.hitFlashTimer > 0 ? 3.0 : 0.9;

    return { shotEvent, alertedJustNow };
  }

  private moveAlongPathTo(
    goal: THREE.Vector3,
    speed: number,
    dt: number,
    navigation: EnemyNavigation,
    collisionWorld: CollisionWorld
  ): void {
    if (this.repathTimer <= 0 || this.waypoints.length === 0) {
      this.waypoints = navigation.findPath(this.position, goal);
      this.repathTimer = 0.65 + Math.random() * 0.25;
    }

    // Stuck detection & automatic recovery
    this.stuckTimer += dt;
    if (this.stuckTimer >= 0.8) {
      const moved = this.position.distanceTo(this.lastCheckedPos);
      if (moved < 0.25 && this.waypoints.length > 0) {
        const sideAngle = this.yaw + (Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2);
        const nudgeX = this.position.x + Math.sin(sideAngle) * 0.8;
        const nudgeZ = this.position.z + Math.cos(sideAngle) * 0.8;
        if (!collisionWorld.isPointBlocked(nudgeX, nudgeZ, 0.45)) {
          this.position.x = nudgeX;
          this.position.z = nudgeZ;
        }
        this.waypoints = navigation.findPath(this.position, goal);
      }
      this.lastCheckedPos.copy(this.position);
      this.stuckTimer = 0;
    }

    const nextWp = this.waypoints[0] || goal;
    const distToWp = Math.hypot(nextWp.x - this.position.x, nextWp.z - this.position.z);
    if (distToWp < 0.65 && this.waypoints.length > 1) {
      this.waypoints.shift();
    }

    const activeWp = this.waypoints[0] || goal;
    this.turnToward(activeWp, 6.5, dt);

    _stepVec.set(activeWp.x - this.position.x, 0, activeWp.z - this.position.z);
    if (_stepVec.lengthSq() > 0.01) {
      _stepVec.normalize();
      this.position.addScaledVector(_stepVec, speed * dt);

      this.walkPhase += dt * speed * 3.2;
      this.rig.leftLeg.rotation.x = Math.sin(this.walkPhase) * 0.55;
      this.rig.rightLeg.rotation.x = -Math.sin(this.walkPhase) * 0.55;
    } else {
      this.rig.leftLeg.rotation.x = THREE.MathUtils.damp(this.rig.leftLeg.rotation.x, 0, 8, dt);
      this.rig.rightLeg.rotation.x = THREE.MathUtils.damp(this.rig.rightLeg.rotation.x, 0, 8, dt);
    }
  }

  private turnToward(target: THREE.Vector3, turnSpeed: number, dt: number): void {
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    if (dx * dx + dz * dz < 1e-4) return;
    const desiredYaw = Math.atan2(dx, dz);
    let diff = desiredYaw - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.yaw += diff * Math.min(1, turnSpeed * dt);
  }

  public dispose(scene: THREE.Scene): void {
    scene.remove(this.rig.root);
  }
}
