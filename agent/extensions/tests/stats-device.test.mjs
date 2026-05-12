import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createJiti } = require('jiti');
const jiti = createJiti(import.meta.url);
const stats = await jiti.import('../Feature/stats.ts');

function messageEntry(id, timestamp, message) {
  return { type: 'message', id, parentId: null, timestamp, message };
}

test('collectStats reads assistant usage from every supplied session branch', () => {
  const sessions = [
    [
      messageEntry('a1', '2026-05-01T00:00:00.000Z', { role: 'user', content: 'first' }),
      messageEntry('a2', '2026-05-01T00:00:01.000Z', {
        role: 'assistant',
        provider: 'p1',
        model: 'm1',
        usage: {
          input: 10,
          output: 20,
          cacheRead: 30,
          cacheWrite: 40,
          totalTokens: 100,
          cost: { total: 0.5 },
        },
      }),
    ],
    [
      messageEntry('b1', '2026-05-02T00:00:00.000Z', { role: 'user', content: 'second' }),
      messageEntry('b2', '2026-05-02T00:00:01.000Z', {
        role: 'assistant',
        provider: 'p2',
        model: 'm2',
        usage: {
          input: 1,
          output: 2,
          cacheRead: 3,
          cacheWrite: 4,
          totalTokens: 10,
          cost: { total: 0.05 },
        },
      }),
    ],
  ];

  const data = stats.collectStatsFromBranches(sessions, 'all');

  assert.equal(data.userMsgs, 2);
  assert.equal(data.assistantMsgs, 2);
  assert.equal(data.assistantCallsWithUsage, 2);
  assert.equal(data.totals.totalTokens, 110);
  assert.equal(data.totals.cost, 0.55);
  assert.equal(data.models.get('p1/m1')?.calls, 1);
  assert.equal(data.models.get('p2/m2')?.calls, 1);
});

test('/stat command opens statistics built from all device sessions', async () => {
  const allSessions = [
    [
      messageEntry('c1', '2026-05-03T00:00:00.000Z', {
        role: 'assistant',
        provider: 'p1',
        model: 'm1',
        usage: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 30, cost: { total: 0.3 } },
      }),
    ],
    [
      messageEntry('d1', '2026-05-04T00:00:00.000Z', {
        role: 'assistant',
        provider: 'p2',
        model: 'm2',
        usage: { input: 20, output: 60, cacheRead: 0, cacheWrite: 0, totalTokens: 80, cost: { total: 0.8 } },
      }),
    ],
  ];

  class FakeSessionManager {
    static async listAll() {
      return [{ path: 'first.jsonl' }, { path: 'second.jsonl' }];
    }

    static open(path) {
      return { getEntries: () => path === 'first.jsonl' ? allSessions[0] : allSessions[1] };
    }

    getEntries() {
      return [];
    }
  }

  const commands = new Map();
  stats.default({
    events: { emit() {} },
    registerCommand(name, definition) {
      commands.set(name, definition.handler);
    },
  });

  let renderedText = '';
  await commands.get('stat')('', {
    sessionManager: new FakeSessionManager(),
    ui: {
      setWidget() {},
      async custom(factory) {
        const component = factory({ requestRender() {} }, {}, {}, () => {});
        renderedText = component.render(200).join('\n').replace(/\x1b\[[0-9;]*m/g, '');
      },
    },
  });

  assert.match(renderedText, /Usage Stats/);
  assert.match(renderedText, /Total\s+110/);
  assert.match(renderedText, /p1\/m1/);
  assert.match(renderedText, /p2\/m2/);
});

test('heatDays contains last 7 calendar dates with hour buckets', () => {
  const today = new Date();
  const entries = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    d.setHours(10, 0, 0, 0);
    entries.push(messageEntry(`h${i}`, d.toISOString(), {
      role: 'assistant',
      provider: 'p',
      model: 'm',
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 100, cost: { total: 0 } },
    }));
  }

  const data = stats.collectStatsFromBranches([entries], 'all');
  assert.equal(data.heatDays.length, 7);
  // Labels should be MM-DD format
  assert.match(data.heatDays[0].label, /^\d{2}-\d{2}$/);
  // Each row has 24 hour buckets
  for (const row of data.heatDays) {
    assert.equal(row.values.length, 24);
  }
  // Hour 10 should have tokens for today
  const todayRow = data.heatDays[data.heatDays.length - 1];
  assert.ok(todayRow.values[10] > 0);
});

test('heatMonths grid has 7 weekday rows', () => {
  const entries = [
    messageEntry('m1', '2026-03-15T12:00:00.000Z', {
      role: 'assistant',
      provider: 'p',
      model: 'm',
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 50, cost: { total: 0 } },
    }),
    messageEntry('m2', '2026-04-10T08:00:00.000Z', {
      role: 'assistant',
      provider: 'p',
      model: 'm',
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 80, cost: { total: 0 } },
    }),
  ];

  const data = stats.collectStatsFromBranches([entries], 'all');
  assert.equal(data.heatMonths.grid.length, 7);
  assert.ok(data.heatMonths.columns.length >= 2);
});

test('r key cycles range without resetting page', () => {
  const commands = new Map();
  stats.default({
    events: { emit() {} },
    registerCommand(name, definition) {
      commands.set(name, definition.handler);
    },
  });

  let component;
  const ctx = {
    sessionManager: {
      constructor: {
        async listAll() { return []; },
        open() { return { getEntries() { return []; } }; },
      },
      getEntries() {
        return [
          messageEntry('x1', '2026-05-10T10:00:00.000Z', {
            role: 'assistant',
            provider: 'p',
            model: 'm',
            usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 10, cost: { total: 0 } },
          }),
        ];
      },
    },
    ui: {
      setWidget() {},
      async custom(factory) {
        component = factory({ requestRender() {} }, {}, {}, () => {});
      },
    },
  };

  commands.get('stat')('', ctx).then(() => {
    // Switch to page 2 (heatmap)
    component.handleInput('\x1b[C'); // right arrow
    let lines = component.render(200).join('\n').replace(/\x1b\[[0-9;]*m/g, '');
    assert.match(lines, /heatmap/i);
    assert.match(lines, /Page 2/);

    // Press r to cycle range - should stay on page 2
    component.handleInput('r');
    lines = component.render(200).join('\n').replace(/\x1b\[[0-9;]*m/g, '');
    assert.match(lines, /Page 2/);
    assert.match(lines, /7D/);
  });
});

test('heatMonths always has 12 columns with English month abbreviations', () => {
  // Even with no data, heatMonths should have 12 columns
  const data = stats.collectStatsFromBranches([[]], 'all');
  assert.equal(data.heatMonths.columns.length, 12);
  const validNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  for (const col of data.heatMonths.columns) {
    assert.ok(validNames.includes(col), `"${col}" is not a valid month abbreviation`);
  }
  // Grid should still be 7 rows x 12 columns
  assert.equal(data.heatMonths.grid.length, 7);
  for (const row of data.heatMonths.grid) {
    assert.equal(row.length, 12);
  }
});

test('Models by cost columns are aligned', () => {
  const entries = [
    messageEntry('a1', '2026-05-01T00:00:00.000Z', {
      role: 'assistant', provider: 'openai', model: 'gpt-4o',
      usage: { input: 100, output: 200, cacheRead: 0, cacheWrite: 0, totalTokens: 300, cost: { total: 1.5 } },
    }),
    messageEntry('a2', '2026-05-01T01:00:00.000Z', {
      role: 'assistant', provider: 'anthropic', model: 'claude-sonnet-4',
      usage: { input: 5000, output: 10000, cacheRead: 0, cacheWrite: 0, totalTokens: 15000, cost: { total: 12.345 } },
    }),
  ];

  const data = stats.collectStatsFromBranches([entries], 'all');
  const commands = new Map();
  stats.default({
    events: { emit() {} },
    registerCommand(name, definition) { commands.set(name, definition.handler); },
  });

  let component;
  commands.get('stat')('', {
    sessionManager: {
      constructor: { async listAll() { return []; }, open() { return { getEntries() { return []; } }; } },
      getEntries() { return entries; },
    },
    ui: {
      setWidget() {},
      async custom(factory) {
        component = factory({ requestRender() {} }, {}, {}, () => {});
      },
    },
  }).then(() => {
    const lines = component.render(200);
    const plain = lines.map(l => l.replace(/\x1b\[[0-9;]*m/g, ''));
    const modelLines = plain.filter(l => l.includes('calls') && l.includes('tokens') && l.includes('cost') && l.startsWith('  '));
    assert.ok(modelLines.length >= 2, 'should have at least 2 model lines');
    // Check that "calls" keyword starts at the same column in each line
    const callsPositions = modelLines.map(l => l.indexOf('calls'));
    assert.ok(callsPositions.every(p => p === callsPositions[0]), `calls columns not aligned: ${callsPositions}`);
    // Check that "tokens" keyword starts at the same column
    const tokensPositions = modelLines.map(l => l.indexOf('tokens'));
    assert.ok(tokensPositions.every(p => p === tokensPositions[0]), `tokens columns not aligned: ${tokensPositions}`);
    // Check that "cost" keyword starts at the same column
    const costPositions = modelLines.map(l => l.lastIndexOf('cost'));
    assert.ok(costPositions.every(p => p === costPositions[0]), `cost columns not aligned: ${costPositions}`);
  });
});
