/**
 * FilesTab - Display file changes
 */

import { useMemo } from 'react';
import { FilePlus, FileEdit, Trash2, Folder, FileIcon } from 'lucide-react';
import type { FileChange, FileChangeAction } from '../../types/agent-events';

export interface FilesTabProps {
  files: FileChange[];
  className?: string;
}

interface FilesByDirectory {
  [directory: string]: FileChange[];
}

function getActionIcon(action: FileChangeAction): React.ReactNode {
  switch (action) {
    case 'created':
      return <FilePlus className="w-4 h-4 text-green-600" />;
    case 'modified':
      return <FileEdit className="w-4 h-4 text-yellow-600" />;
    case 'deleted':
      return <Trash2 className="w-4 h-4 text-red-600" />;
  }
}

function getActionColor(action: FileChangeAction): { bg: string; text: string; border: string } {
  switch (action) {
    case 'created':
      return { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' };
    case 'modified':
      return { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' };
    case 'deleted':
      return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' };
  }
}

function formatSize(bytes?: number): string {
  if (bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getDirectory(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  if (lastSlash === -1) return '/';
  return path.slice(0, lastSlash) || '/';
}

function getFileName(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  if (lastSlash === -1) return path;
  return path.slice(lastSlash + 1);
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function FilesTab({ files, className = '' }: FilesTabProps) {
  // Group files by directory
  const filesByDirectory = useMemo(() => {
    const grouped: FilesByDirectory = {};
    for (const file of files) {
      const dir = getDirectory(file.path);
      if (!grouped[dir]) {
        grouped[dir] = [];
      }
      grouped[dir].push(file);
    }
    // Sort directories
    const sorted: FilesByDirectory = {};
    Object.keys(grouped)
      .sort()
      .forEach((key) => {
        sorted[key] = grouped[key];
      });
    return sorted;
  }, [files]);

  // Stats
  const stats = useMemo(() => {
    const created = files.filter((f) => f.action === 'created').length;
    const modified = files.filter((f) => f.action === 'modified').length;
    const deleted = files.filter((f) => f.action === 'deleted').length;
    return { total: files.length, created, modified, deleted };
  }, [files]);

  if (files.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-12 text-gray-500 ${className}`}>
        <FileIcon className="w-8 h-8 text-gray-300 mb-2" />
        <p className="text-sm">No file changes yet</p>
        <p className="text-xs mt-1">Files created, modified, or deleted will appear here</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Stats */}
      <div className="flex items-center gap-4 text-xs mb-4">
        <span className="text-gray-600">Total: {stats.total}</span>
        <span className="text-green-600">Created: {stats.created}</span>
        <span className="text-yellow-600">Modified: {stats.modified}</span>
        <span className="text-red-600">Deleted: {stats.deleted}</span>
      </div>

      {/* File tree */}
      <div className="flex-1 overflow-y-auto max-h-[500px] space-y-4">
        {Object.entries(filesByDirectory).map(([directory, dirFiles]) => (
          <div key={directory} className="rounded-lg border border-gray-200 overflow-hidden">
            {/* Directory header */}
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
              <Folder className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700 font-mono">{directory}</span>
              <span className="text-xs text-gray-500">({dirFiles.length} files)</span>
            </div>

            {/* Files in directory */}
            <div className="divide-y divide-gray-100">
              {dirFiles.map((file) => {
                const colors = getActionColor(file.action);
                return (
                  <div
                    key={file.path}
                    className={`flex items-center gap-3 px-3 py-2 ${colors.bg}`}
                  >
                    {/* Action icon */}
                    {getActionIcon(file.action)}

                    {/* File name */}
                    <span className="flex-1 text-sm font-mono text-gray-700 truncate">
                      {getFileName(file.path)}
                    </span>

                    {/* Action badge */}
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${colors.bg} ${colors.text} border ${colors.border}`}
                    >
                      {file.action}
                    </span>

                    {/* Size */}
                    {file.sizeBytes !== undefined && (
                      <span className="text-xs text-gray-500 w-16 text-right">
                        {formatSize(file.sizeBytes)}
                      </span>
                    )}

                    {/* Time */}
                    <span className="text-xs text-gray-500">{formatTime(file.timestamp)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
