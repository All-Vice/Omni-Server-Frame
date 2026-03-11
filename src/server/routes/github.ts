import { Router } from 'express';
import github from '../../services/github.js';
import { Logger } from '../../utils/logger.js';

const router = Router();
const logger = new Logger('github-routes');

function success(res: any, data: any, meta: any = {}) {
  res.json({
    success: true,
    data,
    meta: { timestamp: new Date().toISOString(), ...meta }
  });
}

function error(res: any, code: string, message: string, details?: any) {
  res.status(400).json({
    success: false,
    error: { code, message, details },
    meta: { timestamp: new Date().toISOString() }
  });
}

router.get('/status', async (req, res) => {
  try {
    const user = await github.getAuthenticatedUser();
    success(res, { authenticated: true, user });
  } catch (err: any) {
    error(res, 'AUTH_ERROR', 'Not authenticated with GitHub', err.message);
  }
});

router.get('/repos', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 30;
    const visibility = req.query.visibility as string;
    const sort = req.query.sort as string;
    const repos = await github.listRepos({ limit, visibility, sort });
    success(res, repos, { count: repos.length });
  } catch (err: any) {
    logger.error('Failed to list repos', err);
    error(res, 'LIST_REPOS_ERROR', 'Failed to list repositories', err.message);
  }
});

router.post('/repos', async (req, res) => {
  try {
    const { name, description, private: isPrivate, init, gitignore, license } = req.body;
    if (!name) {
      return error(res, 'VALIDATION_ERROR', 'Repository name is required');
    }
    const repo = await github.createRepo({ name, description, private: isPrivate, init, gitignore, license });
    success(res, repo, { action: 'created' });
  } catch (err: any) {
    logger.error('Failed to create repo', err);
    error(res, 'CREATE_REPO_ERROR', 'Failed to create repository', err.message);
  }
});

router.get('/repos/:owner/:repo', async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const data = await github.getRepo(owner, repo);
    success(res, data);
  } catch (err: any) {
    error(res, 'GET_REPO_ERROR', 'Failed to get repository', err.message);
  }
});

router.delete('/repos/:owner/:repo', async (req, res) => {
  try {
    const { owner, repo } = req.params;
    await github.deleteRepo(owner, repo);
    success(res, { deleted: true, owner, repo });
  } catch (err: any) {
    logger.error('Failed to delete repo', err);
    error(res, 'DELETE_REPO_ERROR', 'Failed to delete repository', err.message);
  }
});

router.post('/repos/fork', async (req, res) => {
  try {
    const { repo } = req.body;
    if (!repo) {
      return error(res, 'VALIDATION_ERROR', 'Repository is required');
    }
    const result = await github.forkRepo(repo);
    success(res, result);
  } catch (err: any) {
    logger.error('Failed to fork repo', err);
    error(res, 'FORK_REPO_ERROR', 'Failed to fork repository', err.message);
  }
});

router.get('/issues', async (req, res) => {
  try {
    const repo = req.query.repo as string;
    const state = req.query.state as string || 'open';
    const limit = parseInt(req.query.limit as string) || 30;
    const labels = req.query.labels as string;
    const issues = await github.listIssues({ repo, state, limit, labels });
    success(res, issues, { count: issues.length });
  } catch (err: any) {
    logger.error('Failed to list issues', err);
    error(res, 'LIST_ISSUES_ERROR', 'Failed to list issues', err.message);
  }
});

router.post('/issues', async (req, res) => {
  try {
    const { repo, title, body, labels } = req.body;
    if (!title) {
      return error(res, 'VALIDATION_ERROR', 'Issue title is required');
    }
    const issue = await github.createIssue({ repo, title, body, labels });
    success(res, issue, { action: 'created' });
  } catch (err: any) {
    logger.error('Failed to create issue', err);
    error(res, 'CREATE_ISSUE_ERROR', 'Failed to create issue', err.message);
  }
});

router.get('/issues/:owner/:repo/:number', async (req, res) => {
  try {
    const { owner, repo, number } = req.params;
    const issue = await github.getIssue(`${owner}/${repo}`, parseInt(number));
    success(res, issue);
  } catch (err: any) {
    error(res, 'GET_ISSUE_ERROR', 'Failed to get issue', err.message);
  }
});

router.patch('/issues/:owner/:repo/:number/close', async (req, res) => {
  try {
    const { owner, repo, number } = req.params;
    await github.closeIssue(`${owner}/${repo}`, parseInt(number));
    success(res, { closed: true, number: parseInt(number) });
  } catch (err: any) {
    error(res, 'CLOSE_ISSUE_ERROR', 'Failed to close issue', err.message);
  }
});

router.patch('/issues/:owner/:repo/:number/reopen', async (req, res) => {
  try {
    const { owner, repo, number } = req.params;
    await github.reopenIssue(`${owner}/${repo}`, parseInt(number));
    success(res, { reopened: true, number: parseInt(number) });
  } catch (err: any) {
    error(res, 'REOPEN_ISSUE_ERROR', 'Failed to reopen issue', err.message);
  }
});

router.post('/issues/:owner/:repo/:number/comments', async (req, res) => {
  try {
    const { owner, repo, number } = req.params;
    const { body } = req.body;
    if (!body) {
      return error(res, 'VALIDATION_ERROR', 'Comment body is required');
    }
    const comment = await github.commentIssue(`${owner}/${repo}`, parseInt(number), body);
    success(res, comment);
  } catch (err: any) {
    error(res, 'COMMENT_ISSUE_ERROR', 'Failed to comment on issue', err.message);
  }
});

router.get('/pulls', async (req, res) => {
  try {
    const repo = req.query.repo as string;
    const state = req.query.state as string || 'open';
    const limit = parseInt(req.query.limit as string) || 30;
    const head = req.query.head as string;
    const base = req.query.base as string;
    const prs = await github.listPullRequests({ repo, state, limit, head, base });
    success(res, prs, { count: prs.length });
  } catch (err: any) {
    logger.error('Failed to list PRs', err);
    error(res, 'LIST_PRS_ERROR', 'Failed to list pull requests', err.message);
  }
});

router.post('/pulls', async (req, res) => {
  try {
    const { repo, title, body, head, base } = req.body;
    if (!title || !head) {
      return error(res, 'VALIDATION_ERROR', 'Title and head branch are required');
    }
    const pr = await github.createPullRequest({ repo, title, body, head, base });
    success(res, pr, { action: 'created' });
  } catch (err: any) {
    logger.error('Failed to create PR', err);
    error(res, 'CREATE_PR_ERROR', 'Failed to create pull request', err.message);
  }
});

router.get('/pulls/:owner/:repo/:number', async (req, res) => {
  try {
    const { owner, repo, number } = req.params;
    const pr = await github.getPullRequest(`${owner}/${repo}`, parseInt(number));
    success(res, pr);
  } catch (err: any) {
    error(res, 'GET_PR_ERROR', 'Failed to get pull request', err.message);
  }
});

router.post('/pulls/:owner/:repo/:number/merge', async (req, res) => {
  try {
    const { owner, repo, number } = req.params;
    const { method } = req.body;
    await github.mergePullRequest(`${owner}/${repo}`, parseInt(number), method);
    success(res, { merged: true, number: parseInt(number) });
  } catch (err: any) {
    error(res, 'MERGE_PR_ERROR', 'Failed to merge pull request', err.message);
  }
});

router.post('/pulls/:owner/:repo/:number/close', async (req, res) => {
  try {
    const { owner, repo, number } = req.params;
    await github.closePullRequest(`${owner}/${repo}`, parseInt(number));
    success(res, { closed: true, number: parseInt(number) });
  } catch (err: any) {
    error(res, 'CLOSE_PR_ERROR', 'Failed to close pull request', err.message);
  }
});

router.get('/releases/:owner/:repo', async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;
    const releases = await github.listReleases(`${owner}/${repo}`, limit);
    success(res, releases, { count: releases.length });
  } catch (err: any) {
    error(res, 'LIST_RELEASES_ERROR', 'Failed to list releases', err.message);
  }
});

router.post('/releases', async (req, res) => {
  try {
    const { repo, tag, title, notes, draft, prerelease } = req.body;
    if (!repo || !tag) {
      return error(res, 'VALIDATION_ERROR', 'Repository and tag are required');
    }
    const release = await github.createRelease({ repo, tag, title, notes, draft, prerelease });
    success(res, release, { action: 'created' });
  } catch (err: any) {
    logger.error('Failed to create release', err);
    error(res, 'CREATE_RELEASE_ERROR', 'Failed to create release', err.message);
  }
});

router.delete('/releases/:owner/:repo/:tag', async (req, res) => {
  try {
    const { owner, repo, tag } = req.params;
    await github.deleteRelease(`${owner}/${repo}`, tag);
    success(res, { deleted: true, tag });
  } catch (err: any) {
    error(res, 'DELETE_RELEASE_ERROR', 'Failed to delete release', err.message);
  }
});

router.get('/gists', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const gists = await github.listGists(limit);
    success(res, gists, { count: gists.length });
  } catch (err: any) {
    error(res, 'LIST_GISTS_ERROR', 'Failed to list gists', err.message);
  }
});

router.post('/gists', async (req, res) => {
  try {
    const { description, public: isPublic, files } = req.body;
    if (!files || Object.keys(files).length === 0) {
      return error(res, 'VALIDATION_ERROR', 'At least one file is required');
    }
    const gist = await github.createGist({ description, public: isPublic, files });
    success(res, gist, { action: 'created' });
  } catch (err: any) {
    logger.error('Failed to create gist', err);
    error(res, 'CREATE_GIST_ERROR', 'Failed to create gist', err.message);
  }
});

router.delete('/gists/:gistId', async (req, res) => {
  try {
    const { gistId } = req.params;
    await github.deleteGist(gistId);
    success(res, { deleted: true, gistId });
  } catch (err: any) {
    error(res, 'DELETE_GIST_ERROR', 'Failed to delete gist', err.message);
  }
});

router.get('/actions/:owner/:repo', async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;
    const runs = await github.listActions(`${owner}/${repo}`, limit);
    success(res, runs, { count: runs.length });
  } catch (err: any) {
    error(res, 'LIST_ACTIONS_ERROR', 'Failed to list actions', err.message);
  }
});

router.post('/actions/:owner/:repo/run', async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const { workflow } = req.body;
    if (!workflow) {
      return error(res, 'VALIDATION_ERROR', 'Workflow name is required');
    }
    const result = await github.runAction(`${owner}/${repo}`, workflow);
    success(res, result);
  } catch (err: any) {
    error(res, 'RUN_ACTION_ERROR', 'Failed to run action', err.message);
  }
});

router.get('/search/repos', async (req, res) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      return error(res, 'VALIDATION_ERROR', 'Search query is required');
    }
    const limit = parseInt(req.query.limit as string) || 10;
    const results = await github.searchRepos(query, limit);
    success(res, results, { count: results.length, query });
  } catch (err: any) {
    error(res, 'SEARCH_REPOS_ERROR', 'Failed to search repositories', err.message);
  }
});

router.get('/search/issues', async (req, res) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      return error(res, 'VALIDATION_ERROR', 'Search query is required');
    }
    const limit = parseInt(req.query.limit as string) || 10;
    const results = await github.searchIssues(query, limit);
    success(res, results, { count: results.length, query });
  } catch (err: any) {
    error(res, 'SEARCH_ISSUES_ERROR', 'Failed to search issues', err.message);
  }
});

export default router;
