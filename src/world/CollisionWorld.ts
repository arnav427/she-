import * as THREE from 'three';
import { SurfaceMaterialType } from '../types/game';

export interface ColliderBox {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  isCover?: boolean;
  blocksVision?: boolean;
  surfaceType: SurfaceMaterialType;
}

export interface CoverNode {
  position: THREE.Vector3;
  colliderId: string;
  reservedByEnemyId?: string | null;
}

const _rayBox = new THREE.Box3();
const _ray = new THREE.Ray();
const _hitPoint = new THREE.Vector3();

export class CollisionWorld {
  public colliders: ColliderBox[] = [];
  public coverNodes: CoverNode[] = [];
  public worldBounds = { minX: -52, maxX: 52, minZ: -52, maxZ: 52 };

  public clear(): void {
    this.colliders = [];
    this.coverNodes = [];
  }

  public removeBox(id: string): void {
    this.colliders = this.colliders.filter((c) => c.id !== id);
    this.coverNodes = this.coverNodes.filter((n) => n.colliderId !== id);
  }

  public addBox(
    id: string,
    centerX: number,
    centerY: number,
    centerZ: number,
    sizeX: number,
    sizeY: number,
    sizeZ: number,
    options?: {
      isCover?: boolean;
      blocksVision?: boolean;
      surfaceType?: SurfaceMaterialType;
    }
  ): void {
    const halfX = sizeX / 2;
    const halfY = sizeY / 2;
    const halfZ = sizeZ / 2;
    const box: ColliderBox = {
      id,
      minX: centerX - halfX,
      maxX: centerX + halfX,
      minY: centerY - halfY,
      maxY: centerY + halfY,
      minZ: centerZ - halfZ,
      maxZ: centerZ + halfZ,
      isCover: options?.isCover ?? sizeY <= 2.5,
      blocksVision: options?.blocksVision ?? sizeY >= 1.1,
      surfaceType: options?.surfaceType ?? 'concrete',
    };
    this.colliders.push(box);

    if (box.isCover) {
      const offset = 1.15;
      const candidates = [
        new THREE.Vector3(centerX, 0, box.minZ - offset),
        new THREE.Vector3(centerX, 0, box.maxZ + offset),
        new THREE.Vector3(box.minX - offset, 0, centerZ),
        new THREE.Vector3(box.maxX + offset, 0, centerZ),
      ];
      for (const pt of candidates) {
        if (
          pt.x > this.worldBounds.minX + 2 &&
          pt.x < this.worldBounds.maxX - 2 &&
          pt.z > this.worldBounds.minZ + 2 &&
          pt.z < this.worldBounds.maxZ - 2
        ) {
          this.coverNodes.push({ position: pt, colliderId: id, reservedByEnemyId: null });
        }
      }
    }
  }

  /**
   * Resolves horizontal and vertical cylinder-vs-AABB collision for player or enemy actors.
   */
  public resolveCylinderMovement(
    position: THREE.Vector3,
    velocity: THREE.Vector3,
    radius: number,
    height: number
  ): { grounded: boolean; groundY: number } {
    position.x = Math.max(this.worldBounds.minX + radius, Math.min(this.worldBounds.maxX - radius, position.x));
    position.z = Math.max(this.worldBounds.minZ + radius, Math.min(this.worldBounds.maxZ - radius, position.z));

    let groundY = 0;
    const actorBottom = position.y;
    const actorTop = position.y + height;

    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < this.colliders.length; i++) {
        const b = this.colliders[i];

        const withinXZ =
          position.x + radius * 0.75 > b.minX &&
          position.x - radius * 0.75 < b.maxX &&
          position.z + radius * 0.75 > b.minZ &&
          position.z - radius * 0.75 < b.maxZ;

        if (withinXZ && actorBottom >= b.maxY - 0.35 && velocity.y <= 0) {
          if (b.maxY > groundY) {
            groundY = b.maxY;
          }
          continue;
        }

        if (actorTop <= b.minY + 0.05 || actorBottom >= b.maxY - 0.15) {
          continue;
        }

        const closestX = Math.max(b.minX, Math.min(position.x, b.maxX));
        const closestZ = Math.max(b.minZ, Math.min(position.z, b.maxZ));

        const dx = position.x - closestX;
        const dz = position.z - closestZ;
        const distSq = dx * dx + dz * dz;

        if (distSq < radius * radius) {
          if (distSq > 1e-6) {
            const dist = Math.sqrt(distSq);
            const overlap = radius - dist;
            position.x += (dx / dist) * overlap;
            position.z += (dz / dist) * overlap;
          } else {
            const penLeft = Math.abs(position.x - b.minX);
            const penRight = Math.abs(position.x - b.maxX);
            const penFront = Math.abs(position.z - b.minZ);
            const penBack = Math.abs(position.z - b.maxZ);
            const minPen = Math.min(penLeft, penRight, penFront, penBack);
            if (minPen === penLeft) position.x = b.minX - radius;
            else if (minPen === penRight) position.x = b.maxX + radius;
            else if (minPen === penFront) position.z = b.minZ - radius;
            else position.z = b.maxZ + radius;
          }
        }
      }
    }

    let grounded = false;
    if (position.y <= groundY + 0.02 && velocity.y <= 0) {
      position.y = groundY;
      velocity.y = 0;
      grounded = true;
    }

    return { grounded, groundY };
  }

  public isPointBlocked(x: number, z: number, clearanceRadius = 0.65): boolean {
    if (
      x < this.worldBounds.minX + clearanceRadius ||
      x > this.worldBounds.maxX - clearanceRadius ||
      z < this.worldBounds.minZ + clearanceRadius ||
      z > this.worldBounds.maxZ - clearanceRadius
    ) {
      return true;
    }

    for (let i = 0; i < this.colliders.length; i++) {
      const b = this.colliders[i];
      if (b.maxY < 0.4) continue;
      if (
        x + clearanceRadius > b.minX &&
        x - clearanceRadius < b.maxX &&
        z + clearanceRadius > b.minZ &&
        z - clearanceRadius < b.maxZ
      ) {
        return true;
      }
    }
    return false;
  }

  public hasLineOfSight(origin: THREE.Vector3, target: THREE.Vector3): boolean {
    const dist = origin.distanceTo(target);
    if (dist <= 0.05) return true;

    _ray.origin.copy(origin);
    _ray.direction.subVectors(target, origin).normalize();

    for (let i = 0; i < this.colliders.length; i++) {
      const b = this.colliders[i];
      if (!b.blocksVision) continue;
      _rayBox.min.set(b.minX, b.minY, b.minZ);
      _rayBox.max.set(b.maxX, b.maxY, b.maxZ);

      const hit = _ray.intersectBox(_rayBox, _hitPoint);
      if (hit) {
        const hitDist = origin.distanceTo(hit);
        if (hitDist < dist - 0.15) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Finds the closest distance, surface type, and collider ID along a ray where a solid collider is hit.
   */
  public raycastSolidDistance(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance: number
  ): {
    distance: number;
    point: THREE.Vector3 | null;
    surfaceType: SurfaceMaterialType;
    colliderId: string | null;
  } {
    _ray.origin.copy(origin);
    _ray.direction.copy(direction).normalize();

    let closestDist = maxDistance;
    let closestPoint: THREE.Vector3 | null = null;
    let surfaceType: SurfaceMaterialType = 'concrete';
    let colliderId: string | null = null;

    for (let i = 0; i < this.colliders.length; i++) {
      const b = this.colliders[i];
      _rayBox.min.set(b.minX, b.minY, b.minZ);
      _rayBox.max.set(b.maxX, b.maxY, b.maxZ);

      const hit = _ray.intersectBox(_rayBox, _hitPoint);
      if (hit) {
        const d = origin.distanceTo(hit);
        if (d < closestDist) {
          closestDist = d;
          closestPoint = hit.clone();
          surfaceType = b.surfaceType;
          colliderId = b.id;
        }
      }
    }

    if (direction.y < -1e-4 && origin.y > 0) {
      const t = -origin.y / direction.y;
      if (t > 0 && t < closestDist) {
        closestDist = t;
        closestPoint = origin.clone().addScaledVector(direction, t);
        surfaceType = 'dirt';
        colliderId = 'ground';
      }
    }

    return { distance: closestDist, point: closestPoint, surfaceType, colliderId };
  }

  /**
   * Finds a tactical cover position near `enemyPos` that shields the enemy from `threatPos`
   * and is not already reserved by another enemy.
   */
  public findBestCoverPosition(
    enemyPos: THREE.Vector3,
    threatPos: THREE.Vector3,
    enemyId?: string
  ): THREE.Vector3 | null {
    let bestNode: CoverNode | null = null;
    let bestScore = Infinity;

    for (let i = 0; i < this.coverNodes.length; i++) {
      const node = this.coverNodes[i];
      if (node.reservedByEnemyId && node.reservedByEnemyId !== enemyId) {
        continue;
      }

      const distToEnemy = enemyPos.distanceTo(node.position);
      if (distToEnemy > 24 || distToEnemy < 0.6) continue;

      if (this.isPointBlocked(node.position.x, node.position.z, 0.5)) continue;

      const testEye = new THREE.Vector3(node.position.x, 1.05, node.position.z);
      const targetEye = new THREE.Vector3(threatPos.x, 1.5, threatPos.z);
      const isShielded = !this.hasLineOfSight(testEye, targetEye);

      const score = distToEnemy + (isShielded ? -12 : 14);
      if (score < bestScore) {
        bestScore = score;
        bestNode = node;
      }
    }

    if (bestNode && enemyId) {
      for (const n of this.coverNodes) {
        if (n.reservedByEnemyId === enemyId) n.reservedByEnemyId = null;
      }
      bestNode.reservedByEnemyId = enemyId;
    }

    return bestNode ? bestNode.position.clone() : null;
  }
}
