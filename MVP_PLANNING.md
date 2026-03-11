# Omni-Server-Frame MVP Planning Document

**Created:** 2026-03-11
**Last Updated:** 2026-03-11
**Status:** PLANNING PHASE

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis](#2-current-state-analysis)
3. [Available Resources](#3-available-resources)
4. [MVP Vision](#4-mvp-vision)
5. [Architecture Design](#5-architecture-design)
6. [Feature Specifications](#6-feature-specifications)
7. [Implementation Phases](#7-implementation-phases)
8. [Technical Decisions](#8-technical-decisions)
9. [Database Schema](#9-database-schema)
10. [API Design](#10-api-design)
11. [Risk Assessment](#11-risk-assessment)
12. [Timeline Estimate](#12-timeline-estimate)

---

## 1. Executive Summary

### What We're Building

An AI-powered development platform that combines:
- **Full GitHub Account Control** via gh CLI and REST API
- **Kilo Code AI Agent** integration via ACP protocol
- **Persistent Server Architecture** with PM2
- **Interactive Controls** via REST API and WebSocket

### The Big Picture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          OMNI-SERVER-FRAME MVP                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────┐    ┌──────────────────┐    ┌─────────────────────────┐ │
│   │   Client    │───▶│   Omni Server   │───▶│  GitHub (gh + git)      │ │
│   │  (REST/WS)  │◀────│   (Express +   │◀────│  - Full account access  │ │
│   │             │     │    WebSocket)   │     │  - Repo management      │ │
│   └─────────────┘    └────────┬─────────┘    │  - Issues, PRs, releases│ │
│                               │               └─────────────────────────┘ │
│                               │                                             │
│                       ┌──────▼───────┐                                    │
│                       │   Kilo AI    │                                    │
│                       │  (via ACP)   │                                    │
│                       │  - Code AI   │                                    │
│                       │  - Tools     │                                    │
│                       └──────────────┘                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Achievement to Date

**Git push now works via REST API** - no more bash timeout issues!

---

## 2. Current State Analysis

### What's Working ✅

| Component | Status | Notes |
|-----------|--------|-------|
| **PM2 Server** | ✅ Running | Persists across bash timeouts |
| **Express Server** | ✅ Running | localhost:3000 |
| **WebSocket Server** | ✅ Running | Real-time Kilo communication |
| **Git Operations** | ✅ Working | simple-git inside Node.js |
| **GitHub CLI (gh)** | ✅ Authenticated | Full account access |
| **SSH Authentication** | ✅ Configured | Port 443 (ssh.github.com) |

### Current Endpoints

```
GET  /health              - Server health check
POST /api/git/push       - Push to GitHub
POST /api/git/pull       - Pull from GitHub
POST /api/git/commit     - Commit changes
GET  /api/git/status     - Check git status
GET  /api/git/branch     - View branch
GET  /api/git/log        - View commit history

POST /api/session        - Create Kilo session (placeholder)
WS   /ws?sessionId=xxx  - WebSocket for Kilo ACP
```

### What Was Solved

| Problem | Solution |
|---------|----------|
| Git push timeout | simple-git runs git inside Node.js |
| Server dies on bash timeout | PM2 runs as daemon |
| Limited GitHub access | gh CLI authenticated with full scopes |

### What Remains

| Feature | Status |
|---------|--------|
| Full GitHub API integration | Not implemented |
| Kilo ACP session management | Basic (not fully functional) |
| Database/persistence | Not implemented |
| Prompt injection engine | Not implemented |
| Authentication | Not implemented |

---

## 3. Available Resources

### 3.1 GitHub Access (FULL)

**Authentication:**
- gh CLI authenticated as `All-Vice`
- Full token scopes: admin:repo, delete_repo, gist, codespace, workflow, etc.
- SSH key: `~/.ssh/github-agent-deploykey`

**Available Operations:**
- Repository: create, clone, list, view, delete, fork
- Issues: create, list, view, close, reopen, comment
- Pull Requests: create, list, view, merge, close, review
- Releases: create, list, view, delete
- Gists: create, list, view, delete
- Actions: run list, view, rerun, cancel
- Search: repos, issues, prs
- API: Full REST API access

### 3.2 Kilo Code Integration

**Kilo Location:**
- Binary: `/home/vincent/.nvm/versions/node/v24.13.1/bin/kilo`
- Version: 7.0.38
- Data: `/home/vincent/.local/share/kilo/`

**ACP Protocol:**
- Transport: stdio + JSON-RPC
- Session methods: initialize, session/new, session/prompt, session/update
- Can spawn via: `kilo acp --port <port>`

### 3.3 Server Infrastructure

**Runtime:**
- Node.js with TypeScript
- Express.js (web framework)
- WebSocket (ws library)
- PM2 (process manager)
- simple-git (git operations)
- Pino (logging)

**Architecture:**
- REST API for operations
- WebSocket for real-time streaming
- Kilo subprocess spawned per session

### 3.4 Context Files Available

| File | Purpose |
|------|---------|
| `AGENTS.md` | Full protocol research (ACP, MCP, A2A) |
| `server-foundations.md` | Server architecture patterns |
| `protocol-reference.md` | Quick protocol lookup |
| `GITHUB_CLI_COMPLETE_REFERENCE.txt` | Full gh reference |
| `OMNI-SERVER-FRAME-DOCUMENTATION.txt` | Technical docs |

---

## 4. MVP Vision

### 4.1 Definition

**MVP (Minimum Viable Product):** An AI-powered GitHub development assistant that can:
1. Execute GitHub operations via REST API (not just git)
2. Use Kilo AI to assist with coding tasks
3. Stream AI responses in real-time
4. Maintain session context

### 4.2 Target Users

- Developers who want AI-assisted GitHub management
- Teams wanting automated development workflows
- Users who need persistent AI agent sessions

### 4.3 Core Value Proposition

| Before | After |
|--------|-------|
| Manual GitHub operations | AI can manage repos, issues, PRs |
| Short-lived AI chats | Persistent AI sessions |
| Bash timeouts | Reliable server architecture |
| Separate tools | Unified platform |

### 4.4 Feature Priority

**P0 (Must Have):**
1. Full GitHub API integration (repos, issues, PRs)
2. Working Kilo ACP session management
3. WebSocket streaming
4. Basic session persistence

**P1 (Should Have):**
1. Prompt injection engine
2. Model/mode switching
3. Authentication
4. Error handling

**P2 (Nice to Have):**
1. Docker containerization
2. TLS/HTTPS
3. Multi-user support
4. Analytics

---

## 5. Architecture Design

### 5.1 System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                   │
│                                                                             │
│   ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐ │
│   │  REST API Client   │  │  WebSocket Client  │  │   Interactive Menu  │ │
│   │  (curl/http)       │  │  (ws://)           │  │   (kilo-menu.sh)    │ │
│   └─────────────────────┘  └─────────────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            SERVER LAYER                                    │
│                                                                             │
│   ┌───────────────────────────────────────────────────────────────────────┐ │
│   │                         OMNI-SERVER-FRAME                             │ │
│   │                        (Express + WebSocket)                         │ │
│   │                                                                        │ │
│   │  ┌─────────────────────────────────────────────────────────────────┐  │ │
│   │  │                     ROUTING LAYER                               │  │ │
│   │  │                                                                  │  │ │
│   │  │  /api/github/*     - GitHub API integration                   │  │ │
│   │  │  /api/git/*        - Git file operations                       │  │ │
│   │  │  /api/session/*    - Session management                         │  │ │
│   │  │  /api/ai/*         - AI operations                              │  │ │
│   │  │  /ws               - WebSocket streaming                        │  │ │
│   │  │                                                                  │  │ │
│   │  └─────────────────────────────────────────────────────────────────┘  │ │
│   │                                                                        │ │
│   │  ┌─────────────────────────────────────────────────────────────────┐  │ │
│   │  │                    SERVICE LAYER                                 │  │ │
│   │  │                                                                  │  │ │
│   │  │  GitHubService     - gh CLI wrapper                            │  │ │
│   │  │  GitService        - simple-git operations                     │  │ │
│   │  │  SessionService    - Kilo ACP session management               │  │ │
│   │  │  AIService         - AI prompt handling                        │  │ │
│   │  │  ConfigService     - Configuration management                   │  │ │
│   │  │                                                                  │  │ │
│   │  └─────────────────────────────────────────────────────────────────┘  │ │
│   │                                                                        │ │
│   │  ┌─────────────────────────────────────────────────────────────────┐  │ │
│   │  │                   DATA LAYER (SQLite)                           │  │ │
│   │  │                                                                  │  │ │
│   │  │  sessions       - AI session data                               │  │ │
│   │  │  messages       - Chat history                                  │  │ │
│   │  │  projects       - Project configurations                        │  │ │
│   │  │  operations     - Operation logs                                │  │ │
│   │  │                                                                  │  │ │
│   │  └─────────────────────────────────────────────────────────────────┘  │ │
│   │                                                                        │ │
│   └───────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL SERVICES                                  │
│                                                                             │
│   ┌──────────────────────────┐    ┌──────────────────────────────────────┐  │
│   │      KILO CODE           │    │           GITHUB                     │  │
│   │      (via ACP)           │    │           (gh CLI + git)            │  │
│   │                          │    │                                      │  │
│   │  - Code generation       │    │  - Repository management            │  │
│   │  - File editing          │    │  - Issues & PRs                     │  │
│   │  - Terminal commands     │    │  - Releases & Gists                 │  │
│   │  - Tool execution        │    │  - Actions                          │  │
│   │                          │    │  - Search                           │  │
│   └──────────────────────────┘    └──────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Data Flow

```
User Request
     │
     ▼
┌─────────────┐
│  Validation │ ───▶ 400 Bad Request
└─────────────┘
     │
     ▼
Authentication (if enabled)
     │
     ▼
┌─────────────┐
│  Route      │
└─────────────┘
     │
     ▼
┌─────────────┐
│  Service    │ ◀──▶ Database (SQLite)
└─────────────┘
     │
     ├──▶ Kilo ACP (if AI request)
     │
     ├──▶ GitHub API (if GitHub request)
     │
     └──▶ Git Operations (if git request)
     │
     ▼
Response
     │
     ▼
WebSocket Broadcast (if streaming)
```

### 5.3 Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **Routing** | Parse requests, route to services |
| **Services** | Business logic, orchestration |
| **Kilo ACP Client** | Spawn/manage Kilo subprocess |
| **GitHub Service** | Wrap gh CLI commands |
| **Git Service** | simple-git operations |
| **Database** | Persist sessions and history |
| **Logger** | Structured logging (Pino) |

---

## 6. Feature Specifications

### 6.1 GitHub API Integration

**Purpose:** Full GitHub account control via REST API

**Endpoints:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/github/repos` | List repositories |
| POST | `/api/github/repos` | Create repository |
| GET | `/api/github/repos/:owner/:repo` | Get repository |
| DELETE | `/api/github/repos/:owner/:repo` | Delete repository |
| GET | `/api/github/issues` | List issues |
| POST | `/api/github/issues` | Create issue |
| GET | `/api/github/pulls` | List pull requests |
| POST | `/api/github/pulls` | Create pull request |
| GET | `/api/github/releases` | List releases |
| POST | `/api/github/releases` | Create release |
| POST | `/api/github/gists` | Create gist |
| GET | `/api/github/search/repos` | Search repositories |

**Implementation:** Use `gh` CLI with JSON output parsing

### 6.2 Git File Operations

**Purpose:** Work with git repositories on local filesystem

**Existing Endpoints (Working):**
- `/api/git/status` - Check status
- `/api/git/commit` - Commit changes
- `/api/git/push` - Push to remote
- `/api/git/pull` - Pull from remote

**New Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/git/diff` | Show diff |
| POST | `/api/git/branch` | Create branch |
| POST | `/api/git/merge` | Merge branch |
| GET | `/api/git/remote` | Get remote info |

### 6.3 Kilo AI Session Management

**Purpose:** Control Kilo Code via ACP protocol

**Session Lifecycle:**
```
1. POST /api/session        → Spawn Kilo subprocess
2. Initialize               → Send ACP initialize
3. session/new              → Create new conversation
4. session/prompt           → Send user message
5. session/update (WS)      ← Receive streaming response
6. [Repeat 4-5]
7. DELETE /api/session/:id  → Kill subprocess
```

**Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/session` | Create session |
| GET | `/api/session/:id` | Get session info |
| DELETE | `/api/session/:id` | Terminate session |
| PUT | `/api/session/:id/model` | Switch model |
| PUT | `/api/session/:id/mode` | Switch mode |

**WebSocket Events:**
- `session:update` - Streaming response
- `session:end` - Turn completed
- `tool:call` - Tool invocation
- `tool:result` - Tool result

### 6.4 Prompt Injection Engine

**Purpose:** Modify prompts before sending to AI

**Features:**
- Prefix/suffix injection
- Conditional rules
- Per-project configuration

**Configuration:**
```json
{
  "injection": {
    "prefix": "You are working on project X...",
    "suffix": "Follow best practices.",
    "rules": [
      {
        "condition": "file:*.py",
        "prefix": "Use PEP 8 style..."
      }
    ]
  }
}
```

### 6.5 Session Persistence

**Purpose:** Store session history in database

**Features:**
- Save/load conversations
- Resume sessions
- Search history

---

## 7. Implementation Phases

### Phase 1: Foundation (Week 1)

**Goal:** Establish core infrastructure

**Tasks:**
- [ ] Set up SQLite database
- [ ] Create database schema
- [ ] Implement session storage
- [ ] Add structured logging

**Deliverables:**
- Database layer working
- Session persistence functional
- Logging configured

### Phase 2: GitHub API (Week 2)

**Goal:** Full GitHub integration

**Tasks:**
- [ ] Create GitHubService wrapper
- [ ] Implement repository endpoints
- [ ] Implement issues endpoints
- [ ] Implement PRs endpoints
- [ ] Implement releases endpoints

**Deliverables:**
- Full GitHub API coverage
- All gh commands accessible via REST

### Phase 3: Kilo Integration (Week 3)

**Goal:** Working AI sessions

**Tasks:**
- [ ] Fix Kilo ACP client
- [ ] Implement session lifecycle
- [ ] Add WebSocket streaming
- [ ] Handle tool calls

**Deliverables:**
- Kilo sessions work via API
- Real-time streaming functional

### Phase 4: Polish (Week 4)

**Goal:** Production readiness

**Tasks:**
- [ ] Add error handling
- [ ] Add authentication
- [ ] Add rate limiting
- [ ] Write tests
- [ ] Documentation

**Deliverables:**
- Production-ready server
- Complete documentation

---

## 8. Technical Decisions

### 8.1 Database: SQLite

**Why:**
- Simple, no external dependencies
- Built into Node.js (better-sqlite3)
- Good for single-server deployment
- Easy to back up (single file)

**Alternative Considered:**
- PostgreSQL - Overkill for MVP
- Redis - Good for caching, not primary storage

### 8.2 Process Management: PM2

**Why:**
- Solves bash timeout issue
- Industry standard
- Built-in logging
- Auto-restart

### 8.3 GitHub Integration: gh CLI

**Why:**
- Already authenticated
- Full API coverage
- Easy JSON output parsing
- Handles authentication

**Alternative:**
- Octokit (GitHub SDK) - Would need separate auth setup
- Direct REST calls - More work than needed

### 8.4 Kilo Integration: ACP over stdio

**Why:**
- Native protocol for Kilo
- Works locally (no network)
- Well-documented in AGENTS.md

**Challenge:**
- Kilo ACP not fully tested
- May need debugging

### 8.5 Logging: Pino

**Why:**
- Already in use
- Fast, low overhead
- JSON structured logging
- PM2 integration

---

## 9. Database Schema

### 9.1 Tables

```sql
-- Sessions table
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    model TEXT,
    mode TEXT,
    status TEXT DEFAULT 'active',
    metadata TEXT
);

-- Messages table
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT REFERENCES sessions(id),
    role TEXT NOT NULL,  -- 'user' or 'assistant'
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Projects table
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    github_repo TEXT,
    config TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Operations log
CREATE TABLE operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,  -- 'github', 'git', 'ai'
    action TEXT NOT NULL,
    params TEXT,
    result TEXT,
    status TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 9.2 Indexes

```sql
CREATE INDEX idx_messages_session ON messages(session_id);
CREATE INDEX idx_operations_type ON operations(type);
CREATE INDEX idx_operations_created ON operations(created_at);
```

---

## 10. API Design

### 10.1 REST API Summary

| Category | Endpoints |
|----------|-----------|
| **Health** | `GET /health` |
| **GitHub** | `/api/github/repos`, `/api/github/issues`, `/api/github/pulls`, etc. |
| **Git** | `/api/git/status`, `/api/git/commit`, `/api/git/push`, etc. |
| **Sessions** | `/api/session`, `/api/session/:id`, etc. |
| **Projects** | `/api/projects`, `/api/projects/:id` |

### 10.2 Response Format

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-03-11T12:00:00Z",
    "requestId": "abc-123"
  }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "GITHUB_API_ERROR",
    "message": "Failed to create repository",
    "details": { ... }
  },
  "meta": {
    "timestamp": "2026-03-11T12:00:00Z",
    "requestId": "abc-123"
  }
}
```

### 10.3 WebSocket Protocol

**Connection:**
```
ws://localhost:3000/ws?sessionId=<session-id>
```

**Outgoing Messages:**
```json
{
  "type": "prompt",
  "content": "Hello AI"
}
```

**Incoming Messages:**
```json
{
  "type": "update",
  "content": [{ "type": "text", "text": "Hello!" }],
  "stopReason": "stop"
}
```

---

## 11. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Kilo ACP unstable | High | Test thoroughly, add error handling |
| gh CLI rate limits | Medium | Add rate limiting, caching |
| Database corruption | Medium | Regular backups |
| Session memory leaks | Medium | Proper cleanup on session end |
| Network issues | Low | Graceful error handling |

---

## 12. Timeline Estimate

| Phase | Duration | Total |
|-------|----------|-------|
| Phase 1: Foundation | 1 week | 1 week |
| Phase 2: GitHub API | 1 week | 2 weeks |
| Phase 3: Kilo Integration | 1 week | 3 weeks |
| Phase 4: Polish | 1 week | 4 weeks |

**MVP Target:** 4 weeks

---

## Appendix A: File Structure

```
/mnt/c/Users/gungy/Omni-Server-Frame/
├── src/
│   ├── index.ts                 # Entry point
│   ├── app.ts                   # Express app setup
│   ├── db/
│   │   ├── index.ts             # Database initialization
│   │   └── migrations/          # SQL migrations
│   ├── services/
│   │   ├── github.ts            # GitHub API wrapper
│   │   ├── git.ts               # Git file operations
│   │   ├── session.ts           # Session management
│   │   ├── ai.ts                # AI prompt handling
│   │   └── config.ts            # Configuration
│   ├── routes/
│   │   ├── github.ts            # GitHub endpoints
│   │   ├── git.ts              # Git endpoints
│   │   ├── session.ts          # Session endpoints
│   │   └── projects.ts         # Project endpoints
│   ├── middleware/
│   │   ├── auth.ts              # Authentication
│   │   ├── validation.ts        # Request validation
│   │   └── error.ts             # Error handling
│   ├── websocket/
│   │   └── handler.ts           # WebSocket handlers
│   └── utils/
│       ├── logger.ts            # Pino logger
│       └── helpers.ts            # Utility functions
├── data/
│   └── omni.db                  # SQLite database
├── ecosystem.config.cjs         # PM2 config
├── package.json
└── tsconfig.json
```

---

## Appendix B: Dependencies

### Runtime
- express (4.21.x)
- ws (8.18.x)
- simple-git (3.x)
- better-sqlite3 (for SQLite)
- pino (logging)
- dotenv

### Dev
- typescript
- tsx
- @types/node
- @types/express
- @types/ws

---

## Appendix C: References

- Project Status: `~/.kilocode/rules/PROJECT_omni_server_frame.md`
- Technical Docs: `/mnt/c/Users/gungy/OMNI-SERVER-FRAME-DOCUMENTATION.txt`
- GitHub CLI Ref: `/mnt/c/Users/gungy/GITHUB_CLI_COMPLETE_REFERENCE.txt`
- Server Foundations: `~/.kilocode/rules/server-foundations.md`
- Protocol Research: `/mnt/c/Users/gungy/AGENTS.md`

---

*Document Version: 1.0*
*Last Updated: 2026-03-11*
*Status: PLANNING*
