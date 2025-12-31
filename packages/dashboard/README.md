# AgentGate Dashboard

A modern React dashboard application for AgentGate, built with Vite, TypeScript, and TailwindCSS.

## Features

- ⚡️ **Vite** - Lightning-fast development and build tooling
- ⚛️ **React 18** - Modern React with hooks and concurrent features
- 🔷 **TypeScript** - Type-safe development experience
- 🎨 **TailwindCSS** - Utility-first CSS framework with custom theme
- 🔄 **React Query** - Powerful data fetching and state management
- 🧭 **React Router** - Client-side routing
- 🎯 **Lucide React** - Beautiful icon library
- ✅ **Zod** - Runtime type validation

## Project Structure

```
agentgate-dashboard/
├── src/
│   ├── api/           # API client and services
│   ├── components/    # Reusable React components
│   ├── hooks/         # Custom React hooks
│   ├── pages/         # Page components
│   ├── types/         # TypeScript type definitions
│   ├── App.tsx        # Main app component with routing
│   ├── main.tsx       # Application entry point
│   └── index.css      # Global styles with Tailwind
├── index.html         # HTML template
├── vite.config.ts     # Vite configuration
├── tsconfig.json      # TypeScript configuration
├── tailwind.config.js # TailwindCSS configuration
├── eslint.config.js   # ESLint configuration
├── .prettierrc        # Prettier configuration
└── verify.yaml        # AgentGate verification configuration
```

## Prerequisites

- Node.js 20 or higher
- pnpm (recommended) or npm

## Getting Started

### Installation

Install dependencies:

```bash
pnpm install
```

### Development

Start the development server:

```bash
pnpm dev
```

The application will be available at `http://localhost:5173`

### Building

Build for production:

```bash
pnpm build
```

Preview the production build:

```bash
pnpm preview
```

## Code Quality

### Type Checking

Run TypeScript type checking:

```bash
pnpm typecheck
```

### Linting

Run ESLint:

```bash
pnpm lint
```

### Formatting

Format code with Prettier:

```bash
pnpm format
```

## Verification

This project includes an AgentGate verification configuration (`verify.yaml`) that runs automated checks:

- ✅ Type checking
- ✅ Linting
- ✅ Build

## Configuration

### Environment Variables

Create a `.env` file in the root directory for environment-specific configuration:

```env
VITE_API_BASE_URL=http://localhost:3000/api
```

### TailwindCSS Theme

The project includes a custom TailwindCSS theme with primary and secondary color palettes. Modify `tailwind.config.js` to customize colors, fonts, and other design tokens.

## Technologies

- **Vite** - Next-generation frontend tooling
- **React** - UI library
- **TypeScript** - Type-safe JavaScript
- **TailwindCSS** - Utility-first CSS framework
- **React Query** - Data fetching and caching
- **React Router** - Routing library
- **Lucide React** - Icon library
- **Zod** - Schema validation
- **ESLint** - Code linting
- **Prettier** - Code formatting

## License

MIT
