import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';
import { Logger } from '../utils/logger.js';

export class GitService {
  private git: SimpleGit;
  private logger: Logger;

  constructor(repoPath: string) {
    const options: Partial<SimpleGitOptions> = {
      baseDir: repoPath,
      binary: 'git',
      maxConcurrentProcesses: 6,
    };
    
    this.git = simpleGit(options);
    this.logger = new Logger('git-service');
  }

  async status(): Promise<{ current: string | null, tracking: string | null, files: string[], modified: string[], not_added: string[], ahead: number, behind: number }> {
    const status = await this.git.status();
    return {
      current: status.current,
      tracking: status.tracking,
      files: status.files,
      modified: status.modified,
      not_added: status.not_added,
      ahead: status.ahead,
      behind: status.behind
    };
  }

  async add(files: string | string[] = '.'): Promise<string> {
    return this.git.add(files);
  }

  async commit(message: string): Promise<string> {
    const result = await this.git.commit(message);
    return result.commit;
  }

  async push(remote: string = 'origin', branch: string = 'main'): Promise<string> {
    this.logger.info(`Pushing to ${remote}/${branch}...`);
    const result = await this.git.push(remote, branch);
    this.logger.info(`Push complete: ${JSON.stringify(result)}`);
    return JSON.stringify(result);
  }

  async pull(remote: string = 'origin', branch: string = 'main'): Promise<string> {
    this.logger.info(`Pulling from ${remote}/${branch}...`);
    const result = await this.git.pull(remote, branch);
    this.logger.info(`Pull complete: ${JSON.stringify(result)}`);
    return JSON.stringify(result);
  }

  async log(maxCount: number = 10): Promise<string[]> {
    const result = await this.git.log({ maxCount });
    return result.all.map(c => `${c.hash.substring(0,7)} - ${c.message} (${c.date})`);
  }

  async branch(): Promise<{ current: string, all: string[], branches: Record<string, { current: boolean, name: string }> }> {
    const result = await this.git.branch();
    return {
      current: result.current,
      all: result.all,
      branches: result.branches as Record<string, { current: boolean, name: string }>
    };
  }

  async fetch(): Promise<string> {
    return this.git.fetch();
  }

  async addRemote(name: string, url: string): Promise<void> {
    await this.git.addRemote(name, url);
  }

  async getRemoteUrl(name: string = 'origin'): Promise<string | null> {
    const remotes = await this.git.getRemotes(true);
    const remote = remotes.find(r => r.name === name);
    return remote?.refs.fetch || null;
  }
}

const REPO_PATH = process.env.GIT_REPO_PATH || '/mnt/c/Users/gungy/Omni-Server-Frame';
export const gitService = new GitService(REPO_PATH);
