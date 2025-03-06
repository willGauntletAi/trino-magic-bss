# TypeScript Express API

A modern, type-safe REST API built with TypeScript and Express.js.

## Features

- TypeScript for type safety
- Express.js for HTTP server
- Structured project layout
- Environment configuration
- CORS and security headers
- Error handling middleware
- Hot-reloading in development

## Getting Started

### Prerequisites

- Node.js (v16 or later recommended)
- npm or yarn

### Installation

```bash
# Install dependencies
npm install
```

### Development

```bash
# Start development server with hot-reload
npm run dev
```

The server will be available at http://localhost:3000.

### Building for Production

```bash
# Build the project
npm run build

# Start the production server
npm start
```

## Project Structure

```
src/
├── controllers/    # Request handlers
├── middleware/     # Express middleware
├── routes/         # API routes
└── index.ts        # Application entry point
```

## API Endpoints

- `GET /` - Base route returning API status
- `GET /health` - Health check endpoint 