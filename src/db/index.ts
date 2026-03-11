import Database from 'better-sqlite3';
import { Logger } from '../utils/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const logger = new Logger('database');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/omni.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export function initDb(): Database.Database {
  if (db) {
    logger.warn('Database already initialized');
    return db;
  }

  try {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    
    logger.info(`Database initialized at ${DB_PATH}`);
    runMigrations();
    return db;
  } catch (error) {
    logger.error('Failed to initialize database', error);
    throw error;
  }
}

function runMigrations(): void {
  if (!db) return;

  logger.info('Running database migrations...');

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      model TEXT,
      mode TEXT DEFAULT 'normal',
      status TEXT DEFAULT 'active',
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      github_repo TEXT,
      config TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS operations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      action TEXT NOT NULL,
      params TEXT,
      result TEXT,
      status TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_operations_type ON operations(type);
    CREATE INDEX IF NOT EXISTS idx_operations_created ON operations(created_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
  `);

  logger.info('Database migrations completed');
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    logger.info('Database connection closed');
  }
}

export interface Session {
  id: string;
  created_at: string;
  updated_at: string;
  model: string | null;
  mode: string;
  status: string;
  metadata: string | null;
}

export interface Message {
  id: number;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  github_repo: string | null;
  config: string | null;
  created_at: string;
}

export interface Operation {
  id: number;
  type: string;
  action: string;
  params: string | null;
  result: string | null;
  status: string | null;
  created_at: string;
}

export const sessionDb = {
  create(session: Omit<Session, 'created_at' | 'updated_at'>): Session {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO sessions (id, model, mode, status, metadata)
      VALUES (@id, @model, @mode, @status, @metadata)
    `);
    stmt.run(session);
    return this.get(session.id)!;
  },

  get(id: string): Session | undefined {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
    return stmt.get(id) as Session | undefined;
  },

  getAll(): Session[] {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM sessions ORDER BY created_at DESC');
    return stmt.all() as Session[];
  },

  getActive(): Session[] {
    const db = getDb();
    const stmt = db.prepare("SELECT * FROM sessions WHERE status = 'active'");
    return stmt.all() as Session[];
  },

  update(id: string, updates: Partial<Session>): Session | undefined {
    const db = getDb();
    const fields = Object.keys(updates).filter(k => k !== 'id' && k !== 'created_at');
    if (fields.length === 0) return this.get(id);
    
    const setClause = fields.map(f => `${f} = @${f}`).join(', ');
    const stmt = db.prepare(`UPDATE sessions SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`);
    stmt.run({ ...updates, id });
    return this.get(id);
  },

  delete(id: string): boolean {
    const db = getDb();
    const stmt = db.prepare('DELETE FROM sessions WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
};

export const messageDb = {
  create(message: Omit<Message, 'id' | 'created_at'>): Message {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO messages (session_id, role, content)
      VALUES (@session_id, @role, @content)
    `);
    stmt.run(message);
    const last = db.prepare('SELECT last_insert_rowid() as id').get() as { id: number };
    return { ...message, id: last.id, created_at: new Date().toISOString() };
  },

  getBySession(sessionId: string): Message[] {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC');
    return stmt.all(sessionId) as Message[];
  },

  getRecent(sessionId: string, limit: number = 50): Message[] {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?');
    return (stmt.all(sessionId, limit) as Message[]).reverse();
  },

  deleteBySession(sessionId: string): number {
    const db = getDb();
    const stmt = db.prepare('DELETE FROM messages WHERE session_id = ?');
    const result = stmt.run(sessionId);
    return result.changes;
  }
};

export const projectDb = {
  create(project: Omit<Project, 'created_at'>): Project {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO projects (id, name, path, github_repo, config)
      VALUES (@id, @name, @path, @github_repo, @config)
    `);
    stmt.run(project);
    return this.get(project.id)!;
  },

  get(id: string): Project | undefined {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM projects WHERE id = ?');
    return stmt.get(id) as Project | undefined;
  },

  getAll(): Project[] {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM projects ORDER BY created_at DESC');
    return stmt.all() as Project[];
  },

  update(id: string, updates: Partial<Project>): Project | undefined {
    const db = getDb();
    const fields = Object.keys(updates).filter(k => k !== 'id' && k !== 'created_at');
    if (fields.length === 0) return this.get(id);
    
    const setClause = fields.map(f => `${f} = @${f}`).join(', ');
    const stmt = db.prepare(`UPDATE projects SET ${setClause} WHERE id = @id`);
    stmt.run({ ...updates, id });
    return this.get(id);
  },

  delete(id: string): boolean {
    const db = getDb();
    const stmt = db.prepare('DELETE FROM projects WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
};

export const operationDb = {
  create(operation: Omit<Operation, 'id' | 'created_at'>): Operation {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO operations (type, action, params, result, status)
      VALUES (@type, @action, @params, @result, @status)
    `);
    stmt.run(operation);
    const last = db.prepare('SELECT last_insert_rowid() as id').get() as { id: number };
    return { ...operation, id: last.id, created_at: new Date().toISOString() };
  },

  getByType(type: string, limit: number = 100): Operation[] {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM operations WHERE type = ? ORDER BY created_at DESC LIMIT ?');
    return stmt.all(type, limit) as Operation[];
  },

  getRecent(limit: number = 100): Operation[] {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM operations ORDER BY created_at DESC LIMIT ?');
    return stmt.all(limit) as Operation[];
  },

  update(id: string, updates: Partial<Operation>): void {
    const db = getDb();
    const fields = Object.keys(updates).filter(k => k !== 'id' && k !== 'created_at');
    if (fields.length === 0) return;
    
    const setClause = fields.map(f => `${f} = @${f}`).join(', ');
    const stmt = db.prepare(`UPDATE operations SET ${setClause} WHERE id = @id`);
    stmt.run({ ...updates, id });
  }
};
