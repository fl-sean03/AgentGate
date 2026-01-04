import React, { useState, useEffect } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { useAuth } from './hooks/useAuth.js';
import { useAppStore } from './store/app.js';
import { Login } from './screens/Login.js';
import { Home } from './screens/Home.js';
import { TaskInput } from './screens/TaskInput.js';
import { Running } from './screens/Running.js';
import { Verifying } from './screens/Verifying.js';
import { Success } from './screens/Success.js';
import { Failure } from './screens/Failure.js';
import { Canceled } from './screens/Canceled.js';
import { RunsList } from './screens/RunsList.js';
import { RunDetail } from './screens/RunDetail.js';
import { HelpOverlay } from './components/HelpOverlay.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import type { Repository, Run } from './api/types.js';

export type Screen =
  | 'login'
  | 'home'
  | 'task'
  | 'running'
  | 'verifying'
  | 'success'
  | 'failure'
  | 'canceled'
  | 'runs'
  | 'run-detail';

interface AppProps {
  initialScreen?: Screen;
  initialRepo?: string;
  apiUrl?: string;
  token?: string;
}

export function App({
  initialScreen = 'home',
  initialRepo,
  apiUrl,
  token,
}: AppProps): React.ReactElement {
  const { exit } = useApp();
  const { isAuthenticated, isLoading: authLoading } = useAuth(apiUrl, token);

  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [activeRun, setActiveRun] = useState<Run | null>(null);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const { activeRunId, setActiveRunId } = useAppStore();

  // Determine initial screen based on auth state
  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated) {
        setScreen('login');
      } else if (initialRepo) {
        // Parse repo string and set selectedRepo
        const [owner, name] = initialRepo.split('/');
        if (owner && name) {
          setSelectedRepo({
            fullName: initialRepo,
            owner,
            name,
            description: null,
            pushedAt: new Date(),
            private: false,
          });
          setScreen('task');
        }
      }
    }
  }, [authLoading, isAuthenticated, initialRepo]);

  // Global keyboard shortcuts
  useInput((input, key) => {
    if (input === '?') {
      setShowHelp(!showHelp);
      return;
    }

    if (key.escape && showHelp) {
      setShowHelp(false);
      return;
    }

    // Global quit (only when not in middle of run)
    if (input === 'q' && !['running', 'verifying'].includes(screen)) {
      exit();
    }
  });

  // Screen handlers
  const handleLogin = () => {
    setScreen('home');
  };

  const handleSelectRepo = (repo: Repository) => {
    setSelectedRepo(repo);
    setScreen('task');
  };

  const handleSubmitTask = (workOrderId: string) => {
    setActiveRunId(workOrderId);
    setScreen('running');
  };

  const handleRunComplete = (run: Run) => {
    setActiveRun(run);
    if (run.status === 'succeeded') {
      setScreen('success');
    } else if (run.status === 'failed') {
      setScreen('failure');
    } else if (run.status === 'canceled') {
      setScreen('canceled');
    }
    setActiveRunId(null);
  };

  const handleVerifying = () => {
    setScreen('verifying');
  };

  const handleBack = () => {
    switch (screen) {
      case 'task':
        setSelectedRepo(null);
        setScreen('home');
        break;
      case 'runs':
        setScreen('home');
        break;
      case 'run-detail':
        setSelectedRun(null);
        setScreen('runs');
        break;
      case 'success':
      case 'failure':
      case 'canceled':
        setActiveRun(null);
        setScreen('home');
        break;
      default:
        setScreen('home');
    }
  };

  const handleViewRuns = () => {
    setScreen('runs');
  };

  const handleSelectRun = (run: Run) => {
    setSelectedRun(run);
    setScreen('run-detail');
  };

  const handleDetach = () => {
    // Return to home but keep run in background
    setScreen('home');
  };

  const handleViewRunning = () => {
    if (activeRunId) {
      setScreen('running');
    }
  };

  const handleRetry = () => {
    if (selectedRepo) {
      setScreen('task');
    }
  };

  // Render loading state
  if (authLoading) {
    return (
      <Box
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        padding={2}
      >
        <Text>Loading...</Text>
      </Box>
    );
  }

  // Render current screen
  const renderScreen = () => {
    switch (screen) {
      case 'login':
        return <Login onLogin={handleLogin} />;

      case 'home':
        return (
          <Home
            onSelectRepo={handleSelectRepo}
            onViewRuns={handleViewRuns}
            onViewRunning={handleViewRunning}
            activeRunId={activeRunId}
          />
        );

      case 'task':
        return selectedRepo ? (
          <TaskInput
            repo={selectedRepo}
            onSubmit={handleSubmitTask}
            onBack={handleBack}
          />
        ) : null;

      case 'running':
        return activeRunId ? (
          <Running
            workOrderId={activeRunId}
            onComplete={handleRunComplete}
            onVerifying={handleVerifying}
            onDetach={handleDetach}
          />
        ) : null;

      case 'verifying':
        return activeRunId ? (
          <Verifying
            workOrderId={activeRunId}
            onComplete={handleRunComplete}
          />
        ) : null;

      case 'success':
        return activeRun ? (
          <Success run={activeRun} onDone={handleBack} />
        ) : null;

      case 'failure':
        return activeRun ? (
          <Failure run={activeRun} onDone={handleBack} onRetry={handleRetry} />
        ) : null;

      case 'canceled':
        return activeRun ? (
          <Canceled run={activeRun} onDone={handleBack} />
        ) : null;

      case 'runs':
        return (
          <RunsList onSelectRun={handleSelectRun} onBack={handleBack} />
        );

      case 'run-detail':
        return selectedRun ? (
          <RunDetail run={selectedRun} onBack={handleBack} />
        ) : null;

      default:
        return <Text>Unknown screen</Text>;
    }
  };

  return (
    <ErrorBoundary>
      <Box flexDirection="column" width="100%">
        {renderScreen()}
        {showHelp && (
          <HelpOverlay
            currentScreen={screen}
            onClose={() => setShowHelp(false)}
          />
        )}
      </Box>
    </ErrorBoundary>
  );
}
