import React from 'react';
import { Box, Text, useInput } from 'ink';
import open from 'open';
import { VerificationSummary } from '../components/VerificationStatus.js';
import { formatDuration, truncate } from '../utils/format.js';
import type { Run } from '../api/types.js';

interface SuccessProps {
  run: Run;
  onDone: () => void;
}

export function Success({ run, onDone }: SuccessProps): React.ReactElement {
  useInput(async (input, key) => {
    if (key.return) {
      onDone();
      return;
    }

    if (input === 'o' && run.prUrl) {
      try {
        await open(run.prUrl);
      } catch {
        // Browser open failed
      }
    }
  });

  const taskPrompt = run.workOrder?.taskPrompt || '';
  const repoName =
    run.workOrder?.workspaceSource
      ? `${run.workOrder.workspaceSource.owner}/${run.workOrder.workspaceSource.repo}`
      : '';

  const duration = run.duration || 0;
  const filesChanged = run.filesChanged?.length || 0;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="green"
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
          <Text color="green" bold>
            SUCCESS
          </Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color="green">✓ Task completed</Text>
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

      {/* Stats */}
      <Box marginBottom={1} flexDirection="column">
        <Box>
          <Box width={16}>
            <Text color="gray">Duration</Text>
          </Box>
          <Text>{formatDuration(duration)}</Text>
        </Box>
        <Box>
          <Box width={16}>
            <Text color="gray">Iterations</Text>
          </Box>
          <Text>{run.iteration}</Text>
        </Box>
        <Box>
          <Box width={16}>
            <Text color="gray">Files changed</Text>
          </Box>
          <Text>{filesChanged}</Text>
        </Box>
      </Box>

      {/* Verification summary */}
      <Box marginBottom={1}>
        <Box width={16}>
          <Text color="gray">Verification</Text>
        </Box>
        <Text color="green">All passed</Text>
      </Box>
      <Box marginBottom={1} paddingLeft={2}>
        <VerificationSummary verification={run.verification || null} />
      </Box>

      {/* PR link */}
      {run.prUrl && (
        <>
          <Box marginTop={1}>
            <Text color="gray">Pull Request</Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="cyan">{run.prUrl}</Text>
          </Box>
        </>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Text color="gray">
          [Enter] Done{run.prUrl && '  [o] Open PR in browser'}
        </Text>
      </Box>
    </Box>
  );
}
