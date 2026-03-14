import Database from 'better-sqlite3';
import { Logger } from '../utils/logger.js';
import { eventBus, SystemEvents } from './eventBus.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface Memory {
  id: number;
  content: string;
  tags: string[];
  metadata?: Record<string, unknown>;
  importance: number;
  createdAt: Date;
  accessedAt: Date;
  accessCount: number;
}

export interface MemorySearchOptions {
  tags?: string[];
  limit?: number;
  offset?: number;
  minImportance?: number;
}

export class MemorySystem {
  private logger: Logger;
  private db: Database.Database;

  constructor(dbPath?: string) {
    this.logger = new Logger('Memory');
    const defaultPath = path.join(__dirname, '../../data/memory.db');
    this.db = new Database(dbPath || defaultPath);
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        tags TEXT NOT NULL,
        metadata TEXT,
        importance INTEGER DEFAULT 5,
        created_at TEXT NOT NULL,
        accessed_at TEXT NOT NULL,
        access_count INTEGER DEFAULT 0
      );
      
      CREATE INDEX IF NOT EXISTS idx_memories_tags ON memories(tags);
      CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);
      CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);
    `);
    this.logger.info('Memory system initialized');
  }

  store(content: string, tags: string[], metadata?: Record<string, unknown>, importance: number = 5): number {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO memories (content, tags, metadata, importance, created_at, accessed_at, access_count)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `);
    
    const result = stmt.run(
      content,
      JSON.stringify(tags),
      metadata ? JSON.stringify(metadata) : null,
      importance,
      now,
      now
    );

    const memoryId = Number(result.lastInsertRowid);
    this.logger.info(`Stored memory ${memoryId} with tags: ${tags.join(', ')}`);
    
    eventBus.publish(SystemEvents.MEMORY_STORED, { id: memoryId, tags, importance });
    
    return memoryId;
  }

  retrieve(id: number): Memory | null {
    const stmt = this.db.prepare('SELECT * FROM memories WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    
    if (!row) return null;

    const memory = this.rowToMemory(row);
    this.updateAccess(id);
    
    eventBus.publish(SystemEvents.MEMORY_RETRIEVED, { id, tags: memory.tags });
    
    return memory;
  }

  search(options: MemorySearchOptions = {}): Memory[] {
    const { tags, limit = 10, offset = 0, minImportance = 0 } = options;
    
    let query = 'SELECT * FROM memories WHERE importance >= ?';
    const params: unknown[] = [minImportance];

    if (tags && tags.length > 0) {
      const tagConditions = tags.map(() => 'tags LIKE ?').join(' OR ');
      query += ` AND (${tagConditions})`;
      tags.forEach(tag => params.push(`%${tag}%`));
    }

    query += ' ORDER BY importance DESC, access_count DESC, accessed_at DESC';
    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as Record<string, unknown>[];

    return rows.map(row => this.rowToMemory(row));
  }

  getRelated(id: number, limit: number = 5): Memory[] {
    const memory = this.retrieve(id);
    if (!memory) return [];

    return this.search({ tags: memory.tags, limit, minImportance: 3 });
  }

  update(id: number, updates: Partial<Pick<Memory, 'content' | 'tags' | 'importance'>>): boolean {
    const memory = this.retrieve(id);
    if (!memory) return false;

    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (updates.content !== undefined) {
      setClauses.push('content = ?');
      params.push(updates.content);
    }
    if (updates.tags !== undefined) {
      setClauses.push('tags = ?');
      params.push(JSON.stringify(updates.tags));
    }
    if (updates.importance !== undefined) {
      setClauses.push('importance = ?');
      params.push(updates.importance);
    }

    if (setClauses.length === 0) return false;

    setClauses.push('accessed_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    const query = `UPDATE memories SET ${setClauses.join(', ')} WHERE id = ?`;
    const stmt = this.db.prepare(query);
    
    return stmt.run(...params).changes > 0;
  }

  delete(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM memories WHERE id = ?');
    return stmt.run(id).changes > 0;
  }

  getStats(): { total: number; avgImportance: number; mostAccessed: Memory | null; topTags: string[] } {
    const total = this.db.prepare('SELECT COUNT(*) as count FROM memories').get() as { count: number };
    const avgImportance = this.db.prepare('SELECT AVG(importance) as avg FROM memories').get() as { avg: number };
    const mostAccessed = this.db.prepare('SELECT * FROM memories ORDER BY access_count DESC LIMIT 1').get() as Record<string, unknown> | undefined;

    const tagCounts = new Map<string, number>();
    const allMemories = this.db.prepare('SELECT tags FROM memories').all() as { tags: string }[];
    allMemories.forEach(row => {
      const tags = JSON.parse(row.tags) as string[];
      tags.forEach(tag => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    });

    const topTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag]) => tag);

    return {
      total: total.count,
      avgImportance: avgImportance.avg || 0,
      mostAccessed: mostAccessed ? this.rowToMemory(mostAccessed) : null,
      topTags,
    };
  }

  private updateAccess(id: number): void {
    const stmt = this.db.prepare(`
      UPDATE memories 
      SET access_count = access_count + 1, accessed_at = ? 
      WHERE id = ?
    `);
    stmt.run(new Date().toISOString(), id);
  }

  private rowToMemory(row: Record<string, unknown>): Memory {
    return {
      id: row.id as number,
      content: row.content as string,
      tags: JSON.parse(row.tags as string),
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
      importance: row.importance as number,
      createdAt: new Date(row.created_at as string),
      accessedAt: new Date(row.accessed_at as string),
      accessCount: row.access_count as number,
    };
  }

  close(): void {
    this.db.close();
    this.logger.info('Memory system closed');
  }
}

export const memorySystem = new MemorySystem();
