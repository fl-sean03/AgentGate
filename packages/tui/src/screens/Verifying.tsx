import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { useRun } from '../hooks/useRun.js';
import { VerificationStatus } from '../components/VerificationStatus.js';
import { formatDuration, truncate } from '../utils/format.js';
import type { Run } from '../api/types.js';

interface VerifyingProps {
  workOrderId: string;
  onComplete: (run: Run) => void;
}

export function Verifying({
  workOrderId,
  onComplete,
}: VerifyingProps): React.ReactElement {
  const {
    run,
    verification,
    currentVerificationLevel,
    isLoading,
    error,
    cancel,
  } = useRun(workOrderId);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(false);

  // Track elapsed time
  useEffect(() => {
    if (run?.startedAt) {
      const startTime = new Date(run.startedAt).getTime();
      const now = Date.now();
      setElapsedSeconds(Math.floor((now - startTime) / 1000));
    }

    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [run?.startedAt]);

  // Handle state transitions
  useEffect(() => {
    if (!run) return;

    if (
      run.status === 'succeeded' ||
      run.status === 'failed' ||
      run.status === 'canceled'
    ) {
      onComplete(run);
    }
  }, [run, onComplete]);

  useInput((input) => {
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

      {/* Status message */}
      <Box marginBottom={1}>
        <Text>Agent completed. Verifying changes...</Text>
      </Box>

      {/* Verification progress */}
      {isLoading ? (
        <Box paddingY={2}>
          <Text color="gray">Loading verification status...</Text>
        </Box>
      ) : error ? (
        <Box paddingY={2}>
          <Text color="red">{error}</Text>
        </Box>
      ) : (
        <VerificationStatus
          verification={verification}
          currentLevel={currentVerificationLevel}
        />
      )}

      {/* Spacer */}
      <Box flexGrow={1} />

      {/* Cancel confirmation */}
      {confirmCancel && (
        <Box marginTop={1}>
          <Text color="yellow">Cancel this task? [y/n]</Text>
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Text color="gray">[c] Cancel</Text>
      </Box>
    </Box>
  );
}
