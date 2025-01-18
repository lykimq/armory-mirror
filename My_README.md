# Narval/Armory Development Guide

## Overview
Narval/Armory is an open-source Web3 access management system that provides:
- ⚡️ Secure authentication & fine-grained authorization
- 🔐 Private key & wallet management
- 🌐 Web3-native policy engine
- 🛠 Flexible authentication framework

## Prerequisites
- Node.js 21+
- Docker
- Go (for OPA)
- OPA CLI

## Installation

### 1. Install Dependencies
```bash
# Install Go
sudo apt update
sudo apt install golang-go
go install github.com/open-policy-agent/opa@latest

# Install OPA CLI
curl -L -o opa https://openpolicyagent.org/downloads/latest/opa_linux_amd64
chmod 755 opa
sudo mv opa /usr/local/bin/opa

# Install Regal (for policy testing)
curl -L -o regal https://github.com/StyraInc/regal/releases/latest/download/regal_Linux_x86_64
chmod +x regal
sudo mv regal /usr/local/bin/
```

### 2. Project Setup
```bash
# Clone repository
git clone git@github.com:narval-xyz/narval.git
cd narval

# Setup project
make setup
```

## Development

### Running the Project

**Option 1: Dependencies Only**
```bash
make docker/up     # Start dependencies
make docker/stop   # Stop when done
```

**Option 2: Full Stack**
```bash
make docker/stack/build   # Build dev image
make docker/stack/up      # Start stack
make docker/stop         # Stop when done
```

### Testing

#### Transfer Tracking Tests
```bash
make armory/test/e2e/watch
```
Location: `apps/armory/src/transfer-tracking/core/service/__test__/e2e/`

Add new tests to `transfer-tracking.spec.ts`.
Key test suites:
- Transfer tracking operations
- Client-based queries
- Multi-currency handling
- Cross-chain transfers
- Timezone management


#### Policy Engine Tests
```bash
make policy-engine/setup
make policy-engine/test/e2e/watch
```
Location: `apps/policy-engine/src/engine/__test__/e2e/*.spec.ts`

##### Add new tests to `client.spec.ts`

##### Concurrent Client Creation Test Results

The system was tested with 50 concurrent requests creating clients with the same clientId to evaluate race condition handling:

```
Current concurrent behavior:
Total requests: 50
Successful creations: 4
Failed creations: 46
Other errors: 0
```

**Analysis:**
- Multiple successful creations (4) were observed for the same clientId
- This indicates a race condition in concurrent request handling
- Each successful creation generated a unique client secret

**Current Limitations:**
1. No proper concurrency control for client creation
2. Multiple valid client secrets can exist for the same clientId
3. Potential security and consistency implications

**Expected Behavior:**
- Only one request should succeed
- All other requests should fail with "Client already exist" error
- Single client secret per clientId

**Future Improvements Needed:**
1. Implement proper database-level constraints
2. Add transaction-level isolation
3. Improve error handling for concurrent requests
4. Consider implementing request queuing or rate limiting

##### Rate Limit Test Results

The system was tested with different batch sizes to evaluate its rate limiting behavior:

**Small Batch (5 requests)**
```
Batch Size: 5
✅ Successful requests: 5
❌ Rate limited requests: 0
❌ Dropped requests: 0
Success rate: 100%
```
Analysis: System handles small batches perfectly with no rate limiting or drops.

**Medium Batch (15 requests)**
```
Batch Size: 15
✅ Successful requests: 0
❌ Rate limited requests: 9
❌ Dropped requests: 6
Success rate: 0%
```
Analysis:
- System becomes overwhelmed
- 60% of requests hit rate limits
- 40% of connections are reset
- Indicates need for request throttling at this level

**Large Batch (40 requests)**
```
Batch Size: 40
✅ Successful requests: 0
❌ Rate limited requests: 34
❌ Dropped requests: 6
Success rate: 0%
```
Analysis:
- System protection mechanisms fully engaged
- 85% of requests rate limited
- 15% connection drops
- Demonstrates effective protection against potential DoS scenarios

Recommendations:
1. Implement client-side throttling for batches > 5 requests
2. Consider adding request queuing for medium-sized batches
3. Monitor connection resets to optimize network settings