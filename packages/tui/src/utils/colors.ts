import chalk, { ChalkInstance } from 'chalk';

// Theme colors
export const colors = {
  // Brand
  primary: chalk.hex('#14B8A6'), // Teal
  accent: chalk.hex('#8B5CF6'), // Purple

  // Status
  success: chalk.hex('#22C55E'), // Green
  error: chalk.hex('#EF4444'), // Red
  warning: chalk.hex('#EAB308'), // Yellow
  info: chalk.hex('#06B6D4'), // Cyan

  // Text
  text: chalk.hex('#F8FAFC'), // White
  textDim: chalk.hex('#94A3B8'), // Gray
  textMuted: chalk.hex('#64748B'), // Darker gray

  // Borders
  border: chalk.hex('#334155'), // Slate
  borderDim: chalk.hex('#1E293B'), // Darker slate

  // Tool colors
  toolRead: chalk.hex('#06B6D4'), // Cyan
  toolEdit: chalk.hex('#F97316'), // Orange
  toolWrite: chalk.hex('#22C55E'), // Green
  toolBash: chalk.hex('#A855F7'), // Magenta
  toolError: chalk.hex('#EF4444'), // Red
};

// Status indicators
export const statusIndicator = {
  running: '●',
  passed: '✓',
  failed: '✗',
  waiting: '○',
  canceled: '○',
};

// Colored status indicators
export function getStatusIndicator(
  status: 'running' | 'passed' | 'failed' | 'waiting' | 'canceled'
): string {
  switch (status) {
    case 'running':
      return colors.warning(statusIndicator.running);
    case 'passed':
      return colors.success(statusIndicator.passed);
    case 'failed':
      return colors.error(statusIndicator.failed);
    case 'waiting':
      return colors.textMuted(statusIndicator.waiting);
    case 'canceled':
      return colors.textMuted(statusIndicator.canceled);
  }
}

// Tool type to color mapping
export function getToolColor(tool: string): ChalkInstance {
  switch (tool.toLowerCase()) {
    case 'read':
    case 'glob':
    case 'grep':
      return colors.toolRead;
    case 'edit':
      return colors.toolEdit;
    case 'write':
      return colors.toolWrite;
    case 'bash':
    case 'task':
      return colors.toolBash;
    default:
      return colors.text;
  }
}

// Run status to color mapping
export function getRunStatusColor(
  status: string
): ChalkInstance {
  switch (status) {
    case 'succeeded':
      return colors.success;
    case 'failed':
      return colors.error;
    case 'canceled':
      return colors.textDim;
    case 'running':
    case 'verifying':
    case 'building':
      return colors.warning;
    default:
      return colors.textMuted;
  }
}
