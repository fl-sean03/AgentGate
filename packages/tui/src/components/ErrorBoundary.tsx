import React, { Component, type ReactNode } from 'react';
import { Box, Text, useInput } from 'ink';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('TUI Error:', error, errorInfo);
  }

  resetError = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <ErrorDisplay
          error={this.state.error}
          onRetry={this.resetError}
        />
      );
    }

    return this.props.children;
  }
}

interface ErrorDisplayProps {
  error: Error | null;
  onRetry: () => void;
}

function ErrorDisplay({ error, onRetry }: ErrorDisplayProps): React.ReactElement {
  useInput((input, key) => {
    if (input === 'r') {
      onRetry();
    }
    if (input === 'q') {
      process.exit(1);
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="red"
      padding={2}
    >
      <Box marginBottom={1}>
        <Text bold color="red">
          Something went wrong
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="gray">
          {error?.message || 'An unexpected error occurred'}
        </Text>
      </Box>

      {process.env['NODE_ENV'] === 'development' && error?.stack && (
        <Box marginBottom={1} flexDirection="column">
          <Text color="gray" dimColor>
            Stack trace:
          </Text>
          <Text color="gray" dimColor wrap="truncate-end">
            {error.stack.split('\n').slice(1, 5).join('\n')}
          </Text>
        </Box>
      )}

      <Box>
        <Text color="gray">[r] Retry  [q] Quit</Text>
      </Box>
    </Box>
  );
}

// Hook version for functional components
interface UseErrorHandlerResult {
  error: Error | null;
  setError: (error: Error | null) => void;
  clearError: () => void;
  handleError: (error: unknown) => void;
}

export function useErrorHandler(): UseErrorHandlerResult {
  const [error, setError] = React.useState<Error | null>(null);

  const clearError = React.useCallback(() => {
    setError(null);
  }, []);

  const handleError = React.useCallback((err: unknown) => {
    if (err instanceof Error) {
      setError(err);
    } else {
      setError(new Error(String(err)));
    }
  }, []);

  return { error, setError, clearError, handleError };
}
