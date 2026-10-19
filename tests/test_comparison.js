const assert = require('node:assert/strict');
const {test} = require('node:test');
const {compareRecords} = require('../comparison.js');
const channel = (name, rises = [], extra = {}) => ({name, phase: '', initial: 0, final: 0, rises, falls: [], active_samples: rises.length, ...extra});
const compare = (a, b) => compareRecords({channels: a}, {channels: b});

test('relaciona nomes e fases, independentemente da ordem e número', () => {
  const rows = compare([channel('TRIP', [.01]), channel('52a')], [channel('52a'), channel('TRIP', [.015], {number: 99})]);
  assert.equal(rows[0].status, 'different');
  assert.ok(Math.abs(rows[0].deltas[0] - .005) < 1e-10);
  assert.equal(rows[1].status, 'same');
});
test('expõe canais ausentes em cada registro', () => {
  assert.deepEqual(compare([channel('50')], [channel('51')]).map(c => c.status), ['only_a', 'only_b']);
});
test('nomes repetidos ou vazios não geram deltas enganosos', () => {
  for (const [a,b] of [[[channel('50'), channel('50')],[channel('50')]],[[channel('')],[channel('')]]]) {
    const row = compare(a,b)[0];
    assert.equal(row.status, 'ambiguous');
    assert.deepEqual(row.deltas, []);
  }
});
test('fase diferente impede associação', () => {
  assert.deepEqual(compare([channel('50', [], {phase:'A'})], [channel('50', [], {phase:'B'})]).map(c=>c.status), ['only_a','only_b']);
});
test('compara estados iniciais, retornos e ativações sem par', () => {
  assert.equal(compare([channel('50', [], {initial:1})],[channel('50')])[0].status, 'different');
  assert.equal(compare([channel('50', [], {falls:[.1]})],[channel('50')])[0].status, 'different');
  const row=compare([channel('50', [.1,.2])],[channel('50', [.15])])[0];
  assert.equal(row.status, 'different');
  assert.equal(row.deltas.length, 1);
});
test('zero canais é uma comparação vazia válida', () => {
  assert.deepEqual(compare([],[]), []);
});
