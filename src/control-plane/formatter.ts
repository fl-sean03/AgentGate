import type { WorkOrder, WorkOrderStatus } from '../types/index.js';

/**
 * ANSI color codes for terminal output.
 */
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',

  // Foreground colors
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  // Background colors
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
} as const;

/**
 * Check if colors should be enabled.
 */
function useColors(): boolean {
  // Respect NO_COLOR environment variable
  if (process.env['NO_COLOR'] !== undefined) {
    return false;
  }
  // Respect FORCE_COLOR environment variable
  if (process.env['FORCE_COLOR'] !== undefined) {
    return true;
  }
  // Default: use colors if stdout is a TTY
  return process.stdout.isTTY ?? false;
}

/**
 * Apply color to text if colors are enabled.
 */
function colorize(text: string, color: keyof typeof colors): string {
  if (!useColors()) {
    return text;
  }
  return `${colors[color]}${text}${colors.reset}`;
}

/**
 * Format helper functions.
 */
export function bold(text: string): string {
  return colorize(text, 'bold');
}

export function dim(text: string): string {
  return colorize(text, 'dim');
}

export function red(text: string): string {
  return colorize(text, 'red');
}

export function green(text: string): string {
  return colorize(text, 'green');
}

export function yellow(text: string): string {
  return colorize(text, 'yellow');
}

export function blue(text: string): string {
  return colorize(text, 'blue');
}

export function cyan(text: string): string {
  return colorize(text, 'cyan');
}

export function gray(text: string): string {
  return colorize(text, 'gray');
}

export function magenta(text: string): string {
  return colorize(text, 'magenta');
}

/**
 * Format a work order status with appropriate color.
 */
export function formatStatus(status: WorkOrderStatus): string {
  const statusColors: Record<WorkOrderStatus, keyof typeof colors> = {
    queued: 'yellow',
    running: 'blue',
    succeeded: 'green',
    failed: 'red',
    canceled: 'gray',
  };

  const color = statusColors[status] ?? 'white';
  return colorize(status.toUpperCase(), color);
}

/**
 * Format a date for display.
 */
export function formatDate(date: Date): string {
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Format a relative time (e.g., "2 hours ago").
 */
export function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
  if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }
  if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}

/**
 * Format duration in seconds to human-readable string.
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Truncate a string to a maximum length.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 3)}...`;
}

/**
 * Pad a string to a specific width.
 */
export function padRight(text: string, width: number): string {
  return text.padEnd(width);
}

export function padLeft(text: string, width: number): string {
  return text.padStart(width);
}

/**
 * Format workspace source for display.
 */
export function formatWorkspaceSource(source: WorkOrder['workspaceSource']): string {
  switch (source.type) {
    case 'local':
      return `local: ${source.path}`;
    case 'git': {
      const branch = source.branch ? ` (${source.branch})` : '';
      return `git: ${source.url}${branch}`;
    }
    case 'fresh': {
      const template = source.template ? ` [${source.template}]` : '';
      return `fresh: ${source.destPath}${template}`;
    }
  }
}

/**
 * Format a work order for detailed display.
 */
export function formatWorkOrderDetail(order: WorkOrder): string {
  const lines: string[] = [];

  lines.push(bold('Work Order Details'));
  lines.push('');
  lines.push(`${bold('ID:')}           ${order.id}`);
  lines.push(`${bold('Status:')}       ${formatStatus(order.status)}`);
  lines.push(`${bold('Created:')}      ${formatDate(order.createdAt)} (${dim(formatRelativeTime(order.createdAt))})`);

  if (order.completedAt) {
    lines.push(`${bold('Completed:')}    ${formatDate(order.completedAt)} (${dim(formatRelativeTime(order.completedAt))})`);
  }

  lines.push('');
  lines.push(bold('Task:'));
  lines.push(`  ${order.taskPrompt}`);

  lines.push('');
  lines.push(bold('Configuration:'));
  lines.push(`  ${dim('Workspace:')}    ${formatWorkspaceSource(order.workspaceSource)}`);
  lines.push(`  ${dim('Agent:')}        ${order.agentType}`);
  lines.push(`  ${dim('Max Iters:')}    ${order.maxIterations}`);
  lines.push(`  ${dim('Max Time:')}     ${formatDuration(order.maxWallClockSeconds)}`);
  lines.push(`  ${dim('Gate Plan:')}    ${order.gatePlanSource}`);

  lines.push('');
  lines.push(bold('Policies:'));
  lines.push(`  ${dim('Network:')}      ${order.policies.networkAllowed ? green('allowed') : red('blocked')}`);

  if (order.runId) {
    lines.push('');
    lines.push(`${bold('Run ID:')}       ${order.runId}`);
  }

  if (order.error) {
    lines.push('');
    lines.push(`${bold(red('Error:'))}`);
    lines.push(`  ${red(order.error)}`);
  }

  return lines.join('\n');
}

/**
 * Table column definition.
 */
interface TableColumn<T> {
  header: string;
  width: number;
  align?: 'left' | 'right';
  value: (item: T) => string;
}

/**
 * Format data as a table.
 */
export function formatTable<T>(items: T[], columns: TableColumn<T>[]): string {
  const lines: string[] = [];

  // Header row
  const headerRow = columns
    .map(col => {
      const header = col.align === 'right'
        ? padLeft(col.header, col.width)
        : padRight(col.header, col.width);
      return bold(header);
    })
    .join('  ');
  lines.push(headerRow);

  // Separator
  const separator = columns.map(col => '-'.repeat(col.width)).join('  ');
  lines.push(dim(separator));

  // Data rows
  for (const item of items) {
    const row = columns
      .map(col => {
        const value = truncate(col.value(item), col.width);
        return col.align === 'right'
          ? padLeft(value, col.width)
          : padRight(value, col.width);
      })
      .join('  ');
    lines.push(row);
  }

  return lines.join('\n');
}

/**
 * Format a list of work orders as a table.
 */
export function formatWorkOrderList(orders: WorkOrder[]): string {
  if (orders.length === 0) {
    return dim('No work orders found.');
  }

  const columns: TableColumn<WorkOrder>[] = [
    {
      header: 'ID',
      width: 12,
      value: o => o.id,
    },
    {
      header: 'STATUS',
      width: 10,
      value: o => formatStatus(o.status),
    },
    {
      header: 'CREATED',
      width: 16,
      value: o => formatRelativeTime(o.createdAt),
    },
    {
      header: 'AGENT',
      width: 12,
      value: o => o.agentType,
    },
    {
      header: 'TASK',
      width: 40,
      value: o => truncate(o.taskPrompt, 40),
    },
  ];

  return formatTable(orders, columns);
}

/**
 * Format success message.
 */
export function formatSuccess(message: string): string {
  return `${green('✓')} ${message}`;
}

/**
 * Format error message.
 */
export function formatError(message: string): string {
  return `${red('✗')} ${red(message)}`;
}

/**
 * Format warning message.
 */
export function formatWarning(message: string): string {
  return `${yellow('!')} ${yellow(message)}`;
}

/**
 * Format info message.
 */
export function formatInfo(message: string): string {
  return `${blue('i')} ${message}`;
}

/**
 * Format JSON output.
 */
export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Format work order as JSON (with Date serialization).
 */
export function formatWorkOrderJson(order: WorkOrder): string {
  return formatJson({
    ...order,
    createdAt: order.createdAt.toISOString(),
    completedAt: order.completedAt?.toISOString(),
  });
}

/**
 * Format work order list as JSON.
 */
export function formatWorkOrderListJson(orders: WorkOrder[]): string {
  return formatJson(
    orders.map(order => ({
      ...order,
      createdAt: order.createdAt.toISOString(),
      completedAt: order.completedAt?.toISOString(),
    }))
  );
}

/**
 * Print to stdout.
 */
export function print(text: string): void {
  // eslint-disable-next-line no-console -- CLI output function
  console.log(text);
}

/**
 * Print error to stderr.
 */
export function printError(text: string): void {
  // eslint-disable-next-line no-console -- CLI error output function
  console.error(text);
}

/**
 * Format and print validation errors.
 */
export function formatValidationErrors(
  errors: Array<{ path: string; message: string }>
): string {
  const lines = errors.map(e => {
    const path = e.path ? `${bold(e.path)}: ` : '';
    return `  ${red('•')} ${path}${e.message}`;
  });

  return [formatError('Validation failed:'), ...lines].join('\n');
}
