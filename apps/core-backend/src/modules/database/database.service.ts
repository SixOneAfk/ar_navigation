import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { GraphEdge, GraphNode } from '../graph/graph.types';

const NAVIGATION_JSON_PATH = resolve(
  __dirname,
  '../../../../../apps/client/public/building_navigation.json',
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

@Injectable()
export class DatabaseService {
  async getGraphData(): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    let content: string;
    try {
      content = await readFile(NAVIGATION_JSON_PATH, 'utf8');
    } catch (error) {
      throw new Error(
        `Navigation JSON could not be read at ${NAVIGATION_JSON_PATH}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    let value: unknown;
    try {
      value = JSON.parse(content) as unknown;
    } catch (error) {
      throw new Error(`Navigation JSON could not be parsed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!isRecord(value)) throw new Error('Navigation data must be a JSON object.');
    if (!Array.isArray(value.points)) throw new Error('Navigation data is missing the points array.');
    if (!Array.isArray(value.branches)) throw new Error('Navigation data is missing the branches array.');

    const pointIds = new Set<string>();
    const nodes = value.points.map((point, index): GraphNode => {
      const label = `points[${index}]`;
      if (!isRecord(point) || typeof point.id !== 'string' || point.id.length === 0) {
        throw new Error(`${label}.id must be a non-empty string.`);
      }
      if (pointIds.has(point.id)) throw new Error(`Duplicate navigation point ID: ${point.id}.`);
      pointIds.add(point.id);
      const row = finiteNumber(point.row, `${label}.row`);
      const column = finiteNumber(point.column, `${label}.column`);
      if (!Number.isInteger(row) || !Number.isInteger(column)) {
        throw new Error(`${label}.row and ${label}.column must be integers.`);
      }
      return {
        id: point.id,
        x: finiteNumber(point.x, `${label}.x`),
        y: finiteNumber(point.y, `${label}.y`),
        row,
        column,
      };
    });

    const branchIds = new Set<string>();
    const edges = value.branches.map((branch, index): GraphEdge => {
      const label = `branches[${index}]`;
      if (!isRecord(branch) || typeof branch.id !== 'string' || branch.id.length === 0) {
        throw new Error(`${label}.id must be a non-empty string.`);
      }
      if (branchIds.has(branch.id)) throw new Error(`Duplicate navigation branch ID: ${branch.id}.`);
      branchIds.add(branch.id);
      if (typeof branch.from !== 'string' || !pointIds.has(branch.from)) {
        throw new Error(`${label} (${branch.id}) references nonexistent point "${String(branch.from)}" in from.`);
      }
      if (typeof branch.to !== 'string' || !pointIds.has(branch.to)) {
        throw new Error(`${label} (${branch.id}) references nonexistent point "${String(branch.to)}" in to.`);
      }
      const distance = finiteNumber(branch.distance, `${label}.distance`);
      if (distance <= 0) throw new Error(`${label}.distance must be positive.`);
      return { id: branch.id, from: branch.from, to: branch.to, distance };
    });

    return { nodes, edges };
  }
}
