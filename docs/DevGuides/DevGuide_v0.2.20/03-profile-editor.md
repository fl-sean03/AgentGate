# 03: Thrust 2 - Profile Editor

## Objective

Create a profile editor page that allows users to create new profiles and edit existing ones, including a JSON configuration editor with validation and inheritance preview.

---

## Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F2.1 | Create new profile via form at /profiles/new | Must Have |
| F2.2 | Edit existing profile via form at /profiles/:name | Must Have |
| F2.3 | Form fields: name, description, extends (parent), config | Must Have |
| F2.4 | Name field: required, alphanumeric with dashes, unique | Must Have |
| F2.5 | Extends field: dropdown of existing profile names | Must Have |
| F2.6 | Config field: JSON editor with syntax highlighting | Must Have |
| F2.7 | Validate JSON config against HarnessConfig schema | Must Have |
| F2.8 | Show validation errors inline | Must Have |
| F2.9 | Preview resolved config (with inheritance applied) | Should Have |
| F2.10 | Save button triggers POST (create) or PUT (edit) | Must Have |
| F2.11 | Cancel button returns to profile list | Must Have |
| F2.12 | Name field disabled when editing (names are immutable) | Must Have |

### Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| N2.1 | Form submission within 1 second | Must Have |
| N2.2 | JSON validation within 200ms | Must Have |
| N2.3 | All form fields keyboard accessible | Must Have |
| N2.4 | Works on mobile viewport | Must Have |

---

## User Interface Specification

### Create Mode Layout (/profiles/new)

```
┌─────────────────────────────────────────────────────────────────┐
│ Sidebar │                    Main Content                       │
│         │ ┌─────────────────────────────────────────────────────┐
│         │ │ ← Back to Profiles                                  │
│         │ │                                                     │
│         │ │ Create Profile                                      │
│         │ ├─────────────────────────────────────────────────────┤
│         │ │                                                     │
│         │ │ Name *                                              │
│         │ │ ┌─────────────────────────────────────────────────┐ │
│         │ │ │ my-custom-profile                               │ │
│         │ │ └─────────────────────────────────────────────────┘ │
│         │ │ Alphanumeric characters and dashes only             │
│         │ │                                                     │
│         │ │ Description                                         │
│         │ │ ┌─────────────────────────────────────────────────┐ │
│         │ │ │ Custom profile for API development projects     │ │
│         │ │ └─────────────────────────────────────────────────┘ │
│         │ │                                                     │
│         │ │ Extends                                             │
│         │ │ ┌─────────────────────────────────────────────────┐ │
│         │ │ │ default                                    ▼    │ │
│         │ │ └─────────────────────────────────────────────────┘ │
│         │ │ Inherit settings from this profile                  │
│         │ │                                                     │
│         │ │ Configuration (JSON)                                │
│         │ │ ┌─────────────────────────────────────────────────┐ │
│         │ │ │ {                                               │ │
│         │ │ │   "loopStrategy": {                             │ │
│         │ │ │     "mode": "iterative",                        │ │
│         │ │ │     "maxIterations": 3                          │ │
│         │ │ │   },                                            │ │
│         │ │ │   "verification": {                             │ │
│         │ │ │     "skipLevels": ["L2"]                        │ │
│         │ │ │   }                                             │ │
│         │ │ │ }                                               │ │
│         │ │ └─────────────────────────────────────────────────┘ │
│         │ │ Only include fields you want to override            │
│         │ │                                                     │
│         │ │ [Show Resolved Config]                              │
│         │ │                                                     │
│         │ ├─────────────────────────────────────────────────────┤
│         │ │                        [Cancel]  [Create Profile]   │
│         │ └─────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────┘
```

### Edit Mode Layout (/profiles/:name)

Same as create mode with these differences:
- Title: "Edit Profile" instead of "Create Profile"
- Name field: Disabled with lock icon, shows current name
- Button: "Save Changes" instead of "Create Profile"
- Shows last modified timestamp

### Form Fields Specification

#### Name Field

| Property | Value |
|----------|-------|
| Type | Text input |
| Required | Yes |
| Validation | Alphanumeric + dashes, 3-50 chars, unique |
| Disabled | In edit mode |
| Placeholder | "my-profile-name" |
| Help text | "Alphanumeric characters and dashes only" |
| Error states | "Name is required", "Invalid characters", "Name already exists" |

#### Description Field

| Property | Value |
|----------|-------|
| Type | Textarea |
| Required | No |
| Validation | Max 500 characters |
| Placeholder | "Describe the purpose of this profile" |
| Help text | None |
| Error states | "Description too long (max 500 characters)" |

#### Extends Field

| Property | Value |
|----------|-------|
| Type | Dropdown/Select |
| Required | No |
| Options | List of existing profile names + "(None)" |
| Default | "(None)" for create, current parent for edit |
| Help text | "Inherit settings from this profile" |
| Behavior | Cannot select self (in edit mode) |

#### Configuration Field

| Property | Value |
|----------|-------|
| Type | JSON editor (textarea with syntax highlighting) |
| Required | No (empty = inherit everything) |
| Validation | Valid JSON, conforms to HarnessConfig schema |
| Height | Auto-expand, min 200px, max 500px |
| Help text | "Only include fields you want to override" |
| Features | Line numbers, syntax highlighting, auto-indent |

---

## Validation Specification

### Name Validation

| Rule | Error Message |
|------|---------------|
| Required | "Profile name is required" |
| Min length (3) | "Name must be at least 3 characters" |
| Max length (50) | "Name must be at most 50 characters" |
| Pattern (alphanumeric + dash) | "Name can only contain letters, numbers, and dashes" |
| Cannot start with dash | "Name cannot start with a dash" |
| Cannot end with dash | "Name cannot end with a dash" |
| Unique (create mode) | "A profile with this name already exists" |
| Reserved names | "This name is reserved" (e.g., "new", "create") |

### JSON Configuration Validation

| Rule | Error Message |
|------|---------------|
| Valid JSON syntax | "Invalid JSON: {parse error details}" |
| Schema validation | "Invalid config: {field} {issue}" |
| Unknown fields | Warning: "Unknown field: {field} (will be ignored)" |

### Schema Fields (HarnessConfig)

The JSON config should validate against these known fields:

```
loopStrategy:
  mode: "iterative" | "parallel" | "adaptive"
  maxIterations: number (1-20)

verification:
  waitForCI: boolean
  skipLevels: array of "L0" | "L1" | "L2" | "L3"
  localRetryEnabled: boolean
  ciRetryEnabled: boolean

limits:
  maxWallClockSeconds: number
  maxTokens: number

github:
  mode: "fail-fast" | "best-effort" | "disabled"
  createPR: boolean
  baseBranch: string

agent:
  type: string
  model: string
  temperature: number (0-2)
```

---

## Resolved Config Preview

### Purpose

Show users what the final configuration will look like after inheritance is applied. This helps users understand what values their profile will actually use.

### UI Design

```
┌─────────────────────────────────────────────────────────────────┐
│ Resolved Configuration                               [Collapse] │
├─────────────────────────────────────────────────────────────────┤
│ {                                                               │
│   "loopStrategy": {                                             │
│     "mode": "iterative",        ← from: default                │
│     "maxIterations": 3          ← from: this profile           │
│   },                                                            │
│   "verification": {                                             │
│     "waitForCI": true,          ← from: default                │
│     "skipLevels": ["L2"],       ← from: this profile           │
│     "localRetryEnabled": true   ← from: default                │
│   },                                                            │
│   "limits": {                                                   │
│     "maxWallClockSeconds": 3600 ← from: default                │
│   }                                                             │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘
```

### Behavior

- Collapsed by default
- Expand via "Show Resolved Config" button
- Fetches from GET /api/v1/profiles/:name?resolve=true
- Shows source of each value (which profile it came from)
- Updates when parent selection changes
- Debounced update when config JSON changes

---

## Form States

### Initial State (Create)

- All fields empty except Extends (defaults to "default" or "(None)")
- Submit button disabled until name provided
- No validation errors shown

### Initial State (Edit)

- Fields populated with existing profile data
- Name field disabled
- Submit button enabled
- Config field shows current override config (not resolved)

### Validation State

- Real-time validation on blur for all fields
- JSON validation on blur and on change (debounced 500ms)
- Schema validation only on submit
- Invalid fields highlighted with red border
- Error messages displayed below field

### Submitting State

- Submit button shows loading spinner
- All fields disabled
- Cancel button still active

### Success State

- Toast notification: "Profile created" or "Profile saved"
- Redirect to /profiles (list page)
- Or stay on page with success message (user choice)

### Error State

- Toast notification with error message
- Form remains editable
- Specific field errors shown inline if applicable

---

## API Integration

### Create Profile (POST /api/v1/profiles)

Request body:
```
{
  "name": "my-profile",
  "description": "My custom profile",
  "extends": "default",
  "config": {
    "loopStrategy": { "maxIterations": 3 }
  }
}
```

### Update Profile (PUT /api/v1/profiles/:name)

Request body (name not included, taken from URL):
```
{
  "description": "Updated description",
  "extends": "default",
  "config": {
    "loopStrategy": { "maxIterations": 5 }
  }
}
```

### Get Resolved Config (GET /api/v1/profiles/:name?resolve=true)

Returns full resolved config with inheritance applied.

### Validate Profile (POST /api/v1/profiles/:name/validate)

Returns validation result without saving.

---

## Component Hierarchy

```
ProfileDetailPage
├── BackLink → navigates to /profiles
├── PageHeader
│   ├── Title ("Create Profile" or "Edit Profile")
│   └── LastModified (edit mode only)
├── ProfileForm
│   ├── NameField
│   │   ├── Label
│   │   ├── Input (disabled in edit mode)
│   │   ├── HelpText
│   │   └── ErrorMessage
│   ├── DescriptionField
│   │   ├── Label
│   │   ├── Textarea
│   │   └── ErrorMessage
│   ├── ExtendsField
│   │   ├── Label
│   │   ├── Select
│   │   ├── HelpText
│   │   └── ErrorMessage
│   ├── ConfigField
│   │   ├── Label
│   │   ├── JsonEditor
│   │   ├── HelpText
│   │   └── ErrorMessage
│   └── ResolvedConfigPreview (collapsible)
│       ├── ToggleButton
│       └── ConfigViewer
├── FormActions
│   ├── CancelButton → navigates to /profiles
│   └── SubmitButton (Create/Save)
└── UnsavedChangesDialog (if navigating with changes)
```

---

## Unsaved Changes Warning

### Trigger Conditions

- User has modified any field
- User attempts to navigate away (back button, sidebar link, etc.)

### Dialog Content

```
┌─────────────────────────────────────────────────────────────────┐
│                    Unsaved Changes                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  You have unsaved changes. Are you sure you want to leave?     │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                    [Stay]  [Leave Without Saving]               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Acceptance Criteria

| ID | Criteria | Verification |
|----|----------|--------------|
| AC2.1 | Create form accessible at /profiles/new | Navigate to URL |
| AC2.2 | Edit form accessible at /profiles/:name | Navigate to URL |
| AC2.3 | Edit form loads existing profile data | Verify pre-populated fields |
| AC2.4 | Name field validates correctly | Test invalid inputs |
| AC2.5 | Name field disabled in edit mode | Verify cannot type |
| AC2.6 | Extends dropdown shows all profiles | Verify dropdown options |
| AC2.7 | Cannot select self in extends | Verify option disabled |
| AC2.8 | JSON editor accepts valid JSON | Enter valid JSON |
| AC2.9 | JSON editor rejects invalid JSON | Enter invalid JSON |
| AC2.10 | Schema validation on submit | Submit with invalid schema |
| AC2.11 | Resolved config preview works | Expand and verify |
| AC2.12 | Create submits POST request | Monitor network |
| AC2.13 | Edit submits PUT request | Monitor network |
| AC2.14 | Cancel returns to list | Click cancel |
| AC2.15 | Unsaved changes warning | Modify and navigate |
| AC2.16 | Success redirects to list | Complete save |
| AC2.17 | Error displayed on failure | Mock API error |

---

## Test Cases

### Unit Tests

| Test | Description |
|------|-------------|
| NameField validation | Test all validation rules |
| JsonEditor parse | Verify JSON parsing and error display |
| ExtendsDropdown filters self | Verify current profile not in options |
| Form dirty detection | Verify changes tracked correctly |

### Integration Tests

| Test | Description |
|------|-------------|
| Create flow | Fill form, submit, verify API call |
| Edit flow | Load profile, modify, submit |
| Resolved config fetch | Verify preview fetches correctly |
| Validation flow | Submit invalid, verify errors shown |

### E2E Tests

| Test | Description |
|------|-------------|
| Create and verify | Create profile, verify in list |
| Edit and verify | Edit profile, verify changes persisted |
| Inheritance chain | Create child profile, verify resolved config |
