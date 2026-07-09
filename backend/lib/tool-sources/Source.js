// Source interface — like torlink's Source type
// Every source module extends this

export class ToolSource {
  constructor(config = {}) {
    this.id = 'base';
    this.label = 'Base';
    this.category = 'general';
    this.homepage = '';
    this.timeoutMs = 8000;
    this.maxResults = 5;
  }

  async search(query, opts = {}) {
    throw new Error('Subclass must implement search()');
  }
}
