# 08: Thrust 7 - Run Trigger

## Objective

Add the ability to manually trigger new runs for existing work orders from the dashboard UI, allowing users to retry failed work orders or start additional runs without using the API directly.

---

## Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F7.1 | Display "Trigger Run" button on WorkOrderDetail page | Must Have |
| F7.2 | Button only visible when work order allows new runs | Must Have |
| F7.3 | Show confirmation dialog before triggering | Must Have |
| F7.4 | Display loading state during trigger | Must Have |
| F7.5 | Navigate to new run on success | Must Have |
| F7.6 | Show error message on failure | Must Have |
| F7.7 | Option to configure run parameters (optional) | Could Have |
| F7.8 | Show estimated queue position if queued | Could Have |

### Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| N7.1 | Trigger completes within 2 seconds | Must Have |
| N7.2 | Button accessible via keyboard | Must Have |
| N7.3 | Works on mobile viewport | Must Have |

---

## API Endpoint

### Trigger Run (POST /api/v1/work-orders/:id/runs)

**Request (optional body for overrides):**
```
{
  "profileOverrides": {
    "loopStrategy": {
      "maxIterations": 3
    }
  }
}
```

**Response (201 Created):**
```
{
  "success": true,
  "data": {
    "runId": "run-xyz789",
    "runNumber": 3,
    "status": "queued",
    "startedAt": null,
    "workOrderId": "wo-abc123"
  }
}
```

**Error Response (409 Conflict - Already Running):**
```
{
  "success": false,
  "error": {
    "code": "RUN_ALREADY_ACTIVE",
    "message": "Work order already has an active run"
  }
}
```

**Error Response (403 Forbidden - Work Order Complete):**
```
{
  "success": false,
  "error": {
    "code": "WORK_ORDER_COMPLETE",
    "message": "Cannot trigger run for completed work order"
  }
}
```

---

## User Interface Specification

### Button Placement

**On WorkOrderDetail page header:**

```
┌─────────────────────────────────────────────────────────────────┐
│ ← Back to Work Orders                                           │
│                                                                 │
│ Work Order: abc123                                              │
│ Status: failed                    [🔄 Trigger New Run]          │
│                                                                 │
│ Prompt: Fix the authentication bug in the login flow           │
│ Created: Jan 2, 2026 at 10:00 AM                               │
├─────────────────────────────────────────────────────────────────┤
│ Runs (2)                                                        │
│ ...                                                             │
└─────────────────────────────────────────────────────────────────┘
```

### Button States

| State | Appearance | Condition |
|-------|------------|-----------|
| Visible & Enabled | Primary button | No active run, WO not succeeded |
| Visible & Disabled | Grayed out with tooltip | Active run in progress |
| Hidden | Not rendered | Work order succeeded |
| Loading | Spinner + "Triggering..." | API call in progress |

### Button Visibility Logic

```
Show button if:
  - Work order status is NOT "succeeded"
  - AND work order status is NOT "cancelled"

Enable button if:
  - No run with status "running" or "building"
  - AND not currently triggering

Hide button if:
  - Work order status is "succeeded"
  - OR work order status is "cancelled"
```

---

## Confirmation Dialog

### Dialog Content

```
┌─────────────────────────────────────────────────────────────────┐
│                    Trigger New Run                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Start a new run for this work order?                          │
│                                                                 │
│  Work Order: abc123                                             │
│  Prompt: Fix the authentication bug...                         │
│                                                                 │
│  This will create Run #3 using the current profile settings.   │
│                                                                 │
│  ▶ Advanced Options (collapsed)                                │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                              [Cancel]  [Start Run]              │
└─────────────────────────────────────────────────────────────────┘
```

### Advanced Options (Optional)

When expanded:

```
│  ▼ Advanced Options                                             │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Max Iterations: [5        ]                                 ││
│  │ Profile: [default              ▼]                           ││
│  │                                                             ││
│  │ ⚠️ These overrides apply only to this run                  ││
│  └─────────────────────────────────────────────────────────────┘│
```

---

## Trigger Flow

### Step-by-Step

1. User clicks "Trigger New Run" button
2. Confirmation dialog opens
3. User optionally configures advanced options
4. User clicks "Start Run"
5. Button shows loading state
6. POST request to /api/v1/work-orders/:id/runs
7. On success:
   - Close dialog
   - Show success toast: "Run #3 started"
   - Navigate to /runs/:newRunId
8. On error:
   - Show error in dialog or toast
   - Keep dialog open for retry

### State Machine

```
┌─────────┐   click    ┌──────────────┐
│  Idle   │ ─────────> │ Dialog Open  │
└─────────┘            └──────────────┘
     ▲                        │
     │                   confirm
     │                        ▼
     │                 ┌─────────────┐
     │     cancel      │ Submitting  │
     └──────────────── └─────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
       ┌─────────────┐                 ┌─────────────┐
       │  Success    │                 │   Error     │
       │  Navigate   │                 │ Show Toast  │
       └─────────────┘                 └─────────────┘
```

---

## Error Handling

### Error Cases

| Error Code | User Message | Action |
|------------|--------------|--------|
| RUN_ALREADY_ACTIVE | "A run is already in progress for this work order" | Close dialog, show toast |
| WORK_ORDER_COMPLETE | "This work order has already succeeded" | Close dialog, refresh page |
| CAPACITY_EXCEEDED | "Server at capacity. Your run has been queued." | Show queue position |
| NETWORK_ERROR | "Could not connect to server. Please try again." | Keep dialog open |
| UNKNOWN | "An unexpected error occurred" | Keep dialog open |

### Retry Behavior

- Network errors: Show retry button in dialog
- Server errors: Close dialog, show toast with details
- Validation errors: Show inline in dialog

---

## Component Hierarchy

```
TriggerRunButton
├── Button
│   ├── Icon (refresh icon)
│   ├── Label ("Trigger New Run")
│   └── Spinner (when loading)
└── TriggerRunDialog
    ├── DialogHeader
    ├── DialogContent
    │   ├── WorkOrderSummary
    │   ├── RunInfo ("This will create Run #N")
    │   └── AdvancedOptions (collapsible)
    │       ├── MaxIterationsInput
    │       └── ProfileSelect
    ├── DialogError (if error)
    └── DialogActions
        ├── CancelButton
        └── ConfirmButton
```

---

## Hook: useTriggerRun

### Purpose

Encapsulate the mutation logic for triggering runs.

### Interface

```
interface UseTriggerRunOptions {
  onSuccess?: (run: Run) => void;
  onError?: (error: Error) => void;
}

interface UseTriggerRunReturn {
  trigger: (workOrderId: string, options?: TriggerOptions) => void;
  isLoading: boolean;
  error: Error | null;
  reset: () => void;
}

interface TriggerOptions {
  maxIterations?: number;
  profileName?: string;
}
```

### Behavior

- On success: Invalidate work order query, invalidate runs query
- On success: Call onSuccess callback with new run data
- On error: Call onError callback with error

---

## Keyboard Accessibility

| Key | Action |
|-----|--------|
| Enter | Activate button (when focused) |
| Escape | Close dialog |
| Tab | Navigate dialog elements |
| Enter | Confirm action (when focused on confirm button) |

---

## Mobile Considerations

### Button Placement

- On mobile, button may move to a floating action button (FAB)
- Or placed in a "More Actions" dropdown menu

### Dialog

- Full-screen on mobile (<640px)
- Slide-up animation
- Touch-friendly button sizes (min 44px)

---

## Acceptance Criteria

| ID | Criteria | Verification |
|----|----------|--------------|
| AC7.1 | Button visible on failed work order | Navigate to failed WO |
| AC7.2 | Button hidden on succeeded work order | Navigate to succeeded WO |
| AC7.3 | Button disabled when run active | Start run, check button |
| AC7.4 | Dialog opens on button click | Click button |
| AC7.5 | Dialog shows work order info | Verify content |
| AC7.6 | Cancel closes dialog | Click cancel |
| AC7.7 | Confirm triggers API call | Monitor network |
| AC7.8 | Loading state shown | Observe button |
| AC7.9 | Success navigates to run | Complete trigger |
| AC7.10 | Error shown on failure | Mock error |
| AC7.11 | Keyboard accessible | Tab through dialog |
| AC7.12 | Works on mobile | Test at 375px |

---

## Test Cases

### Unit Tests

| Test | Description |
|------|-------------|
| Button visibility failed | Verify shown for failed WO |
| Button visibility succeeded | Verify hidden for succeeded |
| Button disabled active run | Verify disabled state |
| Dialog opens | Verify dialog renders |
| Dialog cancel | Verify closes without action |

### Integration Tests

| Test | Description |
|------|-------------|
| Trigger mutation | Mock API, verify call |
| Success navigation | Verify redirect to run |
| Error handling | Mock error, verify display |
| Cache invalidation | Verify queries refetched |

### E2E Tests

| Test | Description |
|------|-------------|
| Full trigger flow | Trigger, verify run created |
| Multiple runs | Trigger multiple, verify list |
