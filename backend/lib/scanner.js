import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import os from 'os';

// risk: passive = read-only fingerprint (safe default)
//       active  = sends traffic, may be logged by target
//       aggressive = loud/exploit-style, high exposure of operator IP
export const KNOWN_TOOLS = {
  gitleaks: { type: 'cli', description: 'Git secrets scanner', capabilities: ['secrets', 'git'], risk: 'passive' },
  trufflehog: { type: 'cli', description: 'Secrets detection tool', capabilities: ['secrets', 'git', 'filesystem'], risk: 'passive' },
  semgrep: { type: 'cli', description: 'Static analysis security scanner', capabilities: ['sast', 'code-analysis'], risk: 'passive' },
  nmap: { type: 'cli', description: 'Network discovery and security scanning', capabilities: ['network', 'port-scan', 'recon'], risk: 'active' },
  whatweb: { type: 'cli', description: 'Web technology fingerprinting', capabilities: ['recon', 'fingerprint', 'web'], risk: 'passive' },
  wafw00f: { type: 'cli', description: 'Web application firewall detection', capabilities: ['recon', 'waf', 'web'], risk: 'passive' },
  gobuster: { type: 'cli', description: 'Directory and file brute-force discovery', capabilities: ['recon', 'discovery', 'web'], risk: 'aggressive' },
  trivy: { type: 'cli', description: 'All-in-one vulnerability scanner', capabilities: ['container', 'iac', 'secrets'], risk: 'passive' },
  bandit: { type: 'cli', description: 'Python security linter', capabilities: ['sast', 'python'], risk: 'passive' },
  checkov: { type: 'cli', description: 'Infrastructure as code scanner', capabilities: ['iac', 'terraform'], risk: 'passive' },
  codeql: { type: 'cli', description: 'CodeQL semantic code analysis', capabilities: ['sast', 'code-analysis'], risk: 'passive' },
  snyk: { type: 'cli', description: 'Developer security platform', capabilities: ['sast', 'sca', 'container'], risk: 'passive' },
  dependencycheck: { type: 'cli', description: 'OWASP dependency check', capabilities: ['sca', 'dependencies'], risk: 'passive' },
  nuclei: { type: 'cli', description: 'Template-based vulnerability scanner', capabilities: ['web', 'exploitation', 'recon'], risk: 'aggressive' },
  nikto: { type: 'cli', description: 'Web server scanner', capabilities: ['web', 'recon'], risk: 'active' },
  msfconsole: { type: 'cli', description: 'Metasploit framework (exploitation)', capabilities: ['exploitation', 'network'], risk: 'aggressive' },
};

export function riskLevel(name) {
  const t = KNOWN_TOOLS[name];
  return t?.risk || 'active';
}

// Human-readable warning + recommendation for a given risk level.
export function riskWarning(level) {
  if (level === 'aggressive') {
    return 'Sends many requests that are clearly visible in the target\'s logs/WAF and can expose your real IP. Run only on targets you control. Route through a VPN or proxy (set HTTP_PROXY / ALL_PROXY) to avoid attribution.';
  }
  if (level === 'active') {
    return 'Sends traffic to the target and may be logged. Prefer a VPN or proxy (set HTTP_PROXY / ALL_PROXY) if you want to avoid exposing your IP.';
  }
  return null;
}

export class ToolScanner {
  constructor(aiClient, registry, config = {}) {
    this.ai = aiClient;
    this.registry = registry;
    this.githubToken = process.env.GITHUB_TOKEN || config.githubToken || '';
    this.reposDir = config.reposDir || process.env.TOOL_REPOS_DIR || join(os.homedir(), '.tool-orchestrator', 'repos');
  }

  checkToolInstalled(name) {
    try {
      execSync(`which ${name}`, { encoding: 'utf-8', stdio: 'pipe' });
      return true;
    } catch { return false; }
  }

  detectFromPackageJson(repoPath) {
    try {
      const pkg = JSON.parse(readFileSync(join(repoPath, 'package.json'), 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const toolMap = {
        'semgrep': ['semgrep', 'semgrep-rules'],
        'gitleaks': ['gitleaks'],
        'trufflehog': ['trufflehog'],
        'eslint-plugin-security': { type: 'library', description: 'ESLint security plugin', capabilities: ['sast', 'javascript'] },
      };

      const detected = [];
      for (const [name, keywords] of Object.entries(toolMap)) {
        if (Array.isArray(keywords)) {
          if (keywords.some(k => deps[k])) detected.push(name);
        }
      }

      return this.lookupToolInfo(detected);
    } catch { return []; }
  }

  detectFromPath() {
    const detected = [];
    for (const [name, info] of Object.entries(KNOWN_TOOLS)) {
      if (this.checkToolInstalled(name)) {
        detected.push({ ...info, name });
      }
    }
    return detected;
  }

  detectFromFiles(repoPath) {
    const markers = {
      'Dockerfile': { type: 'service', description: 'Docker container runtime', capabilities: ['container'] },
      'docker-compose.yml': { type: 'service', description: 'Docker Compose orchestration', capabilities: ['container'] },
      '.github/workflows': { type: 'service', description: 'GitHub Actions CI', capabilities: ['ci'] },
      'Jenkinsfile': { type: 'service', description: 'Jenkins CI pipeline', capabilities: ['ci'] },
    };

    const detected = [];
    for (const [marker, info] of Object.entries(markers)) {
      if (existsSync(join(repoPath, marker))) {
        detected.push({ ...info, name: marker.replace(/[.\/]/g, '-') });
      }
    }
    return detected;
  }

  lookupToolInfo(names) {
    return names.map(n => {
      const info = KNOWN_TOOLS[n];
      return info ? { ...info, name: n } : { name: n, type: 'cli', description: n, capabilities: [] };
    });
  }

  extractRepoInfo(repoUrl) {
    const clean = repoUrl.replace(/\.git$/, '').replace(/\/$/, '');
    const parts = clean.split('/');
    const repoName = parts[parts.length - 1] || 'unknown';

    const githubMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:\/?)$/);
    if (githubMatch) {
      return { owner: githubMatch[1], repo: githubMatch[2].replace('.git', ''), repoName, isGitHub: true };
    }

    const gitlabMatch = repoUrl.match(/gitlab\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:\/?)$/);
    if (gitlabMatch) {
      return { owner: gitlabMatch[1], repo: gitlabMatch[2].replace('.git', ''), repoName, isGitHub: false };
    }

    return { owner: 'unknown', repo: repoName, repoName, isGitHub: false };
  }

  async scanGitHubRepo(repoUrl) {
    try {
      console.log(`Scanning repository: ${repoUrl}`);
      const { owner, repo, repoName, isGitHub } = this.extractRepoInfo(repoUrl);

      const repoPath = join(this.reposDir, repoName);
      if (!existsSync(repoPath)) {
        if (!existsSync(this.reposDir)) mkdirSync(this.reposDir, { recursive: true });
        console.log(`Cloning ${repoUrl}...`);
        execSync(`git clone --depth 1 "${repoUrl}" "${repoPath}"`, { encoding: 'utf-8', timeout: 60000 });
      } else {
        console.log(`Using existing clone at ${repoPath}`);
      }

      // Heuristic detection: check path, files, and package.json
      const toolsOnPath = this.detectFromPath();
      const toolsFromPackage = this.detectFromPackageJson(repoPath);
      const toolsFromFiles = this.detectFromFiles(repoPath);

      const allDetected = [...new Map(
        [...toolsOnPath, ...toolsFromPackage, ...toolsFromFiles].map(t => [t.name, t])
      ).values()];

      let name = repoName;
      let readme = '';
      let description = allDetected.map(t => t.description).filter(Boolean).join('; ') || `${repoName} - tool`;

      try { readme = readFileSync(join(repoPath, 'README.md'), 'utf-8').slice(0, 500); } catch {}

      // If nothing heuristic found, try AI for description only
      if (allDetected.length === 0 && this.ai) {
        try {
          const analysis = await this.ai.analyzeRepo({ name: repoName, readme });
          if (analysis) Object.assign(allDetected, analysis);
        } catch {}
      }

      // Register each detected tool
      const registered = [];
      for (const tool of allDetected) {
        try {
          const result = this.registry.addTool({
            name: tool.name,
            type: tool.type || 'cli',
            description: tool.description || `${tool.name} - tool`,
            repoUrl: isGitHub ? `https://github.com/${owner}/${repo}` : repoUrl,
            interface: { type: 'cli', details: 'Command-line tool' },
            capabilities: tool.capabilities || [],
            inputs: [],
            outputs: [],
            metadata: { owner, detectedBy: 'heuristic' },
          });
          registered.push({ ...tool, id: result.lastInsertRowid });
          console.log(`Registered: ${tool.name} (ID: ${result.lastInsertRowid})`);
        } catch (e) {
          if (!e.message.includes('UNIQUE')) {
            console.error(`Failed to register ${tool.name}:`, e.message);
          }
        }
      }

      // Register the repo itself as a tool
      const repoResult = this.registry.addTool({
        name,
        type: 'library',
        description: description,
        repoUrl,
        interface: { type: 'library', details: 'Git repository' },
        capabilities: allDetected.filter(t => t.capabilities).flatMap(t => t.capabilities),
        inputs: [],
        outputs: [],
        metadata: { owner, detectedBy: 'heuristic' },
      });

      return { success: true, toolId: repoResult.lastInsertRowid, tools: registered, repoName: name };
    } catch (error) {
      console.error('Scanner Error:', error);
      return { success: false, error: error.message };
    }
  }
}
