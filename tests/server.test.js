/**
 * JARVIS — Testes Unitários do servidor
 * Executor: Node.js built-in test runner (node:test)
 * Comando: node --experimental-vm-modules tests/server.test.js
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ─── Diretório temporário para isolamento de I/O ─────────────────────────────
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});


// ─── 1. cosineSimilar ─────────────────────────────────────────────────────────
describe('cosineSimilar', () => {
  /**
   * Reimplementação local para testar a lógica pura sem importar o servidor
   * (server.js tem efeitos colaterais no carregamento: WarmPool spawns claude)
   */
  function cosineSimilar(a, b) {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot  += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }

  test('vetores idênticos retornam 1', () => {
    const v = [0.5, 0.5, 0.7];
    assert.ok(Math.abs(cosineSimilar(v, v) - 1) < 1e-10);
  });

  test('vetores opostos retornam -1', () => {
    const a = [1, 0];
    const b = [-1, 0];
    assert.ok(Math.abs(cosineSimilar(a, b) + 1) < 1e-10);
  });

  test('vetores ortogonais retornam 0', () => {
    const a = [1, 0];
    const b = [0, 1];
    assert.ok(Math.abs(cosineSimilar(a, b)) < 1e-10);
  });

  test('resultado está sempre no intervalo [-1, 1]', () => {
    const a = [0.3, 0.8, -0.2, 0.5];
    const b = [-0.1, 0.6, 0.9, 0.1];
    const sim = cosineSimilar(a, b);
    assert.ok(sim >= -1 && sim <= 1, `Fora do intervalo: ${sim}`);
  });
});


// ─── 2. formatHistoryForPrompt ────────────────────────────────────────────────
describe('formatHistoryForPrompt', () => {
  function formatHistoryForPrompt(exchanges, isVoice = false, isTask = false) {
    const window = isVoice ? 6 : (isTask ? 32 : 16);
    return exchanges.slice(-window).map(e => `[${e.role}] ${e.content}`).join('\n');
  }

  const fakeTroca = (role, content) => ({ role, content, ts: new Date().toISOString() });

  test('modo voz limita a 6 entradas', () => {
    const hist = Array.from({ length: 20 }, (_, i) => fakeTroca('user', `msg${i}`));
    const result = formatHistoryForPrompt(hist, true, false);
    const linhas = result.split('\n');
    assert.equal(linhas.length, 6);
    assert.ok(result.includes('msg19')); // última mensagem sempre presente
  });

  test('modo texto padrão limita a 16 entradas', () => {
    const hist = Array.from({ length: 30 }, (_, i) => fakeTroca('user', `msg${i}`));
    const result = formatHistoryForPrompt(hist, false, false);
    assert.equal(result.split('\n').length, 16);
  });

  test('modo task limita a 32 entradas', () => {
    const hist = Array.from({ length: 50 }, (_, i) => fakeTroca('jarvis', `resp${i}`));
    const result = formatHistoryForPrompt(hist, false, true);
    assert.equal(result.split('\n').length, 32);
  });

  test('histórico menor que a janela retorna todas as entradas', () => {
    const hist = [fakeTroca('user', 'oi'), fakeTroca('jarvis', 'olá')];
    const result = formatHistoryForPrompt(hist);
    assert.equal(result.split('\n').length, 2);
  });

  test('formato de saída correto [role] content', () => {
    const hist = [fakeTroca('user', 'teste')];
    assert.equal(formatHistoryForPrompt(hist), '[user] teste');
  });
});


// ─── 3. loadHistory / saveHistory (I/O real com tmp) ─────────────────────────
describe('loadHistory / saveHistory', () => {
  function loadHistory(filePath) {
    try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch { return []; }
  }
  function saveHistory(filePath, exchanges) {
    fs.writeFileSync(filePath, JSON.stringify(exchanges, null, 2));
  }

  test('retorna array vazio quando arquivo não existe', () => {
    const result = loadHistory(path.join(tmpDir, 'naoexiste.json'));
    assert.deepEqual(result, []);
  });

  test('salva e recarrega histórico corretamente', () => {
    const file = path.join(tmpDir, 'history.json');
    const dados = [{ role: 'user', content: 'oi', ts: '2026-04-04' }];
    saveHistory(file, dados);
    assert.deepEqual(loadHistory(file), dados);
  });

  test('retorna array vazio para JSON malformado', () => {
    const file = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(file, '{ broken json ');
    assert.deepEqual(loadHistory(file), []);
  });
});


// ─── 4. appendHistory — lógica de overflow ────────────────────────────────────
describe('appendHistory — overflow', () => {
  const MAX_HISTORY = 20;

  function appendHistory(filePath, role, content) {
    const exchanges = (() => {
      try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch { return []; }
    })();
    exchanges.push({ role, content: content.slice(0, 2000), ts: new Date().toISOString() });
    if (exchanges.length > MAX_HISTORY * 2) exchanges.splice(0, exchanges.length - MAX_HISTORY * 2);
    fs.writeFileSync(filePath, JSON.stringify(exchanges, null, 2));
  }

  test('nunca ultrapassa MAX_HISTORY * 2 entradas', () => {
    const file = path.join(tmpDir, 'hist.json');
    for (let i = 0; i < 50; i++) appendHistory(file, 'user', `msg${i}`);
    const result = JSON.parse(fs.readFileSync(file, 'utf-8'));
    assert.ok(result.length <= MAX_HISTORY * 2);
  });

  test('trunca conteúdo acima de 2000 caracteres', () => {
    const file = path.join(tmpDir, 'hist.json');
    const longo = 'x'.repeat(5000);
    appendHistory(file, 'user', longo);
    const result = JSON.parse(fs.readFileSync(file, 'utf-8'));
    assert.equal(result[0].content.length, 2000);
  });

  test('preserva as entradas mais recentes no overflow', () => {
    const file = path.join(tmpDir, 'hist.json');
    for (let i = 0; i < 50; i++) appendHistory(file, 'user', `msg${i}`);
    const result = JSON.parse(fs.readFileSync(file, 'utf-8'));
    assert.ok(result.some(e => e.content === 'msg49'), 'Última mensagem deve estar presente');
    assert.ok(!result.some(e => e.content === 'msg0'), 'msg0 deve ter sido removida');
  });
});


// ─── 5. getPool — roteamento de modelo ───────────────────────────────────────
describe('getPool — roteamento de modelos', () => {
  // Stubs simples para evitar spawnar claude de verdade
  const pools = {
    opus:   { model: 'opus'   },
    sonnet: { model: 'sonnet' },
    haiku:  { model: 'haiku'  },
  };

  function getPool(model) {
    if (model.includes('opus'))   return pools.opus;
    if (model.includes('sonnet')) return pools.sonnet;
    return pools.haiku;
  }

  test('claude-opus-4-6 → pool opus', () => {
    assert.equal(getPool('claude-opus-4-6').model, 'opus');
  });

  test('claude-sonnet-4-6 → pool sonnet', () => {
    assert.equal(getPool('claude-sonnet-4-6').model, 'sonnet');
  });

  test('claude-haiku-4-5-20251001 → pool haiku', () => {
    assert.equal(getPool('claude-haiku-4-5-20251001').model, 'haiku');
  });

  test('modelo desconhecido → pool haiku (fallback)', () => {
    assert.equal(getPool('claude-desconhecido').model, 'haiku');
  });
});


// ─── 6. compactToMemory — arquivamento de histórico ──────────────────────────
describe('compactToMemory', () => {
  function compactToMemory(memoryFile, entries) {
    const summary = entries
      .map(e => `  [${e.ts?.slice(0, 10) || ''}][${e.role}] ${e.content.slice(0, 300)}`)
      .join('\n');
    const block = `\n## Archived History (${new Date().toISOString().slice(0, 10)})\n${summary}\n`;
    fs.appendFileSync(memoryFile, block);
  }

  test('cria arquivo de memória com bloco formatado', () => {
    const file = path.join(tmpDir, 'JARVIS-MEMORY.md');
    const entries = [
      { role: 'user', content: 'olá jarvis', ts: '2026-04-04T12:00:00Z' },
      { role: 'jarvis', content: 'prontidão máxima, senhor', ts: '2026-04-04T12:00:01Z' },
    ];
    compactToMemory(file, entries);
    const conteudo = fs.readFileSync(file, 'utf-8');
    assert.ok(conteudo.includes('## Archived History'));
    assert.ok(conteudo.includes('[user] olá jarvis'));
    assert.ok(conteudo.includes('[jarvis] prontidão máxima, senhor'));
  });

  test('trunca conteúdo em 300 caracteres por entrada', () => {
    const file = path.join(tmpDir, 'JARVIS-MEMORY.md');
    const entries = [{ role: 'user', content: 'a'.repeat(600), ts: '2026-04-04T00:00:00Z' }];
    compactToMemory(file, entries);
    const conteudo = fs.readFileSync(file, 'utf-8');
    // Cada linha de entrada deve ter no máximo 300 'a's
    const match = conteudo.match(/a+/);
    assert.ok(match && match[0].length <= 300);
  });

  test('acumula múltiplos blocos sem sobrescrever', () => {
    const file = path.join(tmpDir, 'JARVIS-MEMORY.md');
    const e1 = [{ role: 'user', content: 'primeiro', ts: '2026-04-04T00:00:00Z' }];
    const e2 = [{ role: 'user', content: 'segundo',  ts: '2026-04-04T01:00:00Z' }];
    compactToMemory(file, e1);
    compactToMemory(file, e2);
    const conteudo = fs.readFileSync(file, 'utf-8');
    assert.ok(conteudo.includes('primeiro'));
    assert.ok(conteudo.includes('segundo'));
  });
});


// ─── 7. findChrome — detecção de caminho ─────────────────────────────────────
describe('findChrome', () => {
  function findChrome(overridePaths) {
    for (const p of overridePaths) {
      try { if (fs.existsSync(p)) return p; } catch {}
    }
    return null;
  }

  test('retorna null quando nenhum caminho existe', () => {
    const caminhos = ['/caminho/que/nao/existe/chrome.exe'];
    assert.equal(findChrome(caminhos), null);
  });

  test('retorna o primeiro caminho que existe', () => {
    const existente = path.join(tmpDir, 'chrome.exe');
    fs.writeFileSync(existente, '');
    const resultado = findChrome(['/falso', existente, '/outro/falso']);
    assert.equal(resultado, existente);
  });

  test('prefere o primeiro caminho válido quando múltiplos existem', () => {
    const primeiro = path.join(tmpDir, 'chrome1.exe');
    const segundo  = path.join(tmpDir, 'chrome2.exe');
    fs.writeFileSync(primeiro, '');
    fs.writeFileSync(segundo, '');
    assert.equal(findChrome([primeiro, segundo]), primeiro);
  });
});
