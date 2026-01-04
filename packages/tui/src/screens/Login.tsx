import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAuth } from '../hooks/useAuth.js';
import { Spinner } from '../components/Spinner.js';

interface LoginProps {
  onLogin: () => void;
}

export function Login({ onLogin }: LoginProps): React.ReactElement {
  const { isLoading, error, startAuth } = useAuth();
  const [hasStarted, setHasStarted] = useState(false);

  useInput(async (input, key) => {
    if (key.return && !hasStarted && !isLoading) {
      setHasStarted(true);
      try {
        await startAuth();
        onLogin();
      } catch {
        setHasStarted(false);
      }
    }

    if (input === 'r' && error) {
      setHasStarted(false);
    }
  });

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      borderStyle="round"
      borderColor="cyan"
      padding={2}
      minHeight={16}
    >
      {/* Logo / Title */}
      <Box marginBottom={2}>
        <Text bold color="cyan">
          AgentGate
        </Text>
      </Box>

      {/* Welcome message */}
      {!hasStarted && !error && (
        <>
          <Box marginBottom={1}>
            <Text>Welcome to AgentGate</Text>
          </Box>
          <Box marginBottom={2}>
            <Text color="gray">
              AI-powered code changes, verified & delivered
            </Text>
          </Box>
          <Box marginBottom={2}>
            <Text>Press </Text>
            <Text color="cyan">Enter</Text>
            <Text> to login</Text>
          </Box>
          <Box>
            <Text color="gray">(Opens browser for authentication)</Text>
          </Box>
        </>
      )}

      {/* Loading state */}
      {isLoading && hasStarted && (
        <>
          <Box marginBottom={2}>
            <Spinner label="Waiting for authentication..." color="primary" />
          </Box>
          <Box>
            <Text color="gray">Complete login in your browser to continue</Text>
          </Box>
        </>
      )}

      {/* Error state */}
      {error && (
        <>
          <Box marginBottom={1}>
            <Text color="red">Authentication failed</Text>
          </Box>
          <Box marginBottom={2}>
            <Text color="gray">{error}</Text>
          </Box>
          <Box>
            <Text color="gray">[r] Retry  [q] Quit</Text>
          </Box>
        </>
      )}
    </Box>
  );
}
