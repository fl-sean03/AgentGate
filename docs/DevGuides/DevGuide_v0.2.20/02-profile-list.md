# 02: Thrust 1 - Profile List Page

## Objective

Create a dedicated page for viewing all harness profiles with their inheritance relationships, enabling users to understand the profile hierarchy and navigate to create or edit profiles.

---

## Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F1.1 | Display list of all profiles returned by GET /api/v1/profiles | Must Have |
| F1.2 | Show profile name, description, and parent profile (if any) | Must Have |
| F1.3 | Indicate which profile is the system default | Must Have |
| F1.4 | Provide "Create Profile" button navigating to /profiles/new | Must Have |
| F1.5 | Each profile card has Edit button navigating to /profiles/:name | Must Have |
| F1.6 | Each profile card has Delete button with confirmation dialog | Must Have |
| F1.7 | Show inheritance tree visualization for profile hierarchy | Should Have |
| F1.8 | Search/filter profiles by name | Could Have |

### Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| N1.1 | Page loads within 500ms on typical connection | Must Have |
| N1.2 | Profile list is keyboard navigable | Must Have |
| N1.3 | Works correctly on mobile viewport (320px+) | Must Have |
| N1.4 | Supports dark mode | Must Have |

---

## User Interface Specification

### Page Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Sidebar │                    Main Content                       │
│         │ ┌─────────────────────────────────────────────────────┐
│ Dashboard│ │ Profiles                              [+ Create]   │
│ Work Ord │ ├─────────────────────────────────────────────────────┤
│ Runs     │ │                                                     │
│ Profiles◄│ │  ┌─────────────────────────────────────────────┐   │
│ Health   │ │  │ ★ default                          [Edit]   │   │
│ Settings │ │  │ Base configuration for all work orders       │   │
│         │ │  │ Inherits: (none)                    [Delete] │   │
│         │ │  └─────────────────────────────────────────────┘   │
│         │ │                                                     │
│         │ │  ┌─────────────────────────────────────────────┐   │
│         │ │  │ fast-iteration                      [Edit]   │   │
│         │ │  │ Quick iterations with minimal verification   │   │
│         │ │  │ Inherits: default                   [Delete] │   │
│         │ │  └─────────────────────────────────────────────┘   │
│         │ │                                                     │
│         │ │  ┌─────────────────────────────────────────────┐   │
│         │ │  │ thorough-review                     [Edit]   │   │
│         │ │  │ Extended verification with all gates         │   │
│         │ │  │ Inherits: default                   [Delete] │   │
│         │ │  └─────────────────────────────────────────────┘   │
│         │ │                                                     │
│         │ └─────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────┘
```

### Profile Card Specification

Each profile card displays:

| Element | Description | Styling |
|---------|-------------|---------|
| Name | Profile name (e.g., "default") | Bold, large text |
| Default Indicator | Star icon if this is the default profile | Yellow star, left of name |
| Description | Profile description or "(No description)" | Normal text, muted if empty |
| Inheritance | "Inherits: {parent}" or "Inherits: (none)" | Small text, muted |
| Edit Button | Navigates to /profiles/:name | Secondary button style |
| Delete Button | Opens confirmation dialog | Danger button style, icon only |

### Card States

| State | Visual Treatment |
|-------|------------------|
| Default | Standard card appearance |
| Hover | Subtle background color change |
| Focus | Visible focus ring around card |
| Deleting | Reduced opacity, spinner on delete button |

### Empty State

When no profiles exist:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                      📋 No Profiles Yet                        │
│                                                                 │
│     Profiles define harness configuration for work orders.     │
│     Create your first profile to get started.                  │
│                                                                 │
│                    [+ Create Profile]                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Loading State

```
┌─────────────────────────────────────────────────────────────────┐
│ Profiles                                                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ████████████████                                        │   │
│  │ ████████████████████████████████████                    │   │
│  │ ████████████                                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│  (Skeleton cards repeating)                                     │
└─────────────────────────────────────────────────────────────────┘
```

### Error State

```
┌─────────────────────────────────────────────────────────────────┐
│ Profiles                                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                    ⚠️ Failed to Load Profiles                  │
│                                                                 │
│     Could not connect to the server. Please check your         │
│     connection and try again.                                   │
│                                                                 │
│                        [Retry]                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Inheritance Tree Visualization

### Purpose

Show the relationship between profiles when one extends another, helping users understand the configuration hierarchy.

### Visual Design

```
Profile Hierarchy
─────────────────
default
├── fast-iteration
├── thorough-review
│   └── security-focused
└── minimal
```

### Behavior

- Tree is collapsible (default: expanded)
- Clicking a profile name navigates to that profile's detail page
- Current profile is highlighted if viewing within detail page context
- Orphaned profiles (extending non-existent parent) shown with warning icon

---

## Delete Confirmation Dialog

### Dialog Content

```
┌─────────────────────────────────────────────────────────────────┐
│                    Delete Profile                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Are you sure you want to delete the profile "fast-iteration"? │
│                                                                 │
│  ⚠️ This action cannot be undone.                              │
│                                                                 │
│  Note: Work orders using this profile will fall back to the    │
│  default profile.                                               │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                              [Cancel]  [Delete]                 │
└─────────────────────────────────────────────────────────────────┘
```

### Delete Behavior

1. User clicks delete button on profile card
2. Confirmation dialog appears
3. If confirmed, DELETE request sent to /api/v1/profiles/:name
4. On success: Profile removed from list (optimistic update)
5. On failure: Error toast displayed, profile restored to list

### Protected Profiles

- The "default" profile cannot be deleted
- Delete button is disabled or hidden for default profile
- Tooltip explains why deletion is not allowed

---

## Component Hierarchy

```
ProfilesPage
├── PageHeader
│   ├── Title ("Profiles")
│   └── CreateButton → navigates to /profiles/new
├── ProfileList
│   ├── ProfileCard (repeated for each profile)
│   │   ├── ProfileInfo (name, description, inheritance)
│   │   ├── EditButton → navigates to /profiles/:name
│   │   └── DeleteButton → opens DeleteDialog
│   └── EmptyState (when no profiles)
├── InheritanceTree (optional sidebar/panel)
│   └── TreeNode (recursive)
└── DeleteConfirmDialog
    ├── DialogHeader
    ├── DialogContent
    └── DialogActions (Cancel, Delete)
```

---

## Data Flow

### Initial Load

1. Page mounts
2. useProfiles hook triggers GET /api/v1/profiles
3. Loading state displayed while fetching
4. On success: Profiles rendered in list
5. On error: Error state displayed with retry option

### Delete Flow

1. User clicks delete button
2. DeleteConfirmDialog opens with profile details
3. User clicks Cancel → Dialog closes, no action
4. User clicks Delete →
   a. Optimistic update: Remove from list immediately
   b. Send DELETE /api/v1/profiles/:name
   c. On success: Show success toast
   d. On failure: Restore profile to list, show error toast

### Navigation

| Action | Destination |
|--------|-------------|
| Click "Create" button | /profiles/new |
| Click "Edit" button on card | /profiles/:name |
| Click profile name in tree | /profiles/:name |

---

## Accessibility Requirements

| Requirement | Implementation |
|-------------|----------------|
| Keyboard navigation | Tab through cards; Enter to activate buttons |
| Screen reader | Cards announce profile name, description, inheritance |
| Focus management | Focus moves to first card after delete |
| Color contrast | All text meets WCAG AA (4.5:1 ratio) |
| Motion | Delete animation respects prefers-reduced-motion |

---

## Responsive Behavior

### Desktop (1024px+)
- Sidebar visible
- Profile cards in grid (2-3 columns)
- Inheritance tree in side panel

### Tablet (768px - 1023px)
- Sidebar collapsed to icons
- Profile cards in 2-column grid
- Inheritance tree collapsed by default

### Mobile (< 768px)
- Sidebar hidden (hamburger menu)
- Profile cards stacked vertically (1 column)
- Inheritance tree hidden (available via toggle)

---

## Acceptance Criteria

| ID | Criteria | Verification Method |
|----|----------|---------------------|
| AC1.1 | Profile list displays all profiles from API | Manual: Create 3 profiles, verify all shown |
| AC1.2 | Profile cards show name, description, inheritance | Manual: Inspect card content |
| AC1.3 | Default profile marked with star indicator | Manual: Identify default profile |
| AC1.4 | Create button navigates to /profiles/new | Manual: Click and verify URL |
| AC1.5 | Edit button navigates to /profiles/:name | Manual: Click and verify URL |
| AC1.6 | Delete shows confirmation dialog | Manual: Click delete, verify dialog |
| AC1.7 | Delete confirmation removes profile | Manual: Confirm delete, verify removal |
| AC1.8 | Delete can be cancelled | Manual: Click cancel, verify no change |
| AC1.9 | Default profile cannot be deleted | Manual: Verify delete disabled |
| AC1.10 | Loading state shown while fetching | Manual: Observe initial load |
| AC1.11 | Error state shown on API failure | Test: Disconnect server, observe |
| AC1.12 | Empty state shown when no profiles | Test: Delete all profiles, observe |
| AC1.13 | Page works with keyboard only | Manual: Navigate using Tab/Enter |
| AC1.14 | Page works on mobile viewport | Manual: Test at 375px width |
| AC1.15 | Dark mode styling correct | Manual: Toggle dark mode, verify |

---

## Test Cases

### Unit Tests

| Test | Description |
|------|-------------|
| ProfileCard renders name | Verify profile name displayed |
| ProfileCard renders description | Verify description or placeholder |
| ProfileCard shows inheritance | Verify parent name or "none" |
| ProfileCard default indicator | Verify star shown only for default |
| ProfileList handles empty array | Verify empty state rendered |
| ProfileList handles loading | Verify skeleton/spinner shown |
| DeleteDialog shows profile name | Verify correct name in message |

### Integration Tests

| Test | Description |
|------|-------------|
| Load profiles from API | Mock API, verify list populated |
| Delete profile flow | Mock API, verify delete and UI update |
| Navigation to create | Verify route change on button click |
| Navigation to edit | Verify route change with profile name |
| Error handling | Mock API error, verify error state |

### E2E Tests

| Test | Description |
|------|-------------|
| Full CRUD flow | Create, view, edit, delete profile |
| Inheritance display | Create parent/child, verify tree |
| Protected default | Attempt delete default, verify blocked |
