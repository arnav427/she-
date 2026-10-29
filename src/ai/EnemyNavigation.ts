import * as THREE from 'three';
import { CollisionWorld } from '../world/CollisionWorld';

interface GridNode {
  gx: number;
  gz: number;
  g: number;
  h: number;
  f: number;
  parent: GridNode | null;
}

export class EnemyNavigation {
  private cellSize = 2.0;
  private minCoord = -44;
  private maxCoord = 44;
  private gridSize: number;

  constructor(private collisionWorld: CollisionWorld) {
    this.gridSize = Math.ceil((this.maxCoord - this.minCoord) / this.cellSize);
  }

  private worldToGrid(x: number, z: number): { gx: number; gz: number } {
    const gx = Math.max(0, Math.min(this.gridSize - 1, Math.floor((x - this.minCoord) / this.cellSize)));
    const gz = Math.max(0, Math.min(this.gridSize - 1, Math.floor((z - this.minCoord) / this.cellSize)));
    return { gx, gz };
  }

  private gridToWorld(gx: number, gz: number): THREE.Vector3 {
    const wx = this.minCoord + (gx + 0.5) * this.cellSize;
    const wz = this.minCoord + (gz + 0.5) * this.cellSize;
    return new THREE.Vector3(wx, 0, wz);
  }

  /**
   * Computes a collision-free waypoint path from `start` to `goal` using A* search
   * over the spatial occupancy grid.
   */
  public findPath(start: THREE.Vector3, goal: THREE.Vector3): THREE.Vector3[] {
    // Fast path: if direct unobstructed path exists, return goal directly
    const startLow = new THREE.Vector3(start.x, 0.9, start.z);
    const goalLow = new THREE.Vector3(goal.x, 0.9, goal.z);
    if (
      !this.collisionWorld.isPointBlocked(goal.x, goal.z, 0.55) &&
      this.collisionWorld.hasLineOfSight(startLow, goalLow)
    ) {
      return [new THREE.Vector3(goal.x, 0, goal.z)];
    }

    const startG = this.worldToGrid(start.x, start.z);
    const goalG = this.worldToGrid(goal.x, goal.z);

    const openList: GridNode[] = [];
    const closedSet = new Set<number>();
    const gScoreMap = new Map<number, number>();

    const key = (gx: number, gz: number) => gz * this.gridSize + gx;
    const heuristic = (gx: number, gz: number) =>
      Math.hypot(gx - goalG.gx, gz - goalG.gz);

    const startNode: GridNode = {
      gx: startG.gx,
      gz: startG.gz,
      g: 0,
      h: heuristic(startG.gx, startG.gz),
      f: heuristic(startG.gx, startG.gz),
      parent: null,
    };

    openList.push(startNode);
    gScoreMap.set(key(startG.gx, startG.gz), 0);

    let bestFallbackNode: GridNode = startNode;
    let iterations = 0;
    const maxIterations = 360;

    const dirs = [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, 1],
      [0, -1, 1],
      [1, 1, 1.414],
      [-1, 1, 1.414],
      [1, -1, 1.414],
      [-1, -1, 1.414],
    ];

    while (openList.length > 0 && iterations < maxIterations) {
      iterations++;
      // Pop lowest f-score node
      let lowestIdx = 0;
      for (let i = 1; i < openList.length; i++) {
        if (openList[i].f < openList[lowestIdx].f) {
          lowestIdx = i;
        }
      }
      const current = openList.splice(lowestIdx, 1)[0];
      const cKey = key(current.gx, current.gz);
      closedSet.add(cKey);

      if (current.h < bestFallbackNode.h) {
        bestFallbackNode = current;
      }

      if (current.gx === goalG.gx && current.gz === goalG.gz) {
        bestFallbackNode = current;
        break;
      }

      for (let d = 0; d < dirs.length; d++) {
        const ngx = current.gx + dirs[d][0];
        const ngz = current.gz + dirs[d][1];
        const stepCost = dirs[d][2];

        if (ngx < 0 || ngx >= this.gridSize || ngz < 0 || ngz >= this.gridSize) continue;
        const nKey = key(ngx, ngz);
        if (closedSet.has(nKey)) continue;

        const worldPt = this.gridToWorld(ngx, ngz);
        if (
          !(ngx === goalG.gx && ngz === goalG.gz) &&
          this.collisionWorld.isPointBlocked(worldPt.x, worldPt.z, 0.65)
        ) {
          continue;
        }

        const tentativeG = current.g + stepCost;
        const prevG = gScoreMap.get(nKey);
        if (prevG !== undefined && tentativeG >= prevG) continue;

        const h = heuristic(ngx, ngz);
        const neighborNode: GridNode = {
          gx: ngx,
          gz: ngz,
          g: tentativeG,
          h,
          f: tentativeG + h,
          parent: current,
        };
        gScoreMap.set(nKey, tentativeG);
        openList.push(neighborNode);
      }
    }

    const rawWaypoints: THREE.Vector3[] = [];
    let curr: GridNode | null = bestFallbackNode;
    while (curr && curr.parent !== null) {
      rawWaypoints.push(this.gridToWorld(curr.gx, curr.gz));
      curr = curr.parent;
    }
    rawWaypoints.reverse();

    if (rawWaypoints.length === 0) {
      return [new THREE.Vector3(goal.x, 0, goal.z)];
    }

    return rawWaypoints;
  }
}
