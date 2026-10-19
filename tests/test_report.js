const {test}=require('node:test');
const assert=require('node:assert/strict');
globalThis.compareRecords=require('../comparison.js').compareRecords;
const {createReportPdf,reportLines}=require('../report.js');
const ch=(name,rises=[],initial=0)=>({number:1,name,phase:'',rises,falls:[],initial,final:0,active_samples:rises.length+initial});
const record=channels=>({station:'Estação São José',device:'Relé',start:'19/10/2026',trigger:'19/10/2026',format:'ASCII',samples:3,channels});
test('relatório inclui ativados e sinais já ativos, sem inferir atuação',()=>{
  const r=record([ch('TRIP 50',[.1]),ch('52a',[],1)]);
  const lines=reportLines(r,false).join('\n');
  assert.match(lines,/TRIP 50/);assert.match(lines,/52a/);assert.match(lines,/1 canais ativados/);assert.match(lines,/1 já ativos/);
  assert.match(lines,/não comprova disparo/);
});
test('conclusão compara canais ativados e ausência, sem diferença temporal',()=>{
  const lines=reportLines({a:record([ch('50',[1]),ch('51',[2]),ch('52',[],1)]),b:record([ch('50',[9]),ch('51'),ch('87',[3])])},true).join('\n');
  for(const expected of ['Ativado em ambos: 1','Ativado somente em A: 1','Canal ausente em A: 1','Canal ausente em B: 1'])assert.ok(lines.includes(expected));
  assert.ok(!lines.includes('Δt'));
});
test('PDF válido com offsets, acentos, escapes e várias páginas',()=>{
  const r=record(Array.from({length:120},(_,i)=>ch(`Proteção (São José) \\ ${i} 中`,[1])));
  const pdf=Buffer.from(createReportPdf(r,false));const text=pdf.toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4'));assert.match(text,/U\+4E2D/);assert.ok(text.includes('São José'));
  assert.match(text,/\\\(São José\\\)/);
  const start=Number(text.match(/startxref\n(\d+)/)[1]);assert.equal(text.slice(start,start+4),'xref');
  assert.ok(Number(text.match(/\/Count (\d+)/)[1])>1);
  const offsets=[...text.matchAll(/^(\d{10}) 00000 n /gm)];
  offsets.forEach((m,i)=>assert.ok(text.slice(Number(m[1])).startsWith(`${i+1} 0 obj`)));
});
