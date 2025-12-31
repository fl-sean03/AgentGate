import { readFile, writeFile, unlink, readdir } from 'node:fs/promises';
import { nanoid } from 'nanoid';
import type { Lease } from '../types/index.js';
import {
  getLeasesDir,
  getLeasePath,
  ensureDir,
} from '../artifacts/paths.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('lease');

// Default lease duration: 30 minutes
const DEFAULT_LEASE_DURATION_MS = 30 * 60 * 1000;

interface LeaseJson {
  id: string;
  workspaceId: string;
  runId: string;
  acquiredAt: string;
  expiresAt: string;
  lastRefreshedAt: string;
}

function toJson(lease: Lease): LeaseJson {
  return {
    id: lease.id,
    workspaceId: lease.workspaceId,
    runId: lease.runId,
    acquiredAt: lease.acquiredAt.toISOString(),
    expiresAt: lease.expiresAt.toISOString(),
    lastRefreshedAt: lease.lastRefreshedAt.toISOString(),
  };
}

function fromJson(json: LeaseJson): Lease {
  return {
    id: json.id,
    workspaceId: json.workspaceId,
    runId: json.runId,
    acquiredAt: new Date(json.acquiredAt),
    expiresAt: new Date(json.expiresAt),
    lastRefreshedAt: new Date(json.lastRefreshedAt),
  };
}

async function saveLease(lease: Lease): Promise<void> {
  await ensureDir(getLeasesDir());
  const path = getLeasePath(lease.id);
  const json = toJson(lease);
  await writeFile(path, JSON.stringify(json, null, 2), 'utf-8');
}

async function loadLease(id: string): Promise<Lease | null> {
  const path = getLeasePath(id);
  try {
    const content = await readFile(path, 'utf-8');
    const json = JSON.parse(content) as LeaseJson;
    return fromJson(json);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function deleteLease(id: string): Promise<void> {
  const path = getLeasePath(id);
  try {
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

async function listLeases(): Promise<Lease[]> {
  await ensureDir(getLeasesDir());
  const dir = getLeasesDir();

  try {
    const files = await readdir(dir);
    const leases: Lease[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const id = file.replace('.json', '');
      const lease = await loadLease(id);
      if (lease) {
        leases.push(lease);
      }
    }

    return leases;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Check if a lease is expired
 */
function isLeaseExpired(lease: Lease): boolean {
  return new Date() > lease.expiresAt;
}

/**
 * Acquire a lease for a workspace
 * Returns null if the workspace is already leased
 */
export async function acquire(
  workspaceId: string,
  runId: string,
  durationMs: number = DEFAULT_LEASE_DURATION_MS
): Promise<Lease | null> {
  // Check for existing active lease
  const existingLease = await getActiveLease(workspaceId);
  if (existingLease) {
    log.warn(
      { workspaceId, existingLeaseId: existingLease.id },
      'Workspace already has an active lease'
    );
    return null;
  }

  const now = new Date();
  const lease: Lease = {
    id: nanoid(),
    workspaceId,
    runId,
    acquiredAt: now,
    expiresAt: new Date(now.getTime() + durationMs),
    lastRefreshedAt: now,
  };

  await saveLease(lease);
  log.info(
    { leaseId: lease.id, workspaceId, runId, expiresAt: lease.expiresAt },
    'Lease acquired'
  );

  return lease;
}

/**
 * Release a lease
 */
export async function release(leaseId: string): Promise<void> {
  const lease = await loadLease(leaseId);
  if (!lease) {
    log.warn({ leaseId }, 'Attempted to release non-existent lease');
    return;
  }

  await deleteLease(leaseId);
  log.info({ leaseId, workspaceId: lease.workspaceId }, 'Lease released');
}

/**
 * Refresh a lease to extend its expiration
 */
export async function refresh(
  leaseId: string,
  durationMs: number = DEFAULT_LEASE_DURATION_MS
): Promise<void> {
  const lease = await loadLease(leaseId);
  if (!lease) {
    throw new Error(`Lease not found: ${leaseId}`);
  }

  if (isLeaseExpired(lease)) {
    throw new Error(`Lease has expired: ${leaseId}`);
  }

  const now = new Date();
  const updated: Lease = {
    ...lease,
    expiresAt: new Date(now.getTime() + durationMs),
    lastRefreshedAt: now,
  };

  await saveLease(updated);
  log.debug({ leaseId, newExpiresAt: updated.expiresAt }, 'Lease refreshed');
}

/**
 * Renew a lease to extend its expiration time.
 * This is an alias for refresh() for better API clarity.
 * Use this during long-running operations to prevent lease expiry.
 */
export async function renewLease(
  leaseId: string,
  extensionMs?: number
): Promise<void> {
  await refresh(leaseId, extensionMs);
}

/**
 * Check if a workspace is currently leased
 */
export async function isLeased(workspaceId: string): Promise<boolean> {
  const lease = await getActiveLease(workspaceId);
  return lease !== null;
}

/**
 * Get the active lease for a workspace (if any)
 * Returns null if no active lease or if the lease is expired
 */
export async function getActiveLease(
  workspaceId: string
): Promise<Lease | null> {
  const leases = await listLeases();

  for (const lease of leases) {
    if (lease.workspaceId === workspaceId) {
      if (isLeaseExpired(lease)) {
        // Clean up expired lease
        log.debug(
          { leaseId: lease.id, workspaceId },
          'Cleaning up expired lease'
        );
        await deleteLease(lease.id);
        continue;
      }
      return lease;
    }
  }

  return null;
}

/**
 * Clean up all expired leases
 */
export async function cleanupExpiredLeases(): Promise<number> {
  const leases = await listLeases();
  let cleaned = 0;

  for (const lease of leases) {
    if (isLeaseExpired(lease)) {
      await deleteLease(lease.id);
      cleaned++;
      log.debug({ leaseId: lease.id }, 'Cleaned up expired lease');
    }
  }

  if (cleaned > 0) {
    log.info({ cleaned }, 'Cleaned up expired leases');
  }

  return cleaned;
}

/**
 * Get a lease by ID
 */
export async function getLease(leaseId: string): Promise<Lease | null> {
  return loadLease(leaseId);
}
