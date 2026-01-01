/**
 * EventCard component tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '../../../test/utils';
import { EventCard } from '../EventCard';
import type {
  AgentToolCallEvent,
  AgentToolResultEvent,
  AgentOutputEvent,
  FileChangedEvent,
  ProgressUpdateEvent,
  AgentErrorEvent,
} from '../../../types/agent-events';

describe('EventCard', () => {
  const baseTimestamp = '2024-01-15T10:30:00.000Z';

  beforeEach(() => {
    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('tool call events', () => {
    it('renders Read tool call with file path', () => {
      const event: AgentToolCallEvent = {
        type: 'agent_tool_call',
        workOrderId: 'wo-1',
        runId: 'run-1',
        toolUseId: 'toolu-1',
        tool: 'Read',
        input: { file_path: '/workspace/src/index.ts' },
        timestamp: baseTimestamp,
      };

      render(<EventCard event={event} />);

      expect(screen.getByText('Read')).toBeTruthy();
      expect(screen.getByText(/Reading \/workspace\/src\/index\.ts/)).toBeTruthy();
    });

    it('renders Bash tool call with command', () => {
      const event: AgentToolCallEvent = {
        type: 'agent_tool_call',
        workOrderId: 'wo-1',
        runId: 'run-1',
        toolUseId: 'toolu-2',
        tool: 'Bash',
        input: { command: 'npm install' },
        timestamp: baseTimestamp,
      };

      render(<EventCard event={event} />);

      expect(screen.getByText('Bash')).toBeTruthy();
      expect(screen.getByText('npm install')).toBeTruthy();
    });

    it('truncates long commands', () => {
      const longCommand = 'a'.repeat(100);
      const event: AgentToolCallEvent = {
        type: 'agent_tool_call',
        workOrderId: 'wo-1',
        runId: 'run-1',
        toolUseId: 'toolu-3',
        tool: 'Bash',
        input: { command: longCommand },
        timestamp: baseTimestamp,
      };

      render(<EventCard event={event} />);

      const displayedText = screen.getByText(/aaa/);
      expect(displayedText.textContent?.length).toBeLessThan(longCommand.length);
      expect(displayedText.textContent).toContain('...');
    });
  });

  describe('tool result events', () => {
    it('renders successful result', () => {
      const event: AgentToolResultEvent = {
        type: 'agent_tool_result',
        workOrderId: 'wo-1',
        runId: 'run-1',
        toolUseId: 'toolu-1',
        success: true,
        contentPreview: 'File contents here',
        contentLength: 18,
        durationMs: 42,
        timestamp: baseTimestamp,
      };

      render(<EventCard event={event} />);

      expect(screen.getByText('Success')).toBeTruthy();
      expect(screen.getByText('42ms')).toBeTruthy();
    });

    it('renders failed result with error styling', () => {
      const event: AgentToolResultEvent = {
        type: 'agent_tool_result',
        workOrderId: 'wo-1',
        runId: 'run-1',
        toolUseId: 'toolu-1',
        success: false,
        contentPreview: 'Error: File not found',
        contentLength: 21,
        durationMs: 5,
        timestamp: baseTimestamp,
      };

      render(<EventCard event={event} />);

      expect(screen.getByText('Error')).toBeTruthy();
    });
  });

  describe('agent output events', () => {
    it('renders output text', () => {
      const event: AgentOutputEvent = {
        type: 'agent_output',
        workOrderId: 'wo-1',
        runId: 'run-1',
        content: 'I will help you implement this feature.',
        timestamp: baseTimestamp,
      };

      render(<EventCard event={event} />);

      expect(screen.getByText('Output')).toBeTruthy();
      expect(screen.getByText(/I will help you implement this feature/)).toBeTruthy();
    });
  });

  describe('file changed events', () => {
    it('renders file created event', () => {
      const event: FileChangedEvent = {
        type: 'file_changed',
        workOrderId: 'wo-1',
        runId: 'run-1',
        path: '/workspace/src/new-file.ts',
        action: 'created',
        timestamp: baseTimestamp,
      };

      render(<EventCard event={event} />);

      expect(screen.getByText('Created')).toBeTruthy();
      expect(screen.getByText('/workspace/src/new-file.ts')).toBeTruthy();
    });

    it('renders file modified event', () => {
      const event: FileChangedEvent = {
        type: 'file_changed',
        workOrderId: 'wo-1',
        runId: 'run-1',
        path: '/workspace/src/index.ts',
        action: 'modified',
        timestamp: baseTimestamp,
      };

      render(<EventCard event={event} />);

      expect(screen.getByText('Modified')).toBeTruthy();
    });

    it('renders file deleted event', () => {
      const event: FileChangedEvent = {
        type: 'file_changed',
        workOrderId: 'wo-1',
        runId: 'run-1',
        path: '/workspace/src/old-file.ts',
        action: 'deleted',
        timestamp: baseTimestamp,
      };

      render(<EventCard event={event} />);

      expect(screen.getByText('Deleted')).toBeTruthy();
    });
  });

  describe('progress update events', () => {
    it('renders progress with percentage', () => {
      const event: ProgressUpdateEvent = {
        type: 'progress_update',
        workOrderId: 'wo-1',
        runId: 'run-1',
        percentage: 45,
        currentPhase: 'Reading files',
        toolCallCount: 10,
        elapsedSeconds: 30,
        timestamp: baseTimestamp,
      };

      render(<EventCard event={event} />);

      expect(screen.getByText('Progress')).toBeTruthy();
      expect(screen.getByText('45% - Reading files')).toBeTruthy();
    });
  });

  describe('error events', () => {
    it('renders error message', () => {
      const event: AgentErrorEvent = {
        type: 'agent_error',
        workOrderId: 'wo-1',
        runId: 'run-1',
        message: 'Something went wrong',
        timestamp: baseTimestamp,
      };

      render(<EventCard event={event} />);

      expect(screen.getByText('Error')).toBeTruthy();
      expect(screen.getByText('Something went wrong')).toBeTruthy();
    });
  });

  describe('expand/collapse behavior', () => {
    it('expands on click for events with details', () => {
      const event: AgentToolCallEvent = {
        type: 'agent_tool_call',
        workOrderId: 'wo-1',
        runId: 'run-1',
        toolUseId: 'toolu-1',
        tool: 'Read',
        input: { file_path: '/workspace/file.ts' },
        timestamp: baseTimestamp,
      };

      render(<EventCard event={event} />);

      // Click to expand
      fireEvent.click(screen.getByText(/Reading/));

      // Should show the JSON input
      expect(screen.getByText(/"file_path"/)).toBeTruthy();
    });
  });

  describe('copy functionality', () => {
    it('copies content to clipboard', async () => {
      const event: AgentToolCallEvent = {
        type: 'agent_tool_call',
        workOrderId: 'wo-1',
        runId: 'run-1',
        toolUseId: 'toolu-1',
        tool: 'Read',
        input: { file_path: '/workspace/file.ts' },
        timestamp: baseTimestamp,
      };

      render(<EventCard event={event} />);

      // Expand first
      fireEvent.click(screen.getByText(/Reading/));

      // Click copy button
      const copyButton = screen.getByTitle('Copy to clipboard');
      fireEvent.click(copyButton);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('file_path')
      );
    });
  });
});
