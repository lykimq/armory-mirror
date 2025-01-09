# Narval/Armory Project Guide

## Project Overview
Narval/Armory is an open-source access management system specifically designed for Web3 applications with these key features:
- 🔐 Secure authentication and fine-grained authorization
- 🔑 Management of private keys and wallets
- 🔗 Web3-native policy engine
- 🛠️ Customizable authentication system

## System Requirements
- Node.js 21+
- Docker
- OPA CLI (optional if using Docker)

## Quick Start Guide

### Basic Setup
```bash
# Clone and setup
git clone git@github.com:narval-xyz/narval.git
cd narval
make setup
```

### Running Options

#### Option 1: Run Dependencies Only
```bash
make docker/up    # Start dependencies
make docker/stop  # Stop when done
```

#### Option 2: Run Full Stack in Docker
```bash
make docker/stack/build  # Build local dev image
make docker/stack/up     # Start the stack
make docker/stop        # Stop when done
```

## Development Commands
### Testing
```bash
make test              # Run all tests
make test/unit        # Unit tests
make test/integration # Integration tests
make test/e2e        # End-to-end tests
```

### Code Quality
```bash
make format           # Format code
make lint            # Lint code
```

## Key Features

### 1. OpenTelemetry Integration
- For observability and monitoring
- Access Jaeger UI at http://localhost:16686
- Enable with environment variables:
  ```bash
  OTEL_SDK_DISABLED=false
  OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
  ```

### 2. NPM Private Registry
- Requires `.npmrc` file for accessing private dependencies
- Essential for MPC (Multi-Party Computation) signing features

## Project Structure
The project is a monorepo containing:
- 📱 Armory
- 🔐 Policy Engine
- 🏛️ Vault
- 📦 Various shared packages

## Use Cases
- 🔒 Managing access control in Web3 applications
- 🔑 Securing private keys and wallets
- 📋 Implementing fine-grained authorization policies
- 🛡️ Building secure authentication systems

## Documentation Resources
- [Main Website](https://www.narval.xyz/)
- [Documentation](https://docs.narval.xyz/)

## License
Licensed under MPL 2.0 with comprehensive CI/CD pipelines for all components.

## Support
For issues and questions, refer to the project's GitHub repository and documentation.


===

My part
```bash
install go:
sudo apt update
sudo apt install golang-go
go install github.com/open-policy-agent/opa@latest

//

curl -L -o opa https://openpolicyagent.org/downloads/latest/opa_linux_amd64
chmod 755 opa
sudo mv opa /usr/local/bin/opa

make docker/up
make setup
```

========

# Test Transfer Tracking e2e

```bash
make armory/test/e2e/watch
```

## Add new tests

1. Add new test file in `apps/armory/src/transfer-tracking/core/service/__test__/e2e/transfer-tracking.service.spec.ts`. Add new test cases:
- describle('track', () => { ... })
- `it('creates multiple transfers for the same client', async () => { ... })`
- `it('handles transfer with zero amount', async () => { ... })`
- `it('handles transfer with negative amount', async () => { ... })`
- `it('handles transfers with multiple currencies rates', async () => { ... })`
- `it('handles batch processing of transfers', async () => { ... })`

- describle('findByClientId', () => { ... })
- `it('returns empty array for non-existent client', async () => { ... })`
- `it('correctly orders transfers by creation date', async () => { ... })`
- `it('returns all transfers for a client with high volume', async () => { ... })`
- `it('handles transfer across multiple chains for the same client', async () => { ... })`
- `it('handles transfer with different timezone', async () => { ... })`


