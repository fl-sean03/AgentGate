import React from 'react';
import { Box, Text, useInput } from 'ink';
import open from 'open';
import { VerificationSummary } from '../components/VerificationStatus.js';
import { formatDuration, formatDateTime, truncate } from '../utils/format.js';
import { getRunStatusColor } from '../utils/colors.js';
import type { Run } from '../api/types.js';

interface RunDetailProps {
  run: Run;
  onBack: () => void;
}

export function RunDetail({ run, onBack }: RunDetailProps): React.ReactElement {
  useInput(async (input, key) => {
    if (key.escape) {
      onBack();
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
      : 'Unknown';

  const statusColor = getRunStatusColor(run.status);
  const statusLabel = run.status.charAt(0).toUpperCase() + run.status.slice(1);

  const getStatusIcon = (): string => {
    switch (run.status) {
      case 'succeeded':
        return '✓';
      case 'failed':
        return '✗';
      case 'canceled':
        return '○';
      default:
        return '●';
    }
  };

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
            Run Details
          </Text>
        </Box>
        <Box>
          <Text>{statusColor(`${getStatusIcon()} ${statusLabel}`)}</Text>
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

      {/* Details */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Box width={16}>
            <Text color="gray">Status</Text>
          </Box>
          <Text>{statusColor(statusLabel)}</Text>
        </Box>
        <Box>
          <Box width={16}>
            <Text color="gray">Started</Text>
          </Box>
          <Text>{formatDateTime(run.startedAt)}</Text>
        </Box>
        {run.completedAt && (
          <Box>
            <Box width={16}>
              <Text color="gray">Completed</Text>
            </Box>
            <Text>{formatDateTime(run.completedAt)}</Text>
          </Box>
        )}
        <Box>
          <Box width={16}>
            <Text color="gray">Duration</Text>
          </Box>
          <Text>{formatDuration(run.duration || 0)}</Text>
        </Box>
        <Box>
          <Box width={16}>
            <Text color="gray">Iterations</Text>
          </Box>
          <Text>{run.iteration}</Text>
        </Box>
      </Box>

      {/* Files changed */}
      {run.filesChanged && run.filesChanged.length > 0 && (
        <>
          <Box marginTop={1}>
            <Text color="gray">Files Changed</Text>
          </Box>
          <Box flexDirection="column" marginBottom={1} paddingLeft={2}>
            {run.filesChanged.slice(0, 5).map((file, index) => (
              <Text key={index}>{file}</Text>
            ))}
            {run.filesChanged.length > 5 && (
              <Text color="gray">
                ...and {run.filesChanged.length - 5} more
              </Text>
            )}
          </Box>
        </>
      )}

      {/* Verification summary */}
      {run.verification && (
        <>
          <Box marginTop={1}>
            <Text color="gray">Verification</Text>
          </Box>
          <Box paddingLeft={2} marginBottom={1}>
            <VerificationSummary verification={run.verification} />
          </Box>
        </>
      )}

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

      {/* Error details */}
      {run.error && (
        <>
          <Box marginTop={1}>
            <Text color="red">Error</Text>
          </Box>
          <Box paddingLeft={2} marginBottom={1}>
            <Text>{run.error.message}</Text>
          </Box>
        </>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Text color="gray">
          {run.prUrl && '[o] Open PR  '}[Esc] Back
        </Text>
      </Box>
    </Box>
  );
}
