import { exec } from 'child_process';
import { promisify } from 'util';
import { Logger } from '../utils/logger.js';
import { operationDb } from '../db/index.js';

const execAsync = promisify(exec);
const logger = new Logger('github');

async function gh(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const cmd = `gh ${args.join(' ')}`;
  logger.debug(`Executing: ${cmd}`);
  
  try {
    const { stdout, stderr } = await execAsync(cmd, { encoding: 'utf-8' });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error: any) {
    logger.error(`gh command failed: ${cmd}`, error.message);
    throw new Error(error.message || 'GitHub CLI error');
  }
}

function logOperation(type: string, action: string, params: any, result: any, status: string) {
  operationDb.create({
    type,
    action,
    params: JSON.stringify(params),
    result: JSON.stringify(result),
    status
  });
}

export const github = {
  async getAuthenticatedUser(): Promise<{ login: string; name: string }> {
    try {
      const { stdout } = await gh(['api', 'user', '--jq', '{login:.login,name:.name}']);
      const data = JSON.parse(stdout);
      return { login: data.login, name: data.name || data.login };
    } catch (error) {
      throw new Error('Not authenticated with GitHub');
    }
  },

  async listRepos(options: { limit?: number; visibility?: string; sort?: string } = {}): Promise<any[]> {
    const args = ['repo', 'list', '--json', 'name,description,visibility,url,isPrivate,isFork,defaultBranchRef'];
    if (options.limit) args.push(`--limit`, String(options.limit));
    if (options.visibility) args.push('--visibility', options.visibility);
    if (options.sort) args.push('--sort', options.sort);
    
    const { stdout } = await gh(args);
    logOperation('github', 'list_repos', options, { count: 0 }, 'success');
    return JSON.parse(stdout);
  },

  async getRepo(owner: string, repo: string): Promise<any> {
    const { stdout } = await gh(['repo', 'view', `${owner}/${repo}`, '--json', 'name,description,visibility,url,isPrivate,isFork,defaultBranchRef,parent']);
    logOperation('github', 'get_repo', { owner, repo }, {}, 'success');
    return JSON.parse(stdout);
  },

  async createRepo(options: { name: string; description?: string; private?: boolean; init?: boolean; gitignore?: string; license?: string }): Promise<any> {
    const args = ['repo', 'create', options.name];
    if (options.description) args.push('--description', options.description);
    if (options.private) args.push('--private');
    else args.push('--public');
    if (options.init) args.push('--init');
    if (options.gitignore) args.push('--gitignore', options.gitignore);
    if (options.license) args.push('--license', options.license);
    
    await gh(args);
    const repo = await this.getRepo('All-Vice', options.name);
    logOperation('github', 'create_repo', options, repo, 'success');
    return repo;
  },

  async deleteRepo(owner: string, repo: string): Promise<void> {
    await gh(['repo', 'delete', `${owner}/${repo}`, '--yes']);
    logOperation('github', 'delete_repo', { owner, repo }, {}, 'success');
  },

  async forkRepo(repo: string): Promise<any> {
    const { stdout } = await gh(['repo', 'fork', repo, '--json', 'name,fullName,owner']);
    logOperation('github', 'fork_repo', { repo }, {}, 'success');
    return JSON.parse(stdout);
  },

  async listIssues(options: { repo?: string; state?: string; limit?: number; labels?: string } = {}): Promise<any[]> {
    const args = ['issue', 'list', '--json', 'number,title,body,state,labels,author,assignees,createdAt,updatedAt'];
    if (options.repo) args.push('--repo', options.repo);
    if (options.state) args.push('--state', options.state);
    if (options.limit) args.push('--limit', String(options.limit));
    if (options.labels) args.push('--labels', options.labels);
    
    const { stdout } = await gh(args);
    logOperation('github', 'list_issues', options, { count: 0 }, 'success');
    return JSON.parse(stdout);
  },

  async createIssue(options: { repo?: string; title: string; body?: string; labels?: string }): Promise<any> {
    const args = ['issue', 'create', '--title', options.title];
    if (options.repo) args.push('--repo', options.repo);
    if (options.body) args.push('--body', options.body);
    if (options.labels) args.push('--labels', options.labels);
    
    const { stdout } = await gh(args);
    const url = stdout.trim();
    const number = parseInt(url.split('/issues/')[1]);
    
    logOperation('github', 'create_issue', options, { number, url }, 'success');
    return { number, url, title: options.title, body: options.body };
  },

  async getIssue(repo: string, number: number): Promise<any> {
    const { stdout } = await gh(['issue', 'view', `${repo}#${number}`, '--json', 'number,title,body,state,labels,author,assignees,comments']);
    logOperation('github', 'get_issue', { repo, number }, {}, 'success');
    return JSON.parse(stdout);
  },

  async closeIssue(repo: string, number: number): Promise<void> {
    await gh(['issue', 'close', `${repo}#${number}`]);
    logOperation('github', 'close_issue', { repo, number }, {}, 'success');
  },

  async reopenIssue(repo: string, number: number): Promise<void> {
    await gh(['issue', 'reopen', `${repo}#${number}`]);
    logOperation('github', 'reopen_issue', { repo, number }, {}, 'success');
  },

  async commentIssue(repo: string, number: number, body: string): Promise<any> {
    const { stdout } = await gh(['issue', 'comment', `${repo}#${number}`, '--body', body]);
    logOperation('github', 'comment_issue', { repo, number, body }, {}, 'success');
    return { success: true };
  },

  async listPullRequests(options: { repo?: string; state?: string; limit?: number; head?: string; base?: string } = {}): Promise<any[]> {
    const args = ['pr', 'list', '--json', 'number,title,body,state,author,headRefName,baseRefName,isDraft,mergeable,additions,deletions,changedFiles'];
    if (options.repo) args.push('--repo', options.repo);
    if (options.state) args.push('--state', options.state);
    if (options.limit) args.push('--limit', String(options.limit));
    if (options.head) args.push('--head', options.head);
    if (options.base) args.push('--base', options.base);
    
    const { stdout } = await gh(args);
    logOperation('github', 'list_prs', options, { count: 0 }, 'success');
    return JSON.parse(stdout);
  },

  async createPullRequest(options: { repo?: string; title: string; body?: string; head: string; base?: string }): Promise<any> {
    const args = ['pr', 'create', '--title', options.title];
    if (options.repo) args.push('--repo', options.repo);
    if (options.body) args.push('--body', options.body);
    if (options.head) args.push('--head', options.head);
    if (options.base) args.push('--base', options.base);
    else args.push('--base', 'main');
    
    const { stdout } = await gh(args);
    const url = stdout.trim();
    const number = parseInt(url.split('/pull/')[1]);
    
    logOperation('github', 'create_pr', options, { number, url }, 'success');
    return { number, url, title: options.title };
  },

  async getPullRequest(repo: string, number: number): Promise<any> {
    const { stdout } = await gh(['pr', 'view', `${repo}#${number}`, '--json', 'number,title,body,state,author,headRefName,baseRefName,isDraft,mergeable,additions,deletions,changedFiles,reviews,commits']);
    logOperation('github', 'get_pr', { repo, number }, {}, 'success');
    return JSON.parse(stdout);
  },

  async mergePullRequest(repo: string, number: number, method?: 'merge' | 'squash' | 'rebase'): Promise<void> {
    const args = ['pr', 'merge', `${repo}#${number}`];
    if (method) args.push('--admin', '--merge');
    else args.push('--auto');
    
    await gh(args);
    logOperation('github', 'merge_pr', { repo, number, method }, {}, 'success');
  },

  async closePullRequest(repo: string, number: number): Promise<void> {
    await gh(['pr', 'close', `${repo}#${number}`]);
    logOperation('github', 'close_pr', { repo, number }, {}, 'success');
  },

  async listReleases(repo: string, limit: number = 10): Promise<any[]> {
    const { stdout } = await gh(['release', 'list', '--repo', repo, '--json', 'tagName,name,body,draft,prerelease,publishedAt']);
    logOperation('github', 'list_releases', { repo, limit }, {}, 'success');
    return JSON.parse(stdout);
  },

  async createRelease(options: { repo: string; tag: string; title?: string; notes?: string; draft?: boolean; prerelease?: boolean }): Promise<any> {
    const args = ['release', 'create', options.tag];
    if (options.title) args.push('--title', options.title);
    if (options.notes) args.push('--notes', options.notes);
    if (options.draft) args.push('--draft');
    if (options.prerelease) args.push('--prerelease');
    
    const { stdout } = await gh(args);
    logOperation('github', 'create_release', options, { url: stdout }, 'success');
    return { url: stdout.trim(), tag: options.tag };
  },

  async deleteRelease(repo: string, tag: string): Promise<void> {
    await gh(['release', 'delete', `${repo}@${tag}`, '--yes']);
    logOperation('github', 'delete_release', { repo, tag }, {}, 'success');
  },

  async listGists(limit: number = 10): Promise<any[]> {
    const { stdout } = await gh(['gist', 'list', '--json', 'id,description,public,files,createdAt,updatedAt', '--limit', String(limit)]);
    logOperation('github', 'list_gists', { limit }, {}, 'success');
    return JSON.parse(stdout);
  },

  async createGist(options: { description?: string; public?: boolean; files: Record<string, string> }): Promise<any> {
    const args = ['gist', 'create'];
    if (options.description) args.push('--description', options.description);
    if (!options.public) args.push('--private');
    
    for (const [filename, content] of Object.entries(options.files)) {
      args.push('-d', content, filename);
    }
    
    const { stdout } = await gh(args);
    logOperation('github', 'create_gist', { description: options.description, files: Object.keys(options.files) }, { url: stdout }, 'success');
    return { url: stdout.trim() };
  },

  async deleteGist(gistId: string): Promise<void> {
    await gh(['gist', 'delete', gistId]);
    logOperation('github', 'delete_gist', { gistId }, {}, 'success');
  },

  async runAction(repo: string, workflow: string): Promise<any> {
    const { stdout } = await gh(['run', 'run', '-R', repo, '-f', workflow]);
    logOperation('github', 'run_action', { repo, workflow }, { output: stdout }, 'success');
    return { success: true, output: stdout };
  },

  async listActions(repo: string, limit: number = 10): Promise<any[]> {
    const { stdout } = await gh(['run', 'list', '-R', repo, '--json', 'name,status,conclusion,headBranch,headSha,workflowId', '--limit', String(limit)]);
    logOperation('github', 'list_actions', { repo, limit }, {}, 'success');
    return JSON.parse(stdout);
  },

  async searchRepos(query: string, limit: number = 10): Promise<any[]> {
    const { stdout } = await gh(['search', 'repos', query, '--json', 'name,description,url,stars,language,owner', '--limit', String(limit)]);
    logOperation('github', 'search_repos', { query, limit }, {}, 'success');
    return JSON.parse(stdout);
  },

  async searchIssues(query: string, limit: number = 10): Promise<any[]> {
    const { stdout } = await gh(['search', 'issues', query, '--json', 'number,title,url,state,repository,author', '--limit', String(limit)]);
    logOperation('github', 'search_issues', { query, limit }, {}, 'success');
    return JSON.parse(stdout);
  }
};

export default github;
