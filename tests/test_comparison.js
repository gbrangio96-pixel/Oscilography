const assert = require('node:assert/strict');
const {test} = require('node:test');
const {compareRecords} = require('../comparison.js');
const channel = (name, rises = [], extra = {}) => ({name, phase: '', initial: 0, final: 0, rises, falls: [], active_samples: rises.length, ...extra});
const compare = (a, b) => compareRecords({channels: a}, {channels: b});

test('relaciona nomes e fases, independentemente da ordem e número', () => {
  const rows = compare([channel('TRIP', [.01]), channel('52a')], [channel('52a'), channel('TRIP', [.015], {number: 99})]);
  assert.equal(rows[0].status, 'both');
  assert.equal('deltas' in rows[0], false);
  assert.equal(rows[1].status, 'neither');
});
test('expõe canais ausentes em cada registro', () => {
  assert.deepEqual(compare([channel('50')], [channel('51')]).map(c => c.status), ['missing_b', 'missing_a']);
});
test('nomes repetidos ou vazios não geram deltas enganosos', () => {
  for (const [a,b] of [[[channel('50'), channel('50')],[channel('50')]],[[channel('')],[channel('')]]]) {
    const row = compare(a,b)[0];
    assert.equal(row.status, 'ambiguous');
    assert.equal('deltas' in row, false);
  }
});
test('fase diferente impede associação', () => {
  assert.deepEqual(compare([channel('50', [], {phase:'A'})], [channel('50', [], {phase:'B'})]).map(c=>c.status), ['missing_b','missing_a']);
});
test('ignora horários, retornos, estados finais e quantidade de ativações', () => {
  const row=compare([channel('50', [.1,.2], {initial:1,falls:[.3]})],[channel('50', [8], {final:1})])[0];
  assert.equal(row.status, 'both');
  assert.equal('deltas' in row, false);
});
test('distingue ativação exclusiva, ausência e sinal já ativo', () => {
  assert.equal(compare([channel('50',[.1])],[channel('50')])[0].status,'only_a');
  assert.equal(compare([channel('50')],[channel('50',[.1])])[0].status,'only_b');
  assert.equal(compare([channel('50',[],{initial:1,active_samples:3})],[channel('50')])[0].status,'neither');
});
test('zero canais é uma comparação vazia válida', () => {
  assert.deepEqual(compare([],[]), []);
});
