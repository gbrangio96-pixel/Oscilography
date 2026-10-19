const {test}=require('node:test');
const assert=require('node:assert/strict');
globalThis.compareRecords=require('../comparison.js').compareRecords;
const {createReportPdf,reportLines,createReportLayout}=require('../report.js');
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

test('relatório usa polaridade interpretada e inclui origem, regra e qualidade',()=>{
  const c={...ch('SAIDA_07',[]),activations:[.1],initial_active:false,normal:'0',classification:{category:'disparo',function:'',active_state:0,status:'manual',profile_id:'rele-b',profile_version:'2.1',rule_id:'saida-7',reason:'Diagrama 42',reviewer:'Eng. Responsável',canonical:'trip_geral'}};
  const r={...record([c]),profile:{id:'rele-b',version:'2.1',sha256:'abc123',generic_fallback_version:'1.0'},files:{cfg_name:'b.cfg',dat_name:'b.dat',cfg_sha256:'cfg-hash',dat_sha256:'dat-hash'},validation:{checks:['Formato DAT'],warnings:['Há lacunas']}};
  const lines=reportLines(r,false).join('\n');
  for(const phrase of ['1 canais ativados','0 já ativos','REVISÃO MANUAL','ativo em 0','Diagrama 42','saida-7','Eng. Responsável','Há lacunas','cfg-hash','rele-b'])assert.ok(lines.includes(phrase),phrase);
});

test('diagramação mantém nomes e justificativas longos dentro da página e preserva todos os canais',()=>{
  const channels=Array.from({length:65},(_,i)=>({...ch('CANAL_'+i+'_'+'W'.repeat(260),[.1]),number:i+1,classification:{category:'desconhecido',function:'',active_state:1,status:'suggested',rule_id:'regra-'+i,profile_id:'teste',profile_version:'1.0',reason:'Justificativa longa '.repeat(100),reviewer:'',canonical:''}}));
  const doc=createReportLayout(record(channels),false);
  assert.ok(doc.pages.length>5);
  const runs=doc.pages.flatMap(p=>p.text);
  for(const t of runs){assert.ok(t.x>=40&&t.x+t.width<=555.1,JSON.stringify(t));assert.ok(t.y>=0&&t.y+t.size<=782,JSON.stringify(t))}
  const text=runs.map(t=>t.s).join('\n');
  for(let i=0;i<channels.length;i++)assert.ok(text.includes('CANAL_'+i+'_'));
  assert.equal(doc.bookmarks.length,6);
  assert.ok(Buffer.from(doc.serialize()).toString('latin1').includes('/Outlines'));
});

test('linhas múltiplas são preservadas e tabelas repetem cabeçalhos nas continuações',()=>{
  const {Document,wrap}=require('../pdf_layout.js');
  assert.deepEqual(wrap('Primeira linha\nSegunda linha',200),['Primeira linha','Segunda linha']);
  const doc=new Document('Teste');doc.y=76;
  doc.table(['COLUNA UM','COLUNA DOIS'],[['A'.repeat(10000),'Fim do conteúdo']], [150,365]);
  assert.ok(doc.pages.length>1);
  for(const page of doc.pages)assert.ok(page.text.some(t=>t.s==='COLUNA UM'));
  const all=doc.pages.flatMap(p=>p.text).map(t=>t.s);
  assert.equal(all.filter(t=>/^A+$/.test(t)).join('').length,10000);
  assert.ok(all.includes('Fim do conteúdo'));
});

test('comparação diagramada preserva exclusividades, nomes originais e ausências sem delta temporal',()=>{
  const doc=createReportLayout({a:record([ch('50',[1]),ch('51',[2])]),b:record([ch('50',[9]),ch('87',[3])])},true);
  const text=doc.pages.flatMap(p=>p.text).map(t=>t.s).join('\n');
  assert.ok(text.includes('Ativado em ambos'));
  assert.ok(text.includes('Ausente no CFG'));
  assert.ok(text.replace(/\s+/g,' ').includes('Não são comparados horários'));
  assert.ok(!text.includes('Δt'));
});

test('objeto opcional aparece no resumo e mantém evidência e hash do HDR',()=>{
  const r={...record([ch('50',[1])]),object:{name:'LT 230 kV São José - Modelo',type:'LT',status:'extracted',source:'a.hdr',evidence:'Objeto protegido: LT 230 kV São José - Modelo',candidates:[]},hdr:{available:true,warnings:[]},files:{hdr_name:'a.hdr',hdr_sha256:'hdr-hash'}};
  const doc=createReportLayout(r,false);
  const text=doc.pages.flatMap(p=>p.text).map(t=>t.s).join(' ');
  for(const value of ['LT 230 kV São José - Modelo','Objeto relacionado','Objeto protegido:','SHA-256 HDR','hdr-hash'])assert.ok(text.includes(value),value);
});
