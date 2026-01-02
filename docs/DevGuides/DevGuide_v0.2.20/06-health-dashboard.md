# 06: Thrust 5 - Health Dashboard

## Objective

Create a dedicated health dashboard page that displays system health, agent driver status, capacity limits, and sandbox status with auto-refresh capability.

---

## Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F5.1 | Display overall system health status | Must Have |
| F5.2 | Show server version and uptime | Must Have |
| F5.3 | Display all configured agent drivers with status | Must Have |
| F5.4 | Show work order capacity (current/max) | Must Have |
| F5.5 | Display sandbox status (enabled, provider type) | Must Have |
| F5.6 | Auto-refresh health data every 30 seconds | Must Have |
| F5.7 | Manual refresh button | Must Have |
| F5.8 | Show last refresh timestamp | Must Have |
| F5.9 | Display readiness check details | Should Have |
| F5.10 | Alert when system is degraded or unhealthy | Should Have |

### Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| N5.1 | Health page loads within 500ms | Must Have |
| N5.2 | Auto-refresh does not interrupt user actions | Must Have |
| N5.3 | Works on mobile viewport | Must Have |
| N5.4 | Supports dark mode | Must Have |

---

## API Endpoints

### Health Check (GET /health)

**Response:**
```
{
  "status": "healthy",
  "version": "0.2.20",
  "uptime": 345600,
  "timestamp": "2026-01-02T12:00:00Z",
  "limits": {
    "maxConcurrentWorkOrders": 10,
    "activeWorkOrders": 3
  },
  "drivers": {
    "claude-code-subscription": {
      "available": true,
      "configured": true,
      "lastUsed": "2026-01-02T11:30:00Z"
    },
    "claude-code-api": {
      "available": false,
      "configured": false,
      "lastUsed": null
    },
    "opencode": {
      "available": true,
      "configured": true,
      "lastUsed": "2026-01-01T15:00:00Z"
    }
  },
  "sandbox": {
    "enabled": true,
    "provider": "docker",
    "containerImage": "agentgate/sandbox:latest",
    "healthy": true
  }
}
```

### Readiness Check (GET /health/ready)

**Response:**
```
{
  "ready": true,
  "checks": {
    "database": { "status": "healthy", "latency": 5 },
    "github": { "status": "healthy", "latency": 120 },
    "sandbox": { "status": "healthy", "latency": 50 }
  }
}
```

### Liveness Check (GET /health/live)

**Response:**
```
{
  "alive": true,
  "pid": 12345,
  "memory": {
    "used": 150000000,
    "total": 512000000
  }
}
```

---

## User Interface Specification

### Page Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Sidebar │                    Main Content                       │
│         │ ┌─────────────────────────────────────────────────────┐
│ Dashboard│ │ System Health                    [↻ Refresh]       │
│ Work Ord │ │ Last updated: 12:00:00 PM (auto-refreshes)         │
│ Runs     │ ├─────────────────────────────────────────────────────┤
│ Profiles │ │                                                     │
│ Health ◄ │ │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│ Settings │ │  │ ● HEALTHY   │ │ Version     │ │ Uptime      │   │
│         │ │  │             │ │ 0.2.20      │ │ 4d 2h 15m   │   │
│         │ │  │ All systems │ │             │ │             │   │
│         │ │  │ operational │ │             │ │             │   │
│         │ │  └─────────────┘ └─────────────┘ └─────────────┘   │
│         │ │                                                     │
│         │ │  Work Order Capacity                                │
│         │ │  ┌─────────────────────────────────────────────────┐│
│         │ │  │ ████████░░░░░░░░░░░░░░░░░░░░  3 / 10 active    ││
│         │ │  └─────────────────────────────────────────────────┘│
│         │ │                                                     │
│         │ │  Agent Drivers                                      │
│         │ │  ┌─────────────────────────────────────────────────┐│
│         │ │  │ ● claude-code-subscription    Available         ││
│         │ │  │   Last used: 30 minutes ago                     ││
│         │ │  ├─────────────────────────────────────────────────┤│
│         │ │  │ ○ claude-code-api             Not Configured    ││
│         │ │  │   API key not set                               ││
│         │ │  ├─────────────────────────────────────────────────┤│
│         │ │  │ ● opencode                    Available         ││
│         │ │  │   Last used: yesterday                          ││
│         │ │  └─────────────────────────────────────────────────┘│
│         │ │                                                     │
│         │ │  Sandbox Environment                                │
│         │ │  ┌─────────────────────────────────────────────────┐│
│         │ │  │ ● Enabled (Docker)                              ││
│         │ │  │   Image: agentgate/sandbox:latest               ││
│         │ │  │   Status: Healthy                               ││
│         │ │  └─────────────────────────────────────────────────┘│
│         │ │                                                     │
│         │ └─────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────┘
```

### Status Card (Main Health)

**States:**

| Status | Color | Icon | Message |
|--------|-------|------|---------|
| healthy | Green | ● | "All systems operational" |
| degraded | Yellow | ◐ | "Some systems degraded" |
| unhealthy | Red | ● | "System unhealthy" |

**Information Displayed:**
- Status indicator with icon
- Status label (HEALTHY, DEGRADED, UNHEALTHY)
- Brief description
- Server version
- Uptime (formatted: "4d 2h 15m" or "2h 30m" or "45m")

### Capacity Gauge

**Visual Design:**
- Horizontal progress bar
- Shows current/max ratio
- Color changes based on utilization:
  - 0-70%: Green
  - 70-90%: Yellow
  - 90-100%: Red

**Information Displayed:**
- Current active work orders
- Maximum concurrent limit
- Percentage utilization

### Driver Status Cards

**For each driver:**

| Element | Description |
|---------|-------------|
| Status indicator | ● Green (available), ○ Gray (not configured), ● Red (error) |
| Driver name | e.g., "claude-code-subscription" |
| Status text | "Available", "Not Configured", "Error" |
| Last used | Relative time or "Never used" |
| Error message | If applicable |

### Sandbox Status Card

**Information Displayed:**
- Enabled/Disabled status
- Provider type (docker, local, none)
- Container image (if docker)
- Health status
- Error details (if unhealthy)

---

## Auto-Refresh Behavior

### Configuration
- Default interval: 30 seconds
- Minimum interval: 10 seconds
- Can be paused by user

### Visual Indicators
- Show "Last updated: {time}" text
- Countdown or subtle animation before refresh
- Brief loading indicator during refresh (non-blocking)

### User Controls
- Manual refresh button (always available)
- Pause/resume auto-refresh toggle
- Refresh interval selector (optional)

### Error Handling
- If refresh fails, show error banner
- Retry automatically on next interval
- Don't clear existing data on refresh failure

---

## Component Hierarchy

```
HealthPage
├── PageHeader
│   ├── Title ("System Health")
│   ├── RefreshButton
│   └── LastUpdatedText
├── StatusOverview (grid)
│   ├── HealthStatusCard
│   ├── VersionCard
│   └── UptimeCard
├── CapacitySection
│   ├── SectionHeader
│   └── CapacityGauge
├── DriversSection
│   ├── SectionHeader
│   └── DriverStatusCard (repeated)
├── SandboxSection
│   ├── SectionHeader
│   └── SandboxStatusCard
└── ReadinessSection (optional, expandable)
    ├── SectionHeader
    └── ReadinessChecks
        └── CheckRow (repeated)
```

---

## Uptime Formatting

### Rules

| Duration | Format |
|----------|--------|
| < 1 hour | "Xm" (e.g., "45m") |
| < 24 hours | "Xh Ym" (e.g., "2h 30m") |
| < 7 days | "Xd Yh" (e.g., "4d 2h") |
| >= 7 days | "Xd" (e.g., "15d") |

### Calculation
- Input: uptime in seconds
- Convert to days, hours, minutes
- Display most significant two units

---

## Relative Time Formatting

### For "Last Used" Times

| Duration Ago | Format |
|--------------|--------|
| < 1 minute | "Just now" |
| < 60 minutes | "X minutes ago" |
| < 24 hours | "X hours ago" |
| < 7 days | "X days ago" |
| >= 7 days | Date format (e.g., "Dec 25") |
| Never | "Never used" |

---

## Responsive Design

### Desktop (1024px+)
- 3-column grid for status cards
- Full driver list visible
- Sidebar visible

### Tablet (768px - 1023px)
- 2-column grid for status cards
- Drivers in 2-column grid
- Sidebar collapsed

### Mobile (< 768px)
- Single column layout
- All cards stacked vertically
- Collapsible sections

---

## Alert Behavior

### When System is Degraded

- Show yellow alert banner at top of page
- Banner text: "Some systems are experiencing issues"
- Link to specific degraded component

### When System is Unhealthy

- Show red alert banner at top of page
- Banner text: "System is unhealthy - immediate attention required"
- Auto-refresh interval reduced to 10 seconds
- Consider browser notification (if permitted)

---

## Acceptance Criteria

| ID | Criteria | Verification |
|----|----------|--------------|
| AC5.1 | Health page accessible at /health | Navigate to URL |
| AC5.2 | Shows overall health status | Verify status card |
| AC5.3 | Shows server version | Verify version displayed |
| AC5.4 | Shows uptime formatted correctly | Verify format |
| AC5.5 | Capacity gauge shows current/max | Verify gauge |
| AC5.6 | All drivers listed | Count matches API response |
| AC5.7 | Driver status indicators correct | Verify colors |
| AC5.8 | Sandbox status shown | Verify section |
| AC5.9 | Auto-refresh every 30 seconds | Wait and observe |
| AC5.10 | Manual refresh works | Click button |
| AC5.11 | Last updated timestamp shown | Verify text |
| AC5.12 | Degraded state shows alert | Mock degraded response |
| AC5.13 | Works on mobile | Test at 375px |
| AC5.14 | Dark mode correct | Toggle theme |

---

## Test Cases

### Unit Tests

| Test | Description |
|------|-------------|
| HealthStatusCard healthy | Verify green indicator |
| HealthStatusCard degraded | Verify yellow indicator |
| HealthStatusCard unhealthy | Verify red indicator |
| CapacityGauge percentage | Verify bar width |
| CapacityGauge colors | Verify color thresholds |
| UptimeFormat hours | Test hour formatting |
| UptimeFormat days | Test day formatting |
| RelativeTime minutes | Test minute formatting |
| RelativeTime hours | Test hour formatting |
| DriverStatusCard available | Verify available state |
| DriverStatusCard not configured | Verify not configured state |

### Integration Tests

| Test | Description |
|------|-------------|
| Load health data | Mock API, verify UI populated |
| Auto-refresh interval | Verify refetch after 30s |
| Manual refresh | Click button, verify API called |
| Error handling | Mock error, verify banner |

### E2E Tests

| Test | Description |
|------|-------------|
| Full health page | Load page, verify all sections |
| Degraded state | Configure degraded, verify alert |
| Refresh persistence | Refresh page, verify data loads |
