import * as yaml from 'js-yaml';
import { readFileSync, readdirSync, mkdirSync, appendFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PIPELINES_DIR = join(__dirname);

// RAM weight table — tools over this threshold run solo
const WEIGHT_MAP = {
  semgrep: 2,   // heavy (~1.5GB+)
  gitleaks: 1,  // light
  trufflehog: 1,
  nuclei: 1,
  nmap: 1,
  nikto: 1,
};

const MAX_CONCURRENCY = 3;

export class PipelineEngine {
  constructor(registry, adapters, config = {}) {
    this.registry = registry;
    this.adapters = adapters;
    this.ws = config.ws || null;
    this.reposDir = config.reposDir || join(os.homedir(), '.tool-orchestrator', 'repos');
    this.streamDir = config.streamDir || join(this.reposDir, '..', 'streams');
  }

  getFindingsStream(executionId) {
    const dir = join(this.streamDir, String(executionId));
    return { dir, path: join(dir, 'findings.jsonl') };
  }

  streamFinding(executionId, finding) {
    const { dir, path } = this.getFindingsStream(executionId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(path, JSON.stringify(finding) + '\n');
  }

  readStreamedFindings(executionId) {
    const { path } = this.getFindingsStream(executionId);
    if (!existsSync(path)) return [];
    const data = readFileSync(path, 'utf-8').trim();
    if (!data) return [];
    return data.split('\n').filter(Boolean).map(l => JSON.parse(l));
  }

  listPipelines() {
    const files = readdirSync(PIPELINES_DIR).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    return files.map(f => {
      const doc = yaml.load(readFileSync(join(PIPELINES_DIR, f), 'utf-8'));
      return { file: f, name: doc.name, description: doc.description, steps: doc.steps || [] };
    });
  }

  loadPipeline(name) {
    const files = readdirSync(PIPELINES_DIR).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    for (const f of files) {
      const doc = yaml.load(readFileSync(join(PIPELINES_DIR, f), 'utf-8'));
      if (doc.name === name) return doc;
    }
    const exact = readdirSync(PIPELINES_DIR).find(f => f === `${name}.yaml` || f === `${name}.yml`);
    if (exact) return yaml.load(readFileSync(join(PIPELINES_DIR, exact), 'utf-8'));
    return null;
  }

  resolvePipeline(request, tools) {
    const lower = request.toLowerCase();

    if (lower.includes('quick') || lower.includes('secrets only')) {
      return this.loadPipeline('quick-scan') || this.loadPipeline('full-scan');
    }
    if (lower.includes('sast') || lower.includes('static') || lower.includes('code analysis')) {
      return this.loadPipeline('sast-only') || this.loadPipeline('full-scan');
    }

    return this.loadPipeline('full-scan');
  }

  async executeSteps(pipeline, context, broadcast) {
    const steps = pipeline.steps || [];
    const results = {};
    const completed = new Set();

    const getAdapter = (adapterName) => {
      return this.adapters.find(a => {
        const name = a.constructor.name.toLowerCase().replace('adapter', '');
        return adapterName === name || a.canHandle({ action: adapterName });
      });
    };

    const executeOne = async (step) => {
      const { id, adapter: adapterName, params } = step;
      const adapter = getAdapter(adapterName);

      if (broadcast) broadcast('step:start', { step: id, action: adapterName });

      const stepContext = {
        ...context,
        previousResults: Object.values(results),
        ...(params || {}),
      };

      if (!adapter) {
        throw new Error(`No adapter found for: ${adapterName}`);
      }

      const result = await adapter.execute({ action: adapterName, id }, stepContext);
      results[id] = { id, adapter: adapterName, ...result };
      completed.add(id);

      if (broadcast) broadcast('step:complete', { step: id, action: adapterName, result });
      return result;
    };

    const readySteps = (available) => {
      return steps.filter(s => {
        if (completed.has(s.id)) return false;
        const deps = (s.depends_on || []).filter(Boolean);
        return deps.every(d => completed.has(d));
      }).filter(s => available.has(s.id));
    };

    const remaining = new Set(steps.map(s => s.id));

    while (remaining.size > 0) {
      const ready = readySteps(remaining);

      if (ready.length === 0) {
        console.error('Pipeline deadlock — remaining:', [...remaining]);
        break;
      }

      if (pipeline.parallel && ready.length > 1) {
        const res = await Promise.all(ready.map(s => executeOne(s).catch(e => {
          if (broadcast) broadcast('step:error', { step: s.id, action: s.adapter, error: e.message });
          return null;
        })));
        res.forEach((r, i) => { if (r !== null) remaining.delete(ready[i].id); });
      } else {
        for (const step of ready) {
          try {
            await executeOne(step);
            remaining.delete(step.id);
          } catch (e) {
            if (broadcast) broadcast('step:error', { step: step.id, action: step.adapter, error: e.message });
            remaining.delete(step.id);
          }
        }
      }
    }

    return results;
  }

  getStepOrder(pipeline) {
    const steps = pipeline.steps || [];
    const visited = new Set();
    const order = [];

    const visit = (id) => {
      if (visited.has(id)) return;
      visited.add(id);
      const step = steps.find(s => s.id === id);
      if (step) {
        (step.depends_on || []).forEach(d => visit(d));
        order.push(step);
      }
    };

    steps.forEach(s => visit(s.id));
    return order;
  }

  /**
   * executeBounded — sequential pyramid: 2-3 at a time, heavy tools (<1.5GB) run solo.
   * Findings are streamed to disk (JSONL) instead of accumulated in RAM.
   */
  async executeBounded(pipeline, context, executionId, broadcast) {
    const steps = pipeline.steps || [];
    const results = {};
    const completed = new Set();

    const getAdapter = (adapterName) => {
      return this.adapters.find(a => {
        const name = a.constructor.name.toLowerCase().replace('adapter', '');
        return adapterName === name || a.canHandle({ action: adapterName });
      });
    };

    const toolWeight = (adapterName) => {
      const w = WEIGHT_MAP[adapterName] || 1;
      return w;
    };

    const readySteps = (available) => {
      return steps.filter(s => {
        if (completed.has(s.id)) return false;
        const deps = (s.depends_on || []).filter(Boolean);
        return deps.every(d => completed.has(d));
      }).filter(s => available.has(s.id));
    };

    const executeOne = async (step) => {
      const { id, adapter: adapterName, params } = step;
      const adapter = getAdapter(adapterName);

      if (broadcast) broadcast('step:start', { step: id, action: adapterName });

      const stepContext = {
        ...context,
        previousResults: Object.values(results),
        ...(params || {}),
      };

      if (!adapter) {
        throw new Error(`No adapter found for: ${adapterName}`);
      }

      const result = await adapter.execute({ action: adapterName, id }, stepContext);
      results[id] = { id, adapter: adapterName, ...result };
      completed.add(id);

      // Stream findings to disk
      if (result.findings && Array.isArray(result.findings)) {
        for (const f of result.findings) {
          this.streamFinding(executionId, { ...f, _sourceStep: id, _tool: adapterName });
        }
      }

      if (broadcast) broadcast('step:complete', { step: id, action: adapterName, result });
      return result;
    };

    // Semaphore: track current weight, block when at cap
    let currentWeight = 0;
    const queue = [];
    let running = 0;

    const scheduleNext = () => {
      while (queue.length > 0 && running < MAX_CONCURRENCY) {
        const item = queue[0];
        const weight = toolWeight(item.adapter);
        if (currentWeight + weight > MAX_CONCURRENCY) break; // wait until slot frees

        queue.shift();
        running++;
        currentWeight += weight;

        executeOne(item).catch(e => {
          if (broadcast) broadcast('step:error', { step: item.id, action: item.adapter, error: e.message });
        }).finally(() => {
          running--;
          currentWeight -= weight;
          completed.add(item.id);
          scheduleNext();
        });
      }
    };

    const remaining = new Set(steps.map(s => s.id));

    while (remaining.size > 0) {
      const ready = readySteps(remaining);
      if (ready.length === 0) {
        if (queue.length === 0 && running === 0) {
          console.error('Pipeline deadlock — remaining:', [...remaining]);
          break;
        }
        await new Promise(r => setTimeout(r, 100));
        continue;
      }

      for (const step of ready) {
        remaining.delete(step.id);
        queue.push(step);
      }

      scheduleNext();

      // Wait a tick for things to start
      await new Promise(r => setImmediate(r));
    }

    // Wait for all to finish
    while (running > 0) {
      await new Promise(r => setTimeout(r, 200));
    }

    return results;
  }
}
