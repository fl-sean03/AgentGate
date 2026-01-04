import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { useRun } from '../hooks/useRun.js';
import { ActivityLog } from '../components/ActivityLog.js';
import { Spinner } from '../components/Spinner.js';
import { formatDuration, truncate } from '../utils/format.js';
import type { Run } from '../api/types.js';

interface RunningProps {
  workOrderId: string;
  onComplete: (run: Run) => void;
  onVerifying: () => void;
  onDetach: () => void;
}

export function Running({
  workOrderId,
  onComplete,
  onVerifying,
  onDetach,
}: RunningProps): React.ReactElement {
  const { run, activities, isConnected, isLoading, error, cancel } = useRun(workOrderId);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(false);

  // Track elapsed time
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Handle state transitions
  useEffect(() => {
    if (!run) return;

    if (run.status === 'verifying') {
      onVerifying();
    } else if (
      run.status === 'succeeded' ||
      run.status === 'failed' ||
      run.status === 'canceled'
    ) {
      onComplete(run);
    }
  }, [run, onComplete, onVerifying]);

  useInput((input, key) => {
    if (confirmCancel) {
      if (input === 'y') {
        cancel();
        setConfirmCancel(false);
      } else {
        setConfirmCancel(false);
      }
      return;
    }

    if (input === 'c') {
      setConfirmCancel(true);
      return;
    }

    if (input === 'd') {
      onDetach();
      return;
    }
  });

  const taskPrompt = run?.workOrder?.taskPrompt || 'Loading...';
  const repoName =
    run?.workOrder?.workspaceSource
      ? `${run.workOrder.workspaceSource.owner}/${run.workOrder.workspaceSource.repo}`
      : 'Loading...';

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      padding={1}
    >
      {/* Header */}
      <Box justifyContent="space-between">
        <Box>
          <Text bold color="cyan">
            AgentGate
          </Text>
        </Box>
        <Box>
          <Text color="gray">
            iter {run?.iteration || 1} · {formatDuration(elapsedSeconds)}
          </Text>
        </Box>
      </Box>

      {/* Repository and task */}
      <Box marginTop={1}>
        <Text color="cyan">{repoName}</Text>
      </Box>
      <Box marginBottom={1}>
        <Text color="gray">{truncate(taskPrompt, 60)}</Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="gray">───────────────────────────────────────────</Text>
      </Box>

      {/* Activity log */}
      {isLoading ? (
        <Box paddingY={2}>
          <Spinner label="Connecting to agent..." />
        </Box>
      ) : error ? (
        <Box paddingY={2}>
          <Text color="red">{error}</Text>
        </Box>
      ) : (
        <ActivityLog activities={activities} />
      )}

      {/* Status */}
      <Box marginTop={1}>
        {isConnected ? (
          <Spinner label="Agent working..." color="warning" />
        ) : (
          <Text color="gray">Connecting...</Text>
        )}
      </Box>

      {/* Cancel confirmation */}
      {confirmCancel && (
        <Box marginTop={1}>
          <Text color="yellow">Cancel this task? [y/n]</Text>
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Text color="gray">[c] Cancel  [d] Detach</Text>
      </Box>
    </Box>
  );
}
