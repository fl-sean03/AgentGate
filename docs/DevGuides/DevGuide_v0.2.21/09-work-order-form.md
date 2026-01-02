# 09: Thrust 8 - Work Order Creation Form

## Objective

Implement an interactive form for creating new work orders from the TUI, with field validation, profile selection, and keyboard-friendly navigation.

---

## Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F8.1 | Multi-field form | Must Have |
| F8.2 | Text input for prompt | Must Have |
| F8.3 | Text input for repository | Must Have |
| F8.4 | Profile selection dropdown | Must Have |
| F8.5 | Field validation | Must Have |
| F8.6 | Tab navigation between fields | Must Have |
| F8.7 | Submit with Enter | Must Have |
| F8.8 | Cancel with Esc | Must Have |
| F8.9 | Error display | Should Have |
| F8.10 | Multi-line prompt input | Could Have |

### Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| N8.1 | Responsive layout | Must Have |
| N8.2 | Accessible form fields | Should Have |
| N8.3 | Clear focus indicators | Must Have |

---

## UI Specification

### Create Work Order View

```
┌─ Create Work Order ──────────────────────────────────────────────┐
│                                                                   │
│  Task Prompt *                                                    │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Fix the authentication bug in the login flow that causes    │ │
│  │ users to be logged out after 5 minutes█                     │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  Repository URL *                                                 │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ https://github.com/owner/repo                               │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  Profile                                                          │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ ▼ default                                                   │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─────────────┐  ┌─────────────┐                               │
│  │   Create    │  │   Cancel    │                               │
│  └─────────────┘  └─────────────┘                               │
│                                                                   │
├───────────────────────────────────────────────────────────────────┤
│ [Tab] next field [Shift+Tab] prev [Enter] submit [Esc] cancel    │
└───────────────────────────────────────────────────────────────────┘
```

### Field States

```
Unfocused Field:
┌─────────────────────────────────────────────────────────────────┐
│ Placeholder text...                                              │
└─────────────────────────────────────────────────────────────────┘

Focused Field (cyan border):
┌─────────────────────────────────────────────────────────────────┐
│ User input here█                                                 │
└─────────────────────────────────────────────────────────────────┘

Error State (red border):
┌─────────────────────────────────────────────────────────────────┐
│ invalid-repo                                                     │
└─────────────────────────────────────────────────────────────────┘
✗ Please enter a valid GitHub repository URL

Valid State (green indicator):
┌─────────────────────────────────────────────────────────────────┐
│ https://github.com/owner/repo                               ✓   │
└─────────────────────────────────────────────────────────────────┘
```

### Profile Dropdown

```
Closed:
┌─────────────────────────────────────────────────────────────────┐
│ ▼ default                                                        │
└─────────────────────────────────────────────────────────────────┘

Open:
┌─────────────────────────────────────────────────────────────────┐
│ ▼ default                                                        │
├─────────────────────────────────────────────────────────────────┤
│   default           (Base configuration)                         │
│ ▶ fast-iteration    (Fewer iterations, quick results)           │
│   thorough-review   (All verification levels)                    │
│   ci-optimized      (Optimized for CI environments)             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Hierarchy

```
CreateWorkOrderView
├── Box (main container)
│   ├── Text (title)
│   ├── FormField (prompt)
│   │   ├── Label
│   │   └── TextArea
│   ├── FormField (repository)
│   │   ├── Label
│   │   └── TextInput
│   ├── FormField (profile)
│   │   ├── Label
│   │   └── Select
│   ├── ErrorMessage (if any)
│   └── ButtonRow
│       ├── Button (Create)
│       └── Button (Cancel)
└── KeyHint
```

---

## Component Specifications

### CreateWorkOrderView

**Location:** `src/components/views/CreateWorkOrderView.tsx`

```
Props: (none - uses hooks)

State:
- formData: { prompt, repoUrl, profileName }
- focusedField: 'prompt' | 'repoUrl' | 'profile' | 'submit' | 'cancel'
- errors: Record<string, string>
- isSubmitting: boolean

Hooks:
- useProfiles() - fetch available profiles
- useCreateWorkOrder() - mutation hook
- useKeyboard()

Behavior:
1. Initialize with empty form
2. Tab cycles through fields
3. Validate on blur
4. Submit creates work order
5. Navigate to work order on success
```

### TextInput Component

**Location:** `src/components/forms/TextInput.tsx`

```
Props:
{
  value: string,
  onChange: (value: string) => void,
  onSubmit?: () => void,
  onBlur?: () => void,
  placeholder?: string,
  isFocused: boolean,
  isError?: boolean,
  isValid?: boolean,
  maxLength?: number,
}

Features:
- Single-line text input
- Cursor position tracking
- Placeholder when empty
- Border color based on state
- Valid/error indicators
```

### TextArea Component

**Location:** `src/components/forms/TextArea.tsx`

```
Props:
{
  value: string,
  onChange: (value: string) => void,
  onSubmit?: () => void,
  onBlur?: () => void,
  placeholder?: string,
  isFocused: boolean,
  rows?: number, // Default: 3
  maxLength?: number,
}

Features:
- Multi-line text input
- Line wrapping
- Scroll if content exceeds rows
- Ctrl+Enter to submit
```

### Select Component

**Location:** `src/components/forms/Select.tsx`

```
Props:
{
  value: string,
  options: SelectOption[],
  onChange: (value: string) => void,
  isFocused: boolean,
  placeholder?: string,
}

SelectOption:
{
  value: string,
  label: string,
  description?: string,
}

Features:
- Dropdown on Enter or Space
- j/k to navigate options
- Enter to select
- Esc to close without selecting
- Show description in dropdown
```

### FormField Component

**Location:** `src/components/forms/FormField.tsx`

```
Props:
{
  label: string,
  required?: boolean,
  error?: string,
  children: React.ReactNode,
}

Rendering:
- Label with * if required
- Child input component
- Error message below if error
```

### Button Component

**Location:** `src/components/forms/Button.tsx`

```
Props:
{
  label: string,
  onPress: () => void,
  isFocused: boolean,
  variant?: 'primary' | 'secondary',
  isDisabled?: boolean,
  isLoading?: boolean,
}

Styles:
- Primary: Filled background
- Secondary: Border only
- Focused: Inverse colors
- Disabled: Dimmed
- Loading: Spinner instead of label
```

---

## Form Validation

### Validation Rules

```
Prompt:
- Required: true
- Min length: 10 characters
- Max length: 2000 characters
- Error: "Prompt must be at least 10 characters"

Repository URL:
- Required: true
- Pattern: Valid GitHub URL or owner/repo format
- Patterns accepted:
  - https://github.com/owner/repo
  - github.com/owner/repo
  - owner/repo
- Error: "Please enter a valid GitHub repository"

Profile:
- Required: false (defaults to 'default')
- Must be valid profile name
- Error: "Invalid profile selected"
```

### Validation Timing

```
1. On blur: Validate current field
2. On submit: Validate all fields
3. On change: Clear error for field
```

### Validation Display

```
Field with error:
  Repository URL *
  ┌────────────────────────────────────────────────────────┐
  │ not-a-url                                              │
  └────────────────────────────────────────────────────────┘
  ✗ Please enter a valid GitHub repository

Form-level error:
  ┌─ Error ────────────────────────────────────────────────┐
  │ Failed to create work order: Repository not accessible  │
  └────────────────────────────────────────────────────────┘
```

---

## Keyboard Navigation

### Form Navigation

| Key | Action | Description |
|-----|--------|-------------|
| `Tab` | Next field | Move focus to next field |
| `Shift+Tab` | Previous field | Move focus to previous field |
| `Enter` | Submit/Activate | Submit form or activate button |
| `Esc` | Cancel | Close form without saving |

### Text Input Keys

| Key | Action | Description |
|-----|--------|-------------|
| `<chars>` | Type | Insert character at cursor |
| `Backspace` | Delete | Delete character before cursor |
| `Delete` | Delete forward | Delete character after cursor |
| `←` / `→` | Move cursor | Navigate within text |
| `Home` / `Ctrl+A` | Start | Move to start of line |
| `End` / `Ctrl+E` | End | Move to end of line |
| `Ctrl+U` | Clear | Clear entire input |

### Select Keys

| Key | Action | Description |
|-----|--------|-------------|
| `Enter` / `Space` | Open dropdown | Show options |
| `j` / `↓` | Next option | Select next option |
| `k` / `↑` | Previous option | Select previous option |
| `Enter` | Confirm | Select highlighted option |
| `Esc` | Close | Close without selecting |

---

## Focus Management

### Tab Order

```
1. Prompt (TextArea)
2. Repository URL (TextInput)
3. Profile (Select)
4. Create button
5. Cancel button
-> Back to Prompt
```

### Focus Indicators

```
Focused element:
- Cyan border
- Cursor visible (for inputs)
- Inverse colors (for buttons)

Unfocused element:
- Gray border
- No cursor
- Normal colors
```

---

## Submission Flow

### Happy Path

```
1. User fills form
2. User presses Enter or focuses Create button and presses Enter
3. Form validates all fields
4. Show loading state on button
5. POST /api/v1/work-orders
6. On success: Navigate to work order detail
7. Show toast: "Work order created"
```

### Error Path

```
1. User fills form with invalid data
2. User attempts submit
3. Validation fails
4. Show error messages on fields
5. Focus first field with error

OR

1. User fills form with valid data
2. User attempts submit
3. API returns error
4. Show form-level error
5. Keep form data intact
6. User can retry
```

---

## Acceptance Criteria

| ID | Criteria | Verification |
|----|----------|--------------|
| AC8.1 | Form displays all fields | All 3 fields visible |
| AC8.2 | Tab navigation works | Focus moves between fields |
| AC8.3 | Text input works | Characters appear on typing |
| AC8.4 | Profile dropdown works | Can select option |
| AC8.5 | Validation runs on blur | Error shows after blur |
| AC8.6 | Submit validates all | All errors shown |
| AC8.7 | Submit creates work order | API called |
| AC8.8 | Success navigates | Goes to new work order |
| AC8.9 | Error displays | Error message shown |
| AC8.10 | Cancel returns to previous | Previous view shown |

---

## Test Cases

### Unit Tests

| Test | Description |
|------|-------------|
| TextInput renders | Shows value |
| TextInput handles typing | Value updates |
| TextArea renders | Shows multi-line |
| Select opens dropdown | Options visible |
| Select selects option | Value updates |
| Button focuses | Inverse colors |
| FormField shows error | Error message visible |

### Integration Tests

| Test | Description |
|------|-------------|
| Tab navigation | Cycles through fields |
| Validation on blur | Errors appear |
| Submit with valid data | Work order created |
| Submit with invalid data | Errors shown |
| Cancel returns | Previous view shown |

### E2E Tests

| Test | Description |
|------|-------------|
| Create work order | Fill form, submit, verify |
| Validation flow | Invalid data, fix, submit |
| Cancel flow | Start, cancel, verify no creation |

---

## Files to Create

| File | Lines (est.) | Description |
|------|--------------|-------------|
| `src/components/views/CreateWorkOrderView.tsx` | 150 | Main form view |
| `src/components/forms/TextInput.tsx` | 80 | Text input |
| `src/components/forms/TextArea.tsx` | 100 | Multi-line input |
| `src/components/forms/Select.tsx` | 120 | Dropdown select |
| `src/components/forms/FormField.tsx` | 40 | Field wrapper |
| `src/components/forms/Button.tsx` | 50 | Button component |
| `src/hooks/useCreateWorkOrder.ts` | 50 | Creation hook |
| `src/utils/validation.ts` | 60 | Validation functions |
| `tests/views/CreateWorkOrderView.test.tsx` | 120 | View tests |

**Total: ~9 files, ~770 lines**
