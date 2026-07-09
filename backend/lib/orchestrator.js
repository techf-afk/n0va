import { GitCloneAdapter } from '../adapters/git-clone.js';
import { GitleaksAdapter } from '../adapters/gitleaks.js';
import { TrufflehogAdapter } from '../adapters/trufflehog.js';
import { SemgrepAdapter } from '../adapters/semgrep.js';
import { NmapAdapter } from '../adapters/nmap.js';
import { NucleiAdapter } from '../adapters/nuclei.js';
import { NiktoAdapter } from '../adapters/nikto.js';
import { MsfconsoleAdapter } from '../adapters/msfconsole.js';
import { ReportMerger } from '../adapters/report-merger.js';
import { PipelineEngine } from '../pipelines/PipelineEngine.js';
import { CloneStore } from './clone-store.js';
import { join } from 'path';
import os from 'os';

export class Orchestrator {
  constructor(aiClient, registry, config = {}) {
    this.ai = aiClient;
    this.registry = registry;
    this.ws = config.ws || null;
    this.reposDir = config.reposDir || join(os.homedir(), '.tool-orchestrator', 'repos');
    this.containerized = config.containerized ?? (process.env.CONTAINERIZED === 'true');

    const adapterConfig = { ws: this.ws, reposDir: this.reposDir, containerized: this.containerized };

    this.adapters = [
      new GitCloneAdapter(adapterConfig),
      new GitleaksAdapter(adapterConfig),
      new TrufflehogAdapter(adapterConfig),
      new SemgrepAdapter(adapterConfig),
      new NmapAdapter(adapterConfig),
      new NucleiAdapter(adapterConfig),
      new NiktoAdapter(adapterConfig),
      new MsfconsoleAdapter(adapterConfig),
      new ReportMerger({ ...adapterConfig, registry: this.registry }),
    ];

    this.pipelineEngine = new PipelineEngine(registry, this.adapters, config);
    this.cloneStore = new CloneStore();
    this.seedDefaultFolders();
  }

  seedDefaultFolders() {
    try {
      this.registry.seedDefaultFolders();
    } catch (e) {
      console.error('Failed to seed folders:', e.message);
    }
  }

  broadcast(type, data) {
    if (this.ws) {
      this.ws.clients.forEach(client => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({ type, ...data, timestamp: new Date().toISOString() }));
        }
      });
    }
  }

  async execute(userRequest, pipelineName) {
    this.broadcast('execution:start', { request: userRequest });
    const execResult = this.registry.createExecution(userRequest);
    const executionId = execResult.lastInsertRowid;
    this.registry.logAudit({ action: 'execute', target: userRequest, scanner: pipelineName || 'auto', user: 'local', started_at: new Date().toISOString(), sandbox: this.containerized ? 'unshare' : 'host' });

    try {
      this.registry.updateExecution(executionId, { status: 'running' });
      this.broadcast('execution:status', { executionId, status: 'running' });

      const tools = this.registry.getAllTools();
      const repoUrlMatch = userRequest.match(/https?:\/\/[^\s]+/);
      const context = { repoUrl: repoUrlMatch ? repoUrlMatch[0] : null };

      // Resolve pipeline from request
      let pipeline;
      if (pipelineName) {
        pipeline = this.pipelineEngine.loadPipeline(pipelineName);
      }
      const pipelineMatch = userRequest.match(/--pipeline\s+(\S+)/);
      if (!pipeline && pipelineMatch) {
        pipeline = this.pipelineEngine.loadPipeline(pipelineMatch[1]);
      }
      if (!pipeline) {
        pipeline = this.pipelineEngine.resolvePipeline(userRequest, tools);
      }

      if (!pipeline) {
        // Fallback: try AI planning
        this.broadcast('execution:planning', { executionId, message: 'No pipeline matched, planning with AI...' });
        const plan = await this.ai.planOrchestration(userRequest, tools);
        if (!plan || !plan.steps) throw new Error('Failed to create execution plan');
        this.registry.updateExecution(executionId, { plan });
        const results = await this.executePlanSteps(plan, context, executionId);
        this.finalize(executionId, results);
        return { success: true, executionId, results };
      }

      this.broadcast('execution:plan', { executionId, pipeline: pipeline.name });

      // Save pipeline as plan
      const plan = { pipeline: pipeline.name, steps: pipeline.steps.map(s => ({
        action: s.adapter,
        inputs: s.params || {},
        tool: s.adapter,
      }))};
      this.registry.updateExecution(executionId, { plan: JSON.stringify(plan) });

      // Track steps in DB
      for (let i = 0; i < pipeline.steps.length; i++) {
        const s = pipeline.steps[i];
        const toolEntry = this.registry.getToolByName(s.adapter);
        const toolId = toolEntry ? toolEntry.id : null;
        this.registry.db.prepare(
          `INSERT INTO execution_steps (execution_id, step_number, tool_id, action, inputs)
           VALUES (?, ?, ?, ?, ?)`
        ).run(executionId, i, toolId, s.adapter, JSON.stringify(s.params || {}));
      }

      // Execute pipeline
      const results = await this.pipelineEngine.executeSteps(pipeline, context, (type, data) => {
        this.broadcast(type, { executionId, ...data });
      });

      // Update step statuses
      let idx = 0;
      for (const step of pipeline.steps) {
        const r = results[step.id];
        if (r) {
          this.registry.db.prepare(
            `UPDATE execution_steps SET status = ?, outputs = ?, completed_at = ? WHERE execution_id = ? AND step_number = ?`
          ).run('completed', JSON.stringify(r), new Date().toISOString(), executionId, idx);
        } else {
          this.registry.db.prepare(
            `UPDATE execution_steps SET status = ?, completed_at = ? WHERE execution_id = ? AND step_number = ?`
          ).run('failed', new Date().toISOString(), executionId, idx);
        }
        idx++;
      }

      this.finalize(executionId, Object.values(results));
      return { success: true, executionId, results: Object.values(results) };

    } catch (error) {
      this.registry.updateExecution(executionId, {
        status: 'failed',
        error: error.message,
        completed_at: new Date().toISOString()
      });
      this.broadcast('execution:error', { executionId, error: error.message });
      return { success: false, executionId, error: error.message };
    }
  }

  async executePlanSteps(plan, context, executionId) {
    const results = [];
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      this.broadcast('step:start', { executionId, step: i, action: step.action });
      const stepRecord = this.registry.db.prepare(
        `INSERT INTO execution_steps (execution_id, step_number, tool_id, action, inputs)
         VALUES (?, ?, ?, ?, ?)`
      ).run(executionId, i, step.tool || 0, step.action, JSON.stringify(step.inputs || {}));
      const stepId = stepRecord.lastInsertRowid;

      try {
        const result = await this.executeStep(step, { ...context, previousResults: results });
        results.push(result);
        if (result.repoPath) context.repoPath = result.repoPath;
        this.registry.db.prepare(
          `UPDATE execution_steps SET status = ?, outputs = ?, completed_at = ? WHERE id = ?`
        ).run('completed', JSON.stringify(result), new Date().toISOString(), stepId);
        this.broadcast('step:complete', { executionId, step: i, action: step.action, result });
      } catch (err) {
        this.registry.db.prepare(
          `UPDATE execution_steps SET status = ?, error = ?, completed_at = ? WHERE id = ?`
        ).run('failed', err.message, new Date().toISOString(), stepId);
        this.broadcast('step:error', { executionId, step: i, action: step.action, error: err.message });
        throw err;
      }
    }
    return results;
  }

  finalize(executionId, results) {
    this.registry.updateExecution(executionId, {
      status: 'completed',
      result: JSON.stringify(results),
      completed_at: new Date().toISOString()
    });
    this.registry.logAudit({ action: 'execute-complete', target: null, scanner: 'pipeline', user: 'local', ended_at: new Date().toISOString(), exit_code: 0, sandbox: this.containerized ? 'unshare' : 'host' });
    this.broadcast('execution:complete', { executionId, results });
  }

  async executeStep(step, context) {
    const resolvedStep = { ...step };
    if (step.tool && !isNaN(Number(step.tool))) {
      const toolEntry = this.registry.getTool(Number(step.tool));
      if (toolEntry) resolvedStep.resolvedTool = toolEntry.name.toLowerCase();
    }

    const adapter = this.adapters.find(a => a.canHandle(resolvedStep));
    if (adapter) return adapter.execute(resolvedStep, context);

    const tool = step.tool ? this.registry.getTool(Number(step.tool)) : null;
    if (!tool) throw new Error(`No adapter found: ${step.tool}`);

    return {
      tool: tool.name,
      action: step.action,
      result: `Simulated: ${step.action} on ${tool.name}`,
      timestamp: new Date().toISOString()
    };
  }

  // ── Store: Folder Pipeline ───────────────────────────────────

  generateFolderPipeline(folder, members) {
    const steps = [];

    // If repo type, first step is clone
    if (folder.scan_type === 'repo') {
      steps.push({
        id: 'clone',
        adapter: 'git-clone',
        params: { url: '${REPO_URL}' },
      });
    }

    members.forEach((m, i) => {
      steps.push({
        id: m.tool_name || `tool-${i}`,
        adapter: m.tool_name,
        depends_on: folder.scan_type === 'repo' && i === 0 ? ['clone'] : [],
      });
    });

    // Report merger at the end
    const toolNames = members.map(m => m.tool_name);
    steps.push({
      id: 'report',
      adapter: 'report-merger',
      depends_on: toolNames,
    });

    return {
      name: `store-${folder.name}`,
      description: folder.description || folder.name,
      steps,
    };
  }

  async executeFolder(folderId, targetUrl) {
    const folder = this.registry.getFolderWithTools(folderId);
    if (!folder) throw new Error(`Folder ${folderId} not found`);
    if (!folder.is_active) throw new Error(`Folder "${folder.name}" is disabled`);

    // Create execution record
    const execResult = this.registry.createExecution(`Store: ${folder.name} on ${targetUrl}`);
    const executionId = execResult.lastInsertRowid;
    this.registry.updateExecution(executionId, { status: 'running' });
    this.broadcast('execution:status', { executionId, status: 'running' });

    try {
      // Clone target repo if needed (repo mode)
      let repoPath = null;
      if (folder.scan_type === 'repo' && targetUrl) {
        this.broadcast('step:progress', { step: 'clone', message: `Cloning ${targetUrl}...` });
        repoPath = await this.cloneStore.ensureTargetClone(targetUrl);
        this.broadcast('step:progress', { step: 'clone', message: `Cloned to ${repoPath}` });
      }

      // Ensure tool clones exist in store
      for (const member of folder.members) {
        if (member.tool_repo) {
          try {
            const toolPath = this.cloneStore.toolClonePath(folder.name, member.tool_name);
            if (toolPath) {
              this.broadcast('step:progress', { step: member.tool_name, message: `Tool cached at ${toolPath}` });
            }
          } catch {}
        }
      }

      // Generate pipeline
      const pipeline = this.generateFolderPipeline(folder, folder.members);
      const context = { repoUrl: targetUrl, repoPath };

      this.broadcast('execution:plan', { executionId, pipeline: pipeline.name });

      // Execute with bounded concurrency
      const results = await this.pipelineEngine.executeBounded(
        pipeline, context, executionId,
        (type, data) => this.broadcast(type, { executionId, ...data })
      );

      // Read streamed findings from disk for report
      const streamedFindings = this.pipelineEngine.readStreamedFindings(executionId);

      const report = {
        executionId,
        folder: folder.name,
        target: targetUrl,
        results: Object.values(results),
        streamedFindings,
        totalFindings: streamedFindings.length,
      };

      this.finalize(executionId, report);
      return { success: true, executionId, report };

    } catch (error) {
      this.registry.updateExecution(executionId, {
        status: 'failed',
        error: error.message,
        completed_at: new Date().toISOString()
      });
      this.broadcast('execution:error', { executionId, error: error.message });
      return { success: false, executionId, error: error.message };
    }
  }
}
