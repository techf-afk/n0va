export function toSarif(findings, execution) {
  const rules = [];
  const ruleMap = new Map();
  const results = [];

  const levelMap = {
    critical: 'error',
    high: 'error',
    medium: 'warning',
    low: 'note',
    info: 'note',
  };

  for (const f of findings) {
    const ruleKey = `${f.tool || 'unknown'}/${f.cwe || 'no-cwe'}`;
    let ruleIndex = ruleMap.get(ruleKey);
    if (ruleIndex === undefined) {
      ruleIndex = rules.length;
      ruleMap.set(ruleKey, ruleIndex);
      const cweId = f.cwe ? f.cwe.replace('CWE-', '').split(':')[0].trim() : '';
      rules.push({
        id: ruleKey,
        shortDescription: { text: f.message || 'No description' },
        fullDescription: { text: f.message || 'No description' },
        defaultConfiguration: { level: levelMap[f.severity] || 'note' },
        helpUri: cweId ? `https://cwe.mitre.org/data/definitions/${cweId}.html` : undefined,
        properties: { cwe: f.cwe || '', tool: f.tool || '' },
      });
    }

    results.push({
      ruleId: ruleKey,
      ruleIndex,
      level: levelMap[f.severity] || 'note',
      message: { text: f.message || 'No description' },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: f.file ? `file://${f.file}` : 'file:///unknown' },
            region: { startLine: f.line || 0 },
          },
        },
      ],
      properties: {
        tool: f.tool || '',
        isNew: f.isNew !== undefined ? f.isNew : undefined,
        alsoFoundBy: f.dedupedFrom && f.dedupedFrom.length ? f.dedupedFrom : undefined,
      },
    });
  }

  const parseDate = (val) => {
    if (!val) return new Date().toISOString();
    const d = val.includes('T') ? new Date(val) : new Date(val.replace(' ', 'T') + 'Z');
    return d instanceof Date && !isNaN(d) ? d.toISOString() : new Date().toISOString();
  };

  const formattedStart = parseDate(execution.created_at);
  const formattedEnd = parseDate(execution.completed_at);

  return {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'n0va',
            fullName: 'n0va Security Orchestrator',
            informationUri: 'http://localhost:3001',
            rules: rules.length > 0 ? rules : undefined,
          },
        },
        results,
        invocations: [
          {
            executionSuccessful: execution.status === 'completed',
            startTimeUtc: formattedStart,
            endTimeUtc: formattedEnd,
          },
        ],
      },
    ],
  };
}
