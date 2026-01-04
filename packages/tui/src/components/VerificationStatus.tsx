import React from 'react';
import { Box, Text } from 'ink';
import { colors, getStatusIndicator } from '../utils/colors.js';
import { Spinner } from './Spinner.js';
import type { VerificationResult } from '../api/types.js';

interface VerificationStatusProps {
  verification: VerificationResult | null;
  currentLevel: 'L0' | 'L1' | 'L2' | 'L3' | null;
  progress?: {
    current: number;
    total: number;
  };
}

const LEVELS = [
  { key: 'L0' as const, name: 'Contracts', description: 'Lint, types, files' },
  { key: 'L1' as const, name: 'Tests', description: 'Unit tests' },
  { key: 'L2' as const, name: 'Integration', description: 'E2E tests' },
  { key: 'L3' as const, name: 'Build', description: 'Build & sanity' },
] as const;

export function VerificationStatus({
  verification,
  currentLevel,
  progress,
}: VerificationStatusProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      {LEVELS.map((level) => {
        const result = verification?.[level.key];
        const isCurrentLevel = currentLevel === level.key;

        let status: 'running' | 'passed' | 'failed' | 'waiting' = 'waiting';
        if (result?.status === 'passed') {
          status = 'passed';
        } else if (result?.status === 'failed') {
          status = 'failed';
        } else if (isCurrentLevel) {
          status = 'running';
        }

        return (
          <Box key={level.key} paddingY={0}>
            <Box width={3}>
              {status === 'running' ? (
                <Spinner color="warning" />
              ) : (
                <Text>{getStatusIndicator(status)}</Text>
              )}
            </Box>

            <Box width={16}>
              <Text
                color={
                  status === 'passed'
                    ? 'green'
                    : status === 'failed'
                      ? 'red'
                      : status === 'running'
                        ? 'yellow'
                        : 'gray'
                }
              >
                {level.key} {level.name}
              </Text>
            </Box>

            <Box flexGrow={1}>
              <Text color="gray">
                {status === 'passed' && 'Passed'}
                {status === 'failed' && 'Failed'}
                {status === 'waiting' && 'Waiting'}
                {status === 'running' && (
                  <>
                    Running
                    {progress && ` (${progress.current}/${progress.total})`}
                  </>
                )}
              </Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

// Compact inline version for success screen
export function VerificationSummary({
  verification,
}: {
  verification: VerificationResult | null;
}): React.ReactElement {
  return (
    <Box>
      {LEVELS.map((level, index) => {
        const result = verification?.[level.key];
        const passed = result?.status === 'passed';
        const failed = result?.status === 'failed';

        return (
          <React.Fragment key={level.key}>
            {index > 0 && <Text color="gray"> </Text>}
            <Text color={passed ? 'green' : failed ? 'red' : 'gray'}>
              {level.key} {passed ? '✓' : failed ? '✗' : '○'}
            </Text>
          </React.Fragment>
        );
      })}
    </Box>
  );
}
