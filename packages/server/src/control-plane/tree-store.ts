/**
 * Tree Store (v0.2.10)
 *
 * Manages persistence of tree metadata for recursive agent spawning.
 * Each tree is stored as JSON in ~/.agentgate/trees/{rootId}.json
 */

import { readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import {
  getTreesDir,
  getTreePath,
  ensureDir,
} from '../artifacts/paths.js';
import type {
  TreeMetadata,
  TreeNode,
  TreeStatus,
  WorkOrderStatus,
  IntegrationStatus,
} from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('tree-store');

/**
 * Serializable version of TreeMetadata for JSON persistence.
 * Converts Date objects to ISO strings.
 */
interface SerializedTreeNode {
  workOrderId: string;
  parentId: string | null;
  childIds: string[];
  status: WorkOrderStatus;
  integrationStatus?: IntegrationStatus;
  integrationWorkOrderId?: string;
  depth: number;
  siblingIndex: number;
  createdAt: string;
  completedAt?: string;
}

interface SerializedTreeMetadata {
  rootId: string;
  status: TreeStatus;
  nodes: Record<string, SerializedTreeNode>;
  createdAt: string;
  completedAt?: string;
  nodeCount: number;
}

/**
 * Serialize a TreeNode for JSON storage.
 */
function serializeNode(node: TreeNode): SerializedTreeNode {
  const result: SerializedTreeNode = {
    workOrderId: node.workOrderId,
    parentId: node.parentId,
    childIds: node.childIds,
    status: node.status,
    depth: node.depth,
    siblingIndex: node.siblingIndex,
    createdAt: node.createdAt.toISOString(),
  };

  if (node.integrationStatus !== undefined) {
    result.integrationStatus = node.integrationStatus;
  }
  if (node.integrationWorkOrderId !== undefined) {
    result.integrationWorkOrderId = node.integrationWorkOrderId;
  }
  if (node.completedAt !== undefined) {
    result.completedAt = node.completedAt.toISOString();
  }

  return result;
}

/**
 * Deserialize a TreeNode from JSON storage.
 */
function deserializeNode(data: SerializedTreeNode): TreeNode {
  const result: TreeNode = {
    workOrderId: data.workOrderId,
    parentId: data.parentId,
    childIds: data.childIds,
    status: data.status,
    depth: data.depth,
    siblingIndex: data.siblingIndex,
    createdAt: new Date(data.createdAt),
  };

  if (data.integrationStatus !== undefined) {
    result.integrationStatus = data.integrationStatus;
  }
  if (data.integrationWorkOrderId !== undefined) {
    result.integrationWorkOrderId = data.integrationWorkOrderId;
  }
  if (data.completedAt !== undefined) {
    result.completedAt = new Date(data.completedAt);
  }

  return result;
}

/**
 * Serialize TreeMetadata for JSON storage.
 */
function serialize(tree: TreeMetadata): SerializedTreeMetadata {
  const nodes: Record<string, SerializedTreeNode> = {};
  for (const [id, node] of Object.entries(tree.nodes)) {
    nodes[id] = serializeNode(node);
  }

  const result: SerializedTreeMetadata = {
    rootId: tree.rootId,
    status: tree.status,
    nodes,
    createdAt: tree.createdAt.toISOString(),
    nodeCount: tree.nodeCount,
  };

  if (tree.completedAt !== undefined) {
    result.completedAt = tree.completedAt.toISOString();
  }

  return result;
}

/**
 * Deserialize TreeMetadata from JSON storage.
 */
function deserialize(data: SerializedTreeMetadata): TreeMetadata {
  const nodes: Record<string, TreeNode> = {};
  for (const [id, nodeData] of Object.entries(data.nodes)) {
    nodes[id] = deserializeNode(nodeData);
  }

  const result: TreeMetadata = {
    rootId: data.rootId,
    status: data.status,
    nodes,
    createdAt: new Date(data.createdAt),
    nodeCount: data.nodeCount,
  };

  if (data.completedAt !== undefined) {
    result.completedAt = new Date(data.completedAt);
  }

  return result;
}

/**
 * Tree Store - JSON file persistence for execution trees.
 *
 * Stores tree metadata as individual JSON files in ~/.agentgate/trees/
 */
export class TreeStore {
  private initialized = false;

  /**
   * Ensure the trees directory exists.
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await ensureDir(getTreesDir());
    this.initialized = true;
    log.debug('Tree store initialized');
  }

  /**
   * Create a new tree with a root work order.
   */
  async createTree(rootWorkOrderId: string, status: WorkOrderStatus): Promise<TreeMetadata> {
    await this.init();

    const rootNode: TreeNode = {
      workOrderId: rootWorkOrderId,
      parentId: null,
      childIds: [],
      status,
      depth: 0,
      siblingIndex: 0,
      createdAt: new Date(),
    };

    const tree: TreeMetadata = {
      rootId: rootWorkOrderId,
      status: 'active',
      nodes: {
        [rootWorkOrderId]: rootNode,
      },
      createdAt: new Date(),
      nodeCount: 1,
    };

    await this.save(tree);
    log.info({ rootId: tree.rootId }, 'Tree created');

    return tree;
  }

  /**
   * Save tree metadata to disk.
   */
  async save(tree: TreeMetadata): Promise<void> {
    await this.init();
    const path = getTreePath(tree.rootId);
    const data = serialize(tree);
    await writeFile(path, JSON.stringify(data, null, 2), 'utf-8');
    log.debug({ rootId: tree.rootId, path }, 'Tree saved');
  }

  /**
   * Load tree metadata from disk by root ID.
   * Returns null if not found.
   */
  async getTree(rootId: string): Promise<TreeMetadata | null> {
    await this.init();
    const path = getTreePath(rootId);

    if (!existsSync(path)) {
      log.debug({ rootId }, 'Tree not found');
      return null;
    }

    try {
      const content = await readFile(path, 'utf-8');
      const data = JSON.parse(content) as SerializedTreeMetadata;
      return deserialize(data);
    } catch (error) {
      log.error({ rootId, error }, 'Failed to load tree');
      throw new Error(`Failed to load tree ${rootId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Update tree metadata.
   */
  async updateTree(
    rootId: string,
    updates: Partial<Pick<TreeMetadata, 'status' | 'completedAt'>>
  ): Promise<void> {
    const tree = await this.getTree(rootId);
    if (!tree) {
      throw new Error(`Tree not found: ${rootId}`);
    }

    if (updates.status !== undefined) {
      tree.status = updates.status;
    }
    if (updates.completedAt !== undefined) {
      tree.completedAt = updates.completedAt;
    }

    await this.save(tree);
    log.debug({ rootId, updates }, 'Tree updated');
  }

  /**
   * Add a new node to the tree.
   */
  async addNode(
    rootId: string,
    workOrderId: string,
    parentId: string,
    depth: number,
    siblingIndex: number,
    status: WorkOrderStatus
  ): Promise<void> {
    const tree = await this.getTree(rootId);
    if (!tree) {
      throw new Error(`Tree not found: ${rootId}`);
    }

    // Verify parent exists
    const parent = tree.nodes[parentId];
    if (!parent) {
      throw new Error(`Parent node not found: ${parentId}`);
    }

    // Create new node
    const node: TreeNode = {
      workOrderId,
      parentId,
      childIds: [],
      status,
      depth,
      siblingIndex,
      createdAt: new Date(),
    };

    // Add to tree
    tree.nodes[workOrderId] = node;
    parent.childIds.push(workOrderId);
    tree.nodeCount++;

    await this.save(tree);
    log.info({ rootId, workOrderId, parentId }, 'Node added to tree');
  }

  /**
   * Update a node in the tree.
   */
  async updateNode(
    rootId: string,
    workOrderId: string,
    updates: Partial<Pick<TreeNode, 'status' | 'integrationStatus' | 'integrationWorkOrderId' | 'completedAt'>>
  ): Promise<void> {
    const tree = await this.getTree(rootId);
    if (!tree) {
      throw new Error(`Tree not found: ${rootId}`);
    }

    const node = tree.nodes[workOrderId];
    if (!node) {
      throw new Error(`Node not found: ${workOrderId}`);
    }

    if (updates.status !== undefined) {
      node.status = updates.status;
    }
    if (updates.integrationStatus !== undefined) {
      node.integrationStatus = updates.integrationStatus;
    }
    if (updates.integrationWorkOrderId !== undefined) {
      node.integrationWorkOrderId = updates.integrationWorkOrderId;
    }
    if (updates.completedAt !== undefined) {
      node.completedAt = updates.completedAt;
    }

    await this.save(tree);
    log.debug({ rootId, workOrderId, updates }, 'Node updated');
  }

  /**
   * List all trees.
   */
  async listTrees(): Promise<TreeMetadata[]> {
    await this.init();
    const dir = getTreesDir();

    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      // Directory might not exist yet
      return [];
    }

    const jsonFiles = files.filter(f => f.endsWith('.json'));
    const trees: TreeMetadata[] = [];

    for (const file of jsonFiles) {
      try {
        const content = await readFile(`${dir}/${file}`, 'utf-8');
        const data = JSON.parse(content) as SerializedTreeMetadata;
        const tree = deserialize(data);
        trees.push(tree);
      } catch (error) {
        log.warn({ file, error }, 'Failed to load tree file');
      }
    }

    // Sort by creation date (newest first)
    trees.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return trees;
  }

  /**
   * Delete a tree from disk.
   */
  async deleteTree(rootId: string): Promise<boolean> {
    await this.init();
    const path = getTreePath(rootId);

    if (!existsSync(path)) {
      return false;
    }

    await unlink(path);
    log.debug({ rootId }, 'Tree deleted');
    return true;
  }

  /**
   * Check if a tree exists.
   */
  async exists(rootId: string): Promise<boolean> {
    await this.init();
    const path = getTreePath(rootId);
    return existsSync(path);
  }
}

// Default singleton instance
export const treeStore = new TreeStore();
