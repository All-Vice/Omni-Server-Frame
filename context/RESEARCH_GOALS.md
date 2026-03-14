# Omni-Server-Frame Research Goals
## Planning Document - What to Learn Next

**Created:** 2026-03-12
**Purpose:** Industry-standard server patterns to research and implement

---

## 1. Architecture Patterns to Research

### 1.1 Clean Architecture / Layered Architecture
- **What:** Separation of concerns (routes → controllers → services → repositories)
- **Current:** Express routes directly call services
- **Need:** Define proper layer boundaries
- **Priority:** HIGH

### 1.2 Dependency Injection
- **What:** Invert dependencies, use interfaces
- **Current:** Direct require/import
- **Need:** DI container (e.g., inversify, tsyringe)
- **Priority:** MEDIUM

### 1.3 Repository Pattern
- **What:** Abstract database access behind interfaces
- **Current:** Direct SQLite calls in routes
- **Need:** Repository layer for data access
- **Priority:** HIGH

### 1.4 Service Layer Pattern
- **What:** Business logic in services, not controllers
- **Current:** Mixed in routes
- **Need:** Extract business logic
- **Priority:** HIGH

---

## 2. Reliability Patterns to Research

### 2.1 Circuit Breaker
- **What:** Prevent cascade failures by failing fast
- **Library:** opossum
- **Priority:** HIGH

### 2.2 Retry with Exponential Backoff
- **What:** Automatic retries with increasing delays
- **Library:** retry, async-retry
- **Priority:** HIGH

### 2.3 Bulkhead Pattern
- **What:** Isolate resources per operation
- **Priority:** MEDIUM

### 2.4 Graceful Shutdown
- **What:** Clean up connections on SIGTERM
- **Current:** Basic SIGTERM handling exists
- **Need:** Improve cleanup sequence
- **Priority:** HIGH

### 2.5 Health Check Patterns
- **What:** Liveness + readiness probes
- **Current:** /health endpoint exists
- **Need:** Deep health checks (dependencies)
- **Priority:** HIGH

---

## 3. Performance Patterns to Research

### 3.1 Caching Strategy
- **Patterns:** Cache-aside, Write-through, Write-behind
- **Current:** None
- **Need:** Redis integration first (see separate research)
- **Priority:** HIGH

### 3.2 Rate Limiting (Distributed)
- **What:** Rate limit across multiple instances
- **Current:** In-memory only
- **Need:** Redis-backed rate limiting
- **Priority:** HIGH

### 3.3 Connection Pooling
- **What:** Reuse database connections
- **Current:** SQLite (not applicable)
- **Need:** When adding PostgreSQL
- **Priority:** MEDIUM

### 3.4 Response Compression
- **What:** gzip/deflate responses
- **Library:** express-compression
- **Priority:** LOW

---

## 4. API Design Patterns to Research

### 4.1 API Versioning
- **What:** /v1/, /v2/ in URLs
- **Current:** None
- **Need:** Strategy for breaking changes
- **Priority:** MEDIUM

### 4.2 Request Validation
- **What:** Validate input with schemas
- **Libraries:** zod, joi, express-validator
- **Priority:** HIGH

### 4.3 Error Handling Standardization
- **What:** Consistent error response format
- **Current:** Ad-hoc
- **Need:** Standardized error codes + messages
- **Priority:** HIGH

### 4.4 API Documentation
- **What:** OpenAPI/Swagger specs
- **Library:** swagger-ui-express, openapi-types
- **Priority:** MEDIUM

---

## 5. Security Patterns to Research

### 5.1 Input Sanitization
- **What:** Prevent injection attacks
- **Libraries:** DOMPurify, express-validator
- **Priority:** HIGH

### 5.2 Security Headers
- **What:** Helmet, CSP, HSTS
- **Current:** Partial (helmet)
- **Need:** Complete security headers
- **Priority:** HIGH

### 5.3 Rate Limiting per User
- **What:** Authenticated user limits
- **Current:** IP-based only
- **Need:** User-based rate limits
- **Priority:** MEDIUM

### 5.4 API Keys Management
- **What:** Rotate, revoke, audit
- **Current:** Basic API key
- **Need:** Full API key lifecycle
- **Priority:** MEDIUM

---

## 6. Observability Patterns to Research

### 6.1 Structured Logging
- **What:** JSON logs with context
- **Current:** Pino (basic)
- **Need:** Correlation IDs, context propagation
- **Priority:** HIGH

### 6.2 Distributed Tracing
- **What:** Trace requests across services
- **Current:** None
- **Need:** OpenTelemetry (see separate research)
- **Priority:** HIGH

### 6.3 Metrics Collection
- **What:** Prometheus metrics
- **Current:** None
- **Need:** Custom metrics + export
- **Priority:** MEDIUM

### 6.4 Alerting
- **What:** Notify on failures
- **Current:** None
- **Need:** Alert rules + channels
- **Priority:** LOW

---

## 7. Deployment Patterns to Research

### 7.1 Containerization
- **What:** Dockerize the application
- **Current:** PM2 only
- **Need:** Dockerfile + docker-compose
- **Priority:** HIGH

### 7.2 Environment Configuration
- **What:** .env management, secrets
- **Current:** dotenv (basic)
- **Need:** Secret rotation, env validation
- **Priority:** MEDIUM

### 7.3 Zero-Downtime Deployments
- **What:** Rolling updates, blue-green
- **Current:** PM2 reload
- **Need:** Proper deployment strategy
- **Priority:** MEDIUM

---

## 8. Testing Patterns to Research

### 8.1 Unit Testing
- **What:** Test individual functions
- **Current:** None
- **Need:** Jest/Vitest setup
- **Priority:** HIGH

### 8.2 Integration Testing
- **What:** Test API endpoints
- **Current:** None
- **Need:** Supertest, test database
- **Priority:** HIGH

### 8.3 E2E Testing
- **What:** Full flow testing
- **Current:** None
- **Need:** Playwright/Cypress
- **Priority:** LOW

---

## 9. Comparison: Current vs Industry Standard

| Aspect | Current State | Industry Standard | Gap |
|--------|---------------|-------------------|-----|
| Architecture | Flat (routes call services) | Layered (clean arch) | HIGH |
| Validation | Ad-hoc | Schema-based (zod) | HIGH |
| Error Handling | Inconsistent | Standardized | HIGH |
| Logging | Basic JSON | Structured + correlation | MEDIUM |
| Caching | None | Redis cache-aside | HIGH |
| Rate Limiting | In-memory | Distributed (Redis) | HIGH |
| Health Checks | Basic /health | Deep checks | MEDIUM |
| Circuit Breaker | None | Required | HIGH |
| API Docs | None | OpenAPI | MEDIUM |
| Docker | None | Standard | HIGH |
| Testing | None | Unit + Integration | HIGH |

---

## 10. Research Priority Order

### Phase 1: Foundation (This Week)
1. [ ] Clean Architecture pattern
2. [ ] Request validation (zod)
3. [ ] Error handling standardization
4. [ ] Docker setup

### Phase 2: Reliability (This Month)
5. [ ] Circuit breaker
6. [ ] Retry with backoff
7. [ ] Graceful shutdown improvement
8. [ ] Distributed rate limiting

### Phase 3: Observability (This Quarter)
9. [ ] Structured logging with correlation
10. [ ] OpenTelemetry integration
11. [ ] Metrics collection
12. [ ] Health check improvements

### Phase 4: Testing (Ongoing)
13. [ ] Unit testing setup
14. [ ] Integration testing
15. [ ] E2E (when applicable)

### Phase 5: Advanced (Later)
16. [ ] API versioning
17. [ ] API documentation
18. [ ] Dependency injection
19. [ ] Repository pattern
20. [ ] Connection pooling

---

## 11. Questions to Answer Next

1. Which architecture pattern fits best? (Clean vs Hexagonal vs Feature-based)
2. Should we use TypeScript? (Currently plain JS)
3. Which validation library? (zod vs joi vs superstruct)
4. Docker-first or PM2-first?
5. How to handle secrets in Docker?

---

## 12. Action Items

- [ ] Research Clean Architecture patterns
- [ ] Research zod vs joi for validation
- [ ] Research Docker best practices for Node.js
- [ ] Research circuit breaker libraries
- [ ] Create implementation plan for Phase 1

---

*Planning document - Research actual implementation details separately*
