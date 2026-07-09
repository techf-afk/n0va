/**
 * AI Client - Connects to 9router for AI capabilities
 */
export class AIClient {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || 'http://127.0.0.1:20128/v1';
    this.apiKey = config.apiKey || 'any';
    this.defaultModel = config.model || 'kr/claude-sonnet-4';
  }

  async chat(messages, options = {}) {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: options.model || this.defaultModel,
          messages,
          temperature: options.temperature || 0.7,
          max_tokens: options.maxTokens || 2000,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`AI API error: ${response.status} ${response.statusText}`);
      }

      const text = await response.text();

      // Handle SSE format if present
      if (text.startsWith('data:')) {
        // Parse SSE stream - get the last complete JSON chunk
        const lines = text.split('\n').filter(line => line.startsWith('data:'));
        const lastDataLine = lines[lines.length - 1];
        const jsonStr = lastDataLine.replace('data: ', '').trim();

        if (jsonStr === '[DONE]') {
          // Get the second to last line if last is [DONE]
          const secondLastLine = lines[lines.length - 2];
          const data = JSON.parse(secondLastLine.replace('data: ', '').trim());
          return data.choices[0].message?.content || data.choices[0].delta?.content || '';
        }

        const data = JSON.parse(jsonStr);
        return data.choices[0].message?.content || data.choices[0].delta?.content || '';
      }

      // Handle regular JSON response
      const data = JSON.parse(text);
      return data.choices[0].message.content;
    } catch (error) {
      console.error('AI Client Error:', error);
      throw error;
    }
  }

  async analyzeRepo(repoData) {
    const prompt = `Analyze this GitHub repository and provide structured information:

Repository: ${repoData.name}
README:
${repoData.readme}

Package files:
${JSON.stringify(repoData.packageInfo, null, 2)}

Please provide a JSON response with:
{
  "type": "api|cli|library|service|other",
  "description": "Brief description",
  "capabilities": ["list", "of", "capabilities"],
  "interface": {
    "type": "rest|graphql|cli|function|docker",
    "details": "How to invoke it"
  },
  "inputs": ["expected inputs"],
  "outputs": ["expected outputs"]
}`;

    const response = await this.chat([
      { role: 'system', content: 'You are a tool analyzer. Always respond with valid JSON.' },
      { role: 'user', content: prompt }
    ]);

    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  }

  async planOrchestration(userRequest, availableTools) {
    const prompt = `User wants: "${userRequest}"

Available tools:
${JSON.stringify(availableTools, null, 2)}

RULES:
1. ALWAYS add a "clone" step first with tool_id of the git tool (or any available tool) and inputs.repository set to the repo URL from user request.
2. IMPORTANT: For "action" use a short keyword that matches the tool purpose, like "clone", "gitleaks", "trufflehog", "semgrep", "nmap".
3. Each security tool (gitleaks, trufflehog, semgrep) gets its own separate step.
4. Steps run sequentially, passing results via context.

Create an execution plan as JSON:
{
  "steps": [
    {
      "tool": "tool_id",
      "action": "clone",
      "inputs": {},
      "outputTo": "step_2"
    }
  ]
}`;

    const response = await this.chat([
      { role: 'system', content: 'You are an orchestration planner. Always respond with valid JSON.' },
      { role: 'user', content: prompt }
    ]);

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  }
}
