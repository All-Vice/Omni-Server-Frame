# Omni-Server-Frame Technical Reference
## Implementation Details with Official Examples

**Created:** 2026-03-12
**Purpose:** Actual implementation details, code examples from official sources

---

## Table of Contents

1. [Redis + ioredis](#1-redis--ioredis)
2. [BullMQ](#2-bullmq)
3. [OpenTelemetry](#3-opentelemetry)
4. [GraphQL Apollo](#4-graph-apollo)
5. [gRPC](#5-grpc)
6. [Validation Libraries](#6-validation-libraries)
7. [Circuit Breaker](#7-circuit-breaker)
8. [Docker](#8-docker)
9. [Testing](#9-testing)

---

## 1. Redis + ioredis

### Official Sources
- Redis Documentation: https://redis.io/docs/
- ioredis GitHub: https://github.com/redis/ioredis

### Basic Connection
```javascript
const Redis = require("ioredis");

const redis = new Redis();
redis.set("mykey", "value");
redis.get("mykey").then(console.log);
```

### Connection Options
```javascript
const redis = new Redis({
  port: 6379,
  host: "127.0.0.1",
  password: "my-top-secret",
  db: 0,
});
```

### Pub/Sub
```javascript
const pub = new Redis();
const sub = new Redis();

sub.subscribe("channel");
sub.on("message", (channel, message) => {
  console.log(message);
});

pub.publish("channel", "Hello!");
```

### Cache-Aside Pattern
```javascript
async function getData(key, fetchFn) {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  
  const data = await fetchFn();
  await redis.set(key, JSON.stringify(data), "EX", 3600);
  return data;
}
```

---

## 2. BullMQ

### Official Source
- https://docs.bullmq.io/

### Basic Queue
```javascript
import { Queue, Worker } from 'bullmq';

const myQueue = new Queue('paint');

await myQueue.add('cars', { color: 'blue' });

const worker = new Worker('paint', async job => {
  console.log(`Processing job ${job.id}`);
}, { concurrency: 5 });
```

### Delayed Jobs
```javascript
await myQueue.add('reminder', { userId: 123 }, {
  delay: 60000,
  attempts: 3,
});
```

### Flows (Parent-Child)
```javascript
import { FlowProducer } from 'bullmq';

const flowProducer = new FlowProducer();

await flowProducer.add({
  name: 'parent-job',
  queueName: 'main',
  children: [
    { name: 'child-1', queueName: 'secondary', data: { step: 1 } },
    { name: 'child-2', queueName: 'secondary', data: { step: 2 } },
  ],
});
```

---

## 3. OpenTelemetry

### Official Source
- https://opentelemetry.io/docs/

### Node.js Setup
```javascript
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');

const sdk = new NodeSDK({
  serviceName: 'omni-server',
  instrumentations: [getNodeAutoInstrumentations()],
  traceExporter: new JaegerExporter(),
});

sdk.start();
```

### Custom Span
```javascript
const { trace } = require('@opentelemetry/api');
const tracer = trace.getTracer('omni-server');

function myOperation() {
  return tracer.startActiveSpan('my-operation', async (span) => {
    try {
      span.setAttribute('key', 'value');
      // do work
    } finally {
      span.end();
    }
  });
}
```

---

## 4. GraphQL (Apollo)

### Official Source
- https://www.apollographql.com/docs/apollo-server/

### Standalone Server
```javascript
const { ApolloServer, gql } = require('@apollo/server');
const { startStandaloneServer } = require('@apollo/server/standalone');

const typeDefs = gql`
  type Query {
    hello: String
  }
`;

const resolvers = { Query: { hello: () => 'Hello!' } };

const server = new ApolloServer({ typeDefs, resolvers });
const { url } = await startStandaloneServer(server);
```

### Express Integration
```javascript
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const express = require('express');

const app = express();
await server.start();

app.use('/graphql', express.json(), expressMiddleware(server));
```

### Schema-First Approach
```javascript
const typeDefs = gql`
  type User {
    id: ID!
    name: String!
    email: String!
  }

  type Query {
    users: [User!]!
    user(id: ID!): User
  }

  type Mutation {
    createUser(name: String!, email: String!): User!
  }
`;
```

---

## 5. gRPC

### Official Source
- https://grpc.io/docs/

### Protocol Buffer Definition
```protobuf
syntax = "proto3";

package omniserver;

service GitService {
  rpc Push(PushRequest) returns (PushResponse);
  rpc Pull(PullRequest) returns (stream PullResponse);
}

message PushRequest {
  string repo = 1;
  string branch = 2;
}

message PushResponse {
  bool success = 1;
  string message = 2;
}
```

### Node.js Server
```javascript
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const packageDefinition = protoLoader.loadSync('protos/omni.proto');
const proto = grpc.loadPackageDefinition(packageDefinition);

const server = new grpc.Server();

server.addService(proto.omniserver.GitService.service, {
  push: (call, callback) => {
    callback(null, { success: true, message: 'Pushed' });
  }
});

server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), () => {
  server.start();
});
```

---

## 6. Validation Libraries

### Zod (Recommended)
- https://zod.dev/

```javascript
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2),
  email: z.string().email(),
  age: z.number().optional(),
});

const result = UserSchema.parse(data);
```

### Joi
- https://joi.dev/

```javascript
const Joi = require('joi');

const schema = Joi.object({
  name: Joi.string().min(2).required(),
  email: Joi.string().email().required(),
});
```

---

## 7. Circuit Breaker

### Opossum
- https://nodeshift.dev/opossum/

```javascript
const CircuitBreaker = require('opossum');

const options = {
  timeout: 3000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
};

const breaker = new CircuitBreaker(failureProneFunction, options);

breaker.fire()
  .then(console.log)
  .catch(err => console.error('Circuit open:', err));
```

### Resilience4j Pattern
```javascript
const { CircuitBreaker } = require('resiliencejs');

const circuitBreaker = new CircuitBreaker(fallback, {
  failureThreshold: 50,
  timeout: 30000,
  resetTimeout: 30000,
});
```

---

## 8. Docker

### Node.js Dockerfile
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

USER node

CMD ["node", "src/index.js"]
```

### docker-compose.yml
```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

### Multi-stage Build
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
CMD ["node", "dist/index.js"]
```

---

## 9. Testing

### Jest Setup
```javascript
// jest.config.js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js'],
  coverageDirectory: 'coverage',
};
```

### Unit Test Example
```javascript
describe('UserService', () => {
  it('should create a user', async () => {
    const user = await UserService.create({
      name: 'Test',
      email: 'test@example.com'
    });
    expect(user.id).toBeDefined();
  });
});
```

### Supertest (Integration)
```javascript
const request = require('supertest');
const app = require('../src/index');

describe('API', () => {
  it('GET /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
```

---

## Package Quick Reference

| Package | Install | Purpose |
|---------|---------|---------|
| ioredis | `npm i ioredis` | Redis client |
| bullmq | `npm i bullmq` | Job queue |
| @opentelemetry/sdk-node | `npm i @opentelemetry/sdk-node` | Observability |
| @apollo/server | `npm i @apollo/server graphql` | GraphQL |
| @grpc/grpc-js | `npm i @grpc/grpc-js` | gRPC |
| @grpc/proto-loader | `npm i @grpc/proto-loader` | Proto files |
| zod | `npm i zod` | Validation |
| opossum | `npm i opossum` | Circuit breaker |
| jest | `npm i -D jest` | Testing |
| supertest | `npm i -D supertest` | API testing |

---

*Implementation reference with official examples*
*Last Updated: 2026-03-12*
