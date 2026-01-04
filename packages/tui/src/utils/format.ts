// Format duration in seconds to human readable
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);

  if (minutes < 60) {
    return remainingSeconds > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0
    ? `${hours}h ${remainingMinutes}m`
    : `${hours}h`;
}

// Format relative time (e.g., "2h ago", "3d ago")
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffSeconds < 60) {
    return 'just now';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  if (diffWeeks < 4) {
    return `${diffWeeks}w ago`;
  }

  // For older dates, show the date
  return date.toLocaleDateString();
}

// Format date for display (e.g., "Today at 2:34 PM")
export function formatDateTime(date: Date): string {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const timeStr = date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  if (isToday) {
    return `Today at ${timeStr}`;
  }

  if (isYesterday) {
    return `Yesterday at ${timeStr}`;
  }

  return `${date.toLocaleDateString()} at ${timeStr}`;
}

// Truncate text with ellipsis
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 1) + '…';
}

// Truncate path, keeping filename visible
export function truncatePath(path: string, maxLength: number): string {
  if (path.length <= maxLength) {
    return path;
  }

  const parts = path.split('/');
  const filename = parts.pop() || '';

  if (filename.length >= maxLength - 3) {
    return '…' + filename.slice(-(maxLength - 1));
  }

  let result = filename;
  let remainingLength = maxLength - filename.length - 4; // account for "…/"

  // Add path components from the end
  for (let i = parts.length - 1; i >= 0 && remainingLength > 0; i--) {
    const part = parts[i];
    if (part && part.length + 1 <= remainingLength) {
      result = part + '/' + result;
      remainingLength -= part.length + 1;
    } else {
      result = '…/' + result;
      break;
    }
  }

  return result;
}

// Format file size
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// Format percentage
export function formatPercent(value: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}
