.PHONY: test test-ui test-headed dev build check format format-check forge-build forge-test install

# Run the full Playwright e2e suite
test:
	npm test

# Playwright interactive UI
test-ui:
	npm run test:ui

# Run tests with a visible browser window
test-headed:
	npm run test:headed

# Start the frontend dev server (localhost:8080)
dev:
	cd frontend && npm run dev

# Build the frontend
build:
	cd frontend && npm run build

# Type-check the frontend
check:
	cd frontend && npm run check

# Format frontend source
format:
	cd frontend && npm run format

# Check formatting (frontend + e2e) — mirrors CI lint job
format-check:
	npm run format:check
	cd frontend && npm run format:check

# Build the Solidity contract
forge-build:
	forge build

# Run Solidity tests
forge-test:
	forge test

# Install all dependencies (root + frontend)
install:
	npm install
	cd frontend && npm install
