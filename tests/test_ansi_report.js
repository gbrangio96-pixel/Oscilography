const assert=require('node:assert/strict');
const {test}=require('node:test');
globalThis.compareRecords=require('../comparison.js').compareRecords;
const {reportLines,createReportLayout,createReportPdf}=require('../report.js');

const channel=(number,name,rises,initial=0)=>({number,name,phase:'A',rises,falls:[],initial,final:0,active_samples:initial+rises.length});
function record(){
  return {station:'SE de teste',device:'IED',start:'20/10/2026,12:00:00',trigger:'20/10/2026,12:00:00',format:'ASCII',samples:10,channels:[channel(1,'50P_START',[.002]),channel(2,'51P_START',[.002]),channel(3,'BLOCK_86',[],1),channel(4,'CUSTOM',[.005])],ansi:{
    catalog_version:'ref-1',
    functions:[
      {code:'50',name:'Sobrecorrente instantânea',activated:true,activation_count:1,first_activation:.002,channels:[{number:1,name:'50P_START',phase:'A',category:'partida',status:'suggested'}]},
      {code:'51',name:'Sobrecorrente temporizada',activated:true,activation_count:1,first_activation:.002,channels:[{number:2,name:'51P_START',phase:'A',category:'partida',status:'confirmed'}]},
      {code:'86',name:'Bloqueio',activated:false,activation_count:0,first_activation:null,channels:[{number:3,name:'BLOCK_86',phase:'A',category:'bloqueio',status:'manual'}]}
    ],
    timeline:[
      {order:1,time:.002,codes:['50'],names:['Sobrecorrente instantânea'],channel_number:1,channel_name:'50P_START',phase:'A',category:'partida',status:'suggested',simultaneous:true},
      {order:1,time:.002,codes:['51'],names:['Sobrecorrente temporizada'],channel_number:2,channel_name:'51P_START',phase:'A',category:'partida',status:'confirmed',simultaneous:true},
      {order:2,time:.005,codes:[],names:[],channel_number:4,channel_name:'CUSTOM',phase:'',category:'desconhecido',status:'unclassified',simultaneous:false}
    ],
    initial_active:[{code:'86',name:'Bloqueio',channel_number:3,channel_name:'BLOCK_86',status:'manual'}],
    unmapped_channels:[{number:4,name:'CUSTOM',reason:'Sem código ANSI associado'}]
  }};
}
const layoutText=doc=>doc.pages.flatMap(page=>page.text.map(item=>item.s)).join(' ').replace(/\s+/g,' ');

test('instantes submicrossegundo distintos continuam distinguíveis no PDF',()=>{
  const r=record();
  r.ansi.timeline=r.ansi.timeline.slice(0,2).map((e,i)=>({...e,time:(i+1)*1e-9,order:i+1,simultaneous:false}));
  const text=layoutText(createReportLayout(r,false));
  assert.ok(text.includes('0.000000001 s'));
  assert.ok(text.includes('0.000000002 s'));
});

test('relatório semântico inclui códigos, nomes, momentos, empates, origens e sinais já ativos separados',()=>{
  const text=reportLines(record(),false).join('\n');
  for(const expected of ['ANSI 50','Sobrecorrente instantânea','ANSI 51','0.002000 s','Ordem 1 · SIMULTÂNEO','Ordem 2','0.005000 s','SUGESTÃO','PERFIL CONFIRMADO','REVISÃO MANUAL','BLOCK_86','Já ativo no início','CUSTOM','Sem código ANSI associado'])assert.ok(text.includes(expected),expected);
  assert.ok(text.includes('não identifica automaticamente a função responsável pelo trip'));
  assert.ok(!text.includes('Ordem 0'));
  assert.ok(!text.includes('0.000000 s'));
});

test('PDF usa tabela de funções e sequência com origem, sem criar seção extra ou responsabilizar pelo trip',()=>{
  const doc=createReportLayout(record(),false),text=layoutText(doc);
  for(const expected of ['Funções ANSI associadas aos canais','50 · Sobrecorrente instantânea','Sequência de ativações por registro','0.002000 s','SIMULTÂNEO','PERFIL CONFIRMADO','SUGESTÃO','Canais sem associação ANSI','momento da ativação não observado'])assert.ok(text.includes(expected),expected);
  assert.equal(doc.bookmarks.length,6);
  assert.ok(Buffer.from(createReportPdf(record(),false)).toString('latin1').startsWith('%PDF-1.4'));
});

test('comparação mantém duas colunas e sequências independentes com ausência de associação diferente de não ativação',()=>{
  const a=record(),b=record();
  b.ansi.functions=b.ansi.functions.filter(fn=>fn.code!=='51');
  b.ansi.timeline=[{...b.ansi.timeline[0],time:12.5,simultaneous:false}];
  const doc=createReportLayout({a,b},true),text=layoutText(doc);
  assert.ok(text.includes('OSCILOGRAFIA A'));
  assert.ok(text.includes('OSCILOGRAFIA B'));
  assert.ok(text.includes('Função não identificada neste registro.'));
  assert.ok(text.includes('0.002000 s')&&text.includes('12.500000 s'));
  assert.ok(text.includes('não estabelecem correspondência entre eventos de A e B'));
  assert.ok(text.includes('Sem ocorrência nesta posição da sequência.'));
  assert.ok(!text.includes('Δt'));
});

test('associação múltipla é preservada como funções associadas ao sinal sem confirmação individual',()=>{
  const r=record();r.ansi.timeline=[{...r.ansi.timeline[0],codes:['50','51'],names:['Instantânea','Temporizada'],simultaneous:false}];
  const text=layoutText(createReportLayout(r,false));
  assert.ok(text.includes('ANSI 50 / 51'));
  assert.ok(text.includes('não confirma independentemente a atuação de cada função'));
});

test('catálogo vazio e registro sem ANSI são tratados sem conteúdo inventado',()=>{
  const empty=record();empty.ansi={catalog_version:'ref-1',functions:[],timeline:[],initial_active:[],unmapped_channels:[]};
  const text=layoutText(createReportLayout(empty,false));
  assert.ok(text.includes('Nenhuma associação ANSI identificada.'));
  assert.ok(text.includes('Nenhuma nova ativação na sequência ANSI.'));
  const legacy=record();delete legacy.ansi;
  assert.ok(!layoutText(createReportLayout(legacy,false)).includes('Sequência de ativações por registro'));
});

test('tabelas extensas ANSI preservam eventos e permanecem nos limites da página',()=>{
  const r=record();r.ansi.timeline=Array.from({length:100},(_,i)=>({...r.ansi.timeline[0],order:i+1,time:i/1000,channel_name:`SINAL_${i}_`+'W'.repeat(160),simultaneous:false}));
  const doc=createReportLayout({a:r,b:record()},true),text=layoutText(doc);
  for(let i=0;i<100;i++)assert.ok(text.includes(`SINAL_${i}_`));
  for(const run of doc.pages.flatMap(page=>page.text)){
    assert.ok(run.x>=40&&run.x+run.width<=555.1,JSON.stringify(run));
    assert.ok(run.y+run.size<=782,JSON.stringify(run));
  }
});
