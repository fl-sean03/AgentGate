import { EventEmitter } from 'events';
import * as os from 'os';
import type { Logger } from 'pino';
import { createLogger } from '../utils/logger.js';

/**
 * A slot handle represents a claimed execution slot.
 */
export interface SlotHandle {
  readonly id: string;
  readonly acquiredAt: Date;
  readonly workOrderId: string;
}

/**
 * Memory pressure levels.
 */
export type MemoryPressure = 'none' | 'warning' | 'critical';

/**
 * Resource health report.
 */
export interface ResourceHealthReport {
  memoryTotalMB: number;
  memoryUsedMB: number;
  memoryAvailableMB: number;
  memoryPressure: MemoryPressure;
  activeSlots: number;
  maxSlots: number;
  availableSlots: number;
  cpuUsagePercent: number;
  healthy: boolean;
}

/**
 * Configuration for resource monitoring.
 */
export interface ResourceMonitorConfig {
  maxConcurrentSlots: number;
  memoryPerSlotMB: number;
  warningThreshold: number;   // 0-1, default 0.8
  criticalThreshold: number;  // 0-1, default 0.9
  pollIntervalMs: number;     // How often to check resources
}

const DEFAULT_CONFIG: ResourceMonitorConfig = {
  maxConcurrentSlots: 2,
  memoryPerSlotMB: 4096,
  warningThreshold: 0.8,
  criticalThreshold: 0.9,
  pollIntervalMs: 5000,
};

/**
 * Events emitted by ResourceMonitor.
 */
export interface ResourceMonitorEvents {
  'slot-available': () => void;
  'memory-pressure': (level: MemoryPressure, report: ResourceHealthReport) => void;
  'health-changed': (report: ResourceHealthReport) => void;
}

/**
 * Monitors system resources and manages execution slots.
 */
export class ResourceMonitor extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: ResourceMonitorConfig;
  private readonly activeSlots: Map<string, SlotHandle> = new Map();
  private pollTimer: NodeJS.Timeout | null = null;
  private lastPressure: MemoryPressure = 'none';

  constructor(config: Partial<ResourceMonitorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = createLogger('resource-monitor');
  }

  /**
   * Start monitoring resources.
   */
  start(): void {
    if (this.pollTimer) return;

    this.logger.info(
      { config: this.config },
      'Starting resource monitor'
    );

    this.pollTimer = setInterval(() => {
      this.checkResources();
    }, this.config.pollIntervalMs);

    // Initial check
    this.checkResources();
  }

  /**
   * Stop monitoring resources.
   */
  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      this.logger.info('Resource monitor stopped');
    }
  }

  /**
   * Check current resource status and emit events if needed.
   */
  private checkResources(): void {
    const report = this.getHealthReport();

    // Check for memory pressure changes
    if (report.memoryPressure !== this.lastPressure) {
      this.logger.warn(
        { previous: this.lastPressure, current: report.memoryPressure, report },
        'Memory pressure changed'
      );
      this.lastPressure = report.memoryPressure;
      this.emit('memory-pressure', report.memoryPressure, report);
    }

    // Emit health changes
    this.emit('health-changed', report);
  }

  /**
   * Attempt to acquire an execution slot.
   * Returns null if no slots available or under memory pressure.
   */
  acquireSlot(workOrderId: string): SlotHandle | null {
    const report = this.getHealthReport();

    // Don't allocate under critical memory pressure
    if (report.memoryPressure === 'critical') {
      this.logger.warn(
        { workOrderId, pressure: report.memoryPressure },
        'Cannot acquire slot: critical memory pressure'
      );
      return null;
    }

    // Check slot availability
    if (this.activeSlots.size >= this.config.maxConcurrentSlots) {
      this.logger.debug(
        { workOrderId, activeSlots: this.activeSlots.size, maxSlots: this.config.maxConcurrentSlots },
        'Cannot acquire slot: all slots in use'
      );
      return null;
    }

    // Check if enough memory for another slot
    const requiredMemory = this.config.memoryPerSlotMB;
    if (report.memoryAvailableMB < requiredMemory) {
      this.logger.warn(
        { workOrderId, available: report.memoryAvailableMB, required: requiredMemory },
        'Cannot acquire slot: insufficient memory'
      );
      return null;
    }

    // Acquire slot
    const handle: SlotHandle = {
      id: `slot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      acquiredAt: new Date(),
      workOrderId,
    };

    this.activeSlots.set(handle.id, handle);

    this.logger.info(
      { slotId: handle.id, workOrderId, activeSlots: this.activeSlots.size },
      'Slot acquired'
    );

    return handle;
  }

  /**
   * Release an execution slot.
   */
  releaseSlot(handle: SlotHandle): void {
    if (!this.activeSlots.has(handle.id)) {
      this.logger.warn(
        { slotId: handle.id },
        'Attempted to release unknown slot'
      );
      return;
    }

    this.activeSlots.delete(handle.id);

    this.logger.info(
      { slotId: handle.id, workOrderId: handle.workOrderId, activeSlots: this.activeSlots.size },
      'Slot released'
    );

    // Notify that a slot is available
    this.emit('slot-available');
  }

  /**
   * Get current resource health report.
   */
  getHealthReport(): ResourceHealthReport {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const usageRatio = usedMemory / totalMemory;

    let memoryPressure: MemoryPressure = 'none';
    if (usageRatio >= this.config.criticalThreshold) {
      memoryPressure = 'critical';
    } else if (usageRatio >= this.config.warningThreshold) {
      memoryPressure = 'warning';
    }

    // CPU usage (load average / number of cores)
    const loadAvgArray = os.loadavg();
    const loadAvg = loadAvgArray[0] ?? 0; // 1-minute load average
    const cpuCount = os.cpus().length;
    const cpuUsagePercent = Math.min(100, (loadAvg / cpuCount) * 100);

    const activeSlots = this.activeSlots.size;
    const maxSlots = this.config.maxConcurrentSlots;

    return {
      memoryTotalMB: Math.floor(totalMemory / 1024 / 1024),
      memoryUsedMB: Math.floor(usedMemory / 1024 / 1024),
      memoryAvailableMB: Math.floor(freeMemory / 1024 / 1024),
      memoryPressure,
      activeSlots,
      maxSlots,
      availableSlots: maxSlots - activeSlots,
      cpuUsagePercent: Math.round(cpuUsagePercent),
      healthy: memoryPressure !== 'critical' && activeSlots < maxSlots,
    };
  }

  /**
   * Get number of available slots.
   */
  getAvailableSlots(): number {
    return this.config.maxConcurrentSlots - this.activeSlots.size;
  }

  /**
   * Check if resources are healthy for new work.
   */
  isHealthy(): boolean {
    return this.getHealthReport().healthy;
  }
}
