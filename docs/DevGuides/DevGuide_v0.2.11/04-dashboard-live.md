# 04: Dashboard Live View

## Thrust 5: Live Activity Panel

### 5.1 Objective

Create a React component that displays real-time agent activity as events stream in.

### 5.2 Background

The dashboard currently shows work order status but not real-time activity. We need a panel that:
- Connects to WebSocket
- Subscribes to work order events
- Displays events in a scrolling feed
- Updates in real-time

### 5.3 Subtasks

#### 5.3.1 Create useWebSocket Hook

Create `packages/dashboard/src/hooks/useWebSocket.ts`:

**Functionality:**
- Connect to server WebSocket endpoint
- Handle reconnection with exponential backoff
- Parse incoming messages
- Expose connection status
- Provide send function

**Interface:**
```typescript
interface UseWebSocketResult {
  isConnected: boolean;
  lastMessage: ServerMessage | null;
  send: (message: ClientMessage) => void;
  reconnect: () => void;
}
```

#### 5.3.2 Create useRunStream Hook

Create `packages/dashboard/src/hooks/useRunStream.ts`:

**Functionality:**
- Uses useWebSocket internally
- Subscribes to specific work order
- Maintains event history (limited size)
- Provides event stream state

**Interface:**
```typescript
interface UseRunStreamResult {
  events: AgentEvent[];
  isSubscribed: boolean;
  isConnected: boolean;
  subscribe: (workOrderId: string) => void;
  unsubscribe: () => void;
  clearEvents: () => void;
}
```

#### 5.3.3 Create AgentActivityPanel Component

Create `packages/dashboard/src/components/AgentActivityPanel.tsx`:

**Features:**
- Virtualized list for performance (use react-window or similar)
- Auto-scroll to bottom (with pause on scroll up)
- Color-coded events by type:
  - 📖 Blue for Read
  - ✏️ Green for Write/Edit
  - ⚡ Yellow for Bash
  - 🔍 Purple for Grep/Glob
  - 💬 Gray for Output
  - ❌ Red for Errors
- Collapsible event details
- Timestamp display
- Connection status indicator

**Props:**
```typescript
interface AgentActivityPanelProps {
  workOrderId: string;
  maxEvents?: number; // Default 500
  autoScroll?: boolean; // Default true
}
```

#### 5.3.4 Create EventCard Component

Create `packages/dashboard/src/components/EventCard.tsx`:

**Features:**
- Renders single event
- Shows icon, summary, timestamp
- Expandable for full details
- Copy button for content
- Different styling per event type

#### 5.3.5 Integrate into WorkOrderDetail

Modify `WorkOrderDetail.tsx` to include AgentActivityPanel:

**Changes:**
- Add "Live Activity" tab or section
- Show panel when work order is running
- Hide or show "completed" state when done

### 5.4 Verification Steps

1. Run `pnpm typecheck` - no errors in dashboard
2. Run `pnpm lint` - no warnings
3. Start dashboard, open work order detail
4. Submit a work order via API
5. Verify live activity panel shows events
6. Verify auto-scroll works
7. Verify expand/collapse works
8. Verify connection status shows correctly

### 5.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/dashboard/src/hooks/useWebSocket.ts` | Created |
| `packages/dashboard/src/hooks/useRunStream.ts` | Created |
| `packages/dashboard/src/components/AgentActivityPanel.tsx` | Created |
| `packages/dashboard/src/components/EventCard.tsx` | Created |
| `packages/dashboard/src/components/WorkOrderDetail.tsx` | Modified |

---

## Thrust 6: Run Detail Streaming

### 6.1 Objective

Create a comprehensive run detail view with tabbed streaming output.

### 6.2 Background

Beyond the activity panel, users need a detailed view of run execution including:
- Full output stream
- Tool call history
- Files modified
- Error log

### 6.3 Subtasks

#### 6.3.1 Create RunStreamView Component

Create `packages/dashboard/src/components/RunStreamView.tsx`:

**Layout:**
- Tabbed interface:
  - **Activity**: Full event stream (AgentActivityPanel)
  - **Tools**: Tool calls with inputs/outputs
  - **Output**: Agent text output only
  - **Files**: Files created/modified
  - **Errors**: Errors and warnings

#### 6.3.2 Create ToolCallsTab Component

Display tool calls in structured format:

**Features:**
- Tree view of tool calls
- Expandable input/output
- Duration display
- Success/failure indicator
- Search/filter by tool type

#### 6.3.3 Create OutputTab Component

Display agent text output:

**Features:**
- Markdown rendering
- Syntax highlighting for code
- Search within output
- Copy all button

#### 6.3.4 Create FilesTab Component

Display file changes:

**Features:**
- List of files with action (created/modified/deleted)
- File size
- Click to view diff (if available)
- Group by directory

#### 6.3.5 Create ErrorsTab Component

Display errors and warnings:

**Features:**
- Error messages with stack traces
- Timestamp
- Context (which tool, what input)
- Severity indicator

#### 6.3.6 Add Progress Header

Create progress indicator at top of RunStreamView:

**Features:**
- Progress bar (0-100%)
- Current phase display
- Tool call count
- Elapsed time
- ETA (when available)

### 6.4 Verification Steps

1. Run `pnpm typecheck` - no errors
2. Run `pnpm lint` - no warnings
3. Navigate to run detail in dashboard
4. Verify all tabs work
5. Verify tab content updates in real-time
6. Verify progress header updates

### 6.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/dashboard/src/components/RunStreamView.tsx` | Created |
| `packages/dashboard/src/components/ToolCallsTab.tsx` | Created |
| `packages/dashboard/src/components/OutputTab.tsx` | Created |
| `packages/dashboard/src/components/FilesTab.tsx` | Created |
| `packages/dashboard/src/components/ErrorsTab.tsx` | Created |
| `packages/dashboard/src/components/ProgressHeader.tsx` | Created |

---

## Component Architecture

```
RunStreamView
├── ProgressHeader
│   ├── ProgressBar
│   ├── PhaseDisplay
│   └── Stats (tool count, elapsed, ETA)
│
└── Tabs
    ├── ActivityTab
    │   └── AgentActivityPanel
    │       └── EventCard (virtualized list)
    │
    ├── ToolCallsTab
    │   └── ToolCallTree
    │       └── ToolCallItem (expandable)
    │
    ├── OutputTab
    │   └── MarkdownRenderer
    │
    ├── FilesTab
    │   └── FileChangeList
    │       └── FileChangeItem
    │
    └── ErrorsTab
        └── ErrorList
            └── ErrorItem
```

---

## State Management

### Event Store

Create a simple store for streaming events:

```typescript
interface EventStore {
  events: AgentEvent[];
  toolCalls: Map<string, ToolCallWithResult>;
  files: Map<string, FileChange>;
  errors: ErrorEvent[];
  progress: ProgressState;
}

// Reducer actions
type EventAction =
  | { type: 'ADD_EVENT'; event: AgentEvent }
  | { type: 'SET_PROGRESS'; progress: ProgressState }
  | { type: 'CLEAR' };
```

### Performance Considerations

1. **Virtualization**: Use react-window for long lists
2. **Memoization**: Memoize event cards to prevent re-renders
3. **Batching**: Batch state updates for rapid events
4. **Throttling**: Throttle UI updates to 60fps max
5. **Memory limit**: Cap stored events (evict oldest)

---

## Styling

### Event Type Colors

| Event Type | Background | Icon |
|------------|------------|------|
| Read | `bg-blue-50` | 📖 |
| Write | `bg-green-50` | ✏️ |
| Edit | `bg-green-50` | 📝 |
| Bash | `bg-yellow-50` | ⚡ |
| Grep | `bg-purple-50` | 🔍 |
| Glob | `bg-purple-50` | 📂 |
| Output | `bg-gray-50` | 💬 |
| Error | `bg-red-50` | ❌ |
| Progress | `bg-cyan-50` | 📊 |

### Connection Status

| Status | Color | Text |
|--------|-------|------|
| Connected | Green | "Live" |
| Connecting | Yellow | "Connecting..." |
| Disconnected | Red | "Disconnected" |
| Reconnecting | Yellow | "Reconnecting..." |
