
let result;const el=id=>document.getElementById(id);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function b64(file){let bytes=new Uint8Array(await file.arrayBuffer()),s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s)}
const acts=channelActivations, initial=channelInitialActive;
const origins={suggested:'Sugestão automática',confirmed:'Perfil confirmado',manual:'Revisão manual',unclassified:'Não classificado',conflict:'Conflito de regras'};
function classificationHtml(c){const cl=c.classification;if(!cl)return '';return `<b>${esc(cl.category)}${cl.function?' · ANSI '+esc(cl.function):''}</b><small>${esc(origins[cl.status])} · Estado ativo: ${cl.active_state}</small><small>Regra: ${esc(cl.rule_id||'nenhuma')} · Perfil ${esc(cl.profile_id)} v${esc(cl.profile_version)}</small><small>${esc(cl.reason)}</small>${cl.reviewer?`<small>Responsável: ${esc(cl.reviewer)}</small>`:''}${cl.canonical?`<small>Equivalência: ${esc(cl.canonical)}</small>`:''}`}
function qualityHtml(r,label=''){return objectHtml(r,label==='B'?'B':'A')+`<h3>${esc(label)} · Qualidade e rastreabilidade</h3><p>Perfil ${esc(r.profile.id)} v${esc(r.profile.version)} · Revisão ${esc(r.revision)} (${esc(r.revision_mode||'standard')}) · ${r.validation.checks.length} verificações estruturais concluídas.</p>${r.validation.warnings.length?'<ul class="warning">'+r.validation.warnings.map(w=>`<li>${esc(w)}</li>`).join('')+'</ul>':'<p>Sem alertas estruturais detectados. Isso não comprova a correção da lógica ou da polaridade do relé.</p>'}<p>${r.channels.filter(c=>['unclassified','conflict','suggested'].includes(c.classification.status)).length} canais com interpretação ou polaridade não confirmada.</p><details><summary>Arquivos e hashes SHA-256</summary><p>${esc(r.files.cfg_name)}<br>${esc(r.files.cfg_sha256)}<br>${esc(r.files.dat_name)}<br>${esc(r.files.dat_sha256)}${r.files.container_name?`<br>Contêiner: ${esc(r.files.container_name)}<br>${esc(r.files.container_sha256)}`:''}${(r.files.dat_segments||[]).map(p=>`<br>Segmento: ${esc(p.name)}<br>${esc(p.sha256)}`).join('')}<br>Perfil: ${esc(r.profile.sha256)}</p></details>`}
function render(){const list=result.channels.filter(c=>el('filter').value==='all'||(el('filter').value==='rises'?acts(c).length:channelActiveSamples(c)));el('channels').innerHTML=list.map(c=>`<tr><td><b>${esc(c.name||'(sem identificação no CFG)')}</b><small>#${c.number} ${esc(c.phase)} · Normal CFG: ${esc(c.normal??'não informado')}</small></td><td>${c.initial} → ${c.final}${initial(c)?' <small>Já ativo no início</small>':''}</td><td class="tag">${acts(c).length}${durationHtml(c)}<small>Entrada no estado ${c.classification.active_state}</small></td><td>${classificationHtml(c)}${reviewButton(c,'A')}<small>Transições observadas (s): ${acts(c).map(t=>t.toFixed(6)).join(' · ')||'nenhuma'}</small></td><td>${c.returns.map(t=>t.toFixed(6)).join(' · ')||'—'}</td></tr>`).join('');el('empty').hidden=!!list.length}

let comparison;
const statusLabels={both:'Ativado em ambos',only_a:'Ativado somente em A',only_b:'Ativado somente em B',neither:'Sem ativação em ambos',missing_a:'Canal ausente em A',missing_b:'Canal ausente em B',ambiguous:'Correspondência ambígua'};
function channelSummary(channels,side){return channels.map(c=>`<b>${esc(c.name)} · #${c.number} · ${acts(c).length?'ATIVADO':'Sem nova ativação'}</b><small>${acts(c).length} entrada(s) no estado ${c.classification.active_state}</small>${durationHtml(c)}<small>Estado ${c.initial} → ${c.final}${initial(c)?' · Já ativo no início':''}</small>${classificationHtml(c)}${reviewButton(c,side)}`).join('<br>')||'Ausente no CFG'}
function renderComparison(){
  const mode=el('compareFilter').value;
  const rows=comparison.channels.filter(c=>mode==='all'||(mode==='different'?['only_a','only_b','missing_a','missing_b','ambiguous'].includes(c.status):c.activatedA||c.activatedB));
  el('compareRows').innerHTML=rows.map(c=>`<tr>${['a','b'].map(side=>`<td><div class="pair-context"><b>${esc(statusLabels[c.status])}</b><small>Correspondência: ${esc(c.name||'(sem identificação no CFG)')} · Fase: ${esc(c.phase||'—')}</small><small>${esc(c.basis)}</small></div>${channelSummary(c[side],side.toUpperCase())}</td>`).join('')}</tr>`).join('');
  el('compareEmpty').hidden=!!rows.length;
}
function download(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function durationHtml(c){return `<small><b>Tempo ativo observado: ${((c.total_active_duration||0)*1000).toFixed(3)} ms</b>${c.duration_estimated?' · estimado com lacunas':''}</small><details><summary>Intervalos ativos</summary>${(c.active_intervals||[]).map(i=>`<small>${(i.observed_duration*1000).toFixed(3)} ms · ${i.start.toFixed(6)} a ${i.end.toFixed(6)} s${i.left_censored?' · Já ativo no início':''}${i.right_censored?' · Ativo no fim':''}${i.gap_affected?' · Lacuna de amostras':''}</small>`).join('')||'Nenhum intervalo ativo.'}</details>`}
function resetResults(){el('analogResults').hidden=true;el('results').hidden=true;el('comparison').hidden=true;el('error').textContent='';result=undefined;comparison=undefined}
function updateMode(){const compare=el('mode').value==='compare';el('second').hidden=!compare;for(const id of ['cfgB','datB']){el(id).disabled=!compare;el(id).required=compare}el('run').textContent=compare?'Comparar oscilografias →':'Analisar oscilografia →';resetResults()}
el('mode').onchange=()=>{updateMode();updateInputs()};
function updateInputs(){
  const compare=el('mode').value==='compare';
  for(const [first,second,enabled] of [['cfg','dat',true],['cfgB','datB',compare]]){
    const single=/\.(cff|zip)$/i.test(el(first).files[0]?.name||'');
    el(second).required=enabled&&!single;el(second).disabled=!enabled||single;
  }
}
for(const id of ['cfg','dat','cfgB','datB','hdrA','hdrB'])el(id).onchange=()=>{resetResults();updateInputs()};
async function analyzeFiles(cfg,parts,label,side){
  if(!cfg)throw Error(`${label}: selecione o CFG, CFF ou ZIP.`);
  const single=/\.(cff|zip)$/i.test(cfg.name);
  if(!single&&!parts.length)throw Error(`${label}: selecione o DAT ou seus segmentos.`);
  if(cfg.size+(single?0:[...parts].reduce((sum,f)=>sum+f.size,0))>32*1024*1024)throw Error(`${label}: entrada deve ter até 32 MB.`);
  const profile=readProfile(side);
  const payload=single?{source:await b64(cfg),source_name:cfg.name,profile}:{cfg:await b64(cfg),cfg_name:cfg.name,dat_files:await Promise.all([...parts].map(async f=>({name:f.name,data:await b64(f)}))),profile};
  const hdr=el('hdr'+side).files[0];if(hdr){if(hdr.size>2*1024*1024)throw Error('HDR deve ter até 2 MB.');payload.hdr=await b64(hdr);payload.hdr_name=hdr.name}
  const response=await fetch('/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const data=await response.json();if(!response.ok)throw Error(`${label}: ${data.error}`);return data;
}
el('form').onsubmit=async e=>{
  e.preventDefault();resetResults();const compare=el('mode').value==='compare';
  const controls=[...el('form').querySelectorAll('input,select,button,textarea')];const disabled=controls.map(c=>c.disabled);controls.forEach(c=>c.disabled=true);el('run').textContent='Processando…';
  try{
    const a=await analyzeFiles(el('cfg').files[0],el('dat').files,'Oscilografia A','A');
    if(compare){
      const b=await analyzeFiles(el('cfgB').files[0],el('datB').files,'Oscilografia B','B');
      comparison={criterion:'Canais ativados conforme polaridade do perfil; sem comparar horários',matching:'Nome/fase ou equivalência confirmada com categoria/função/fase idênticas',a,b,channels:compareRecords(a,b)};
      el('compareMeta').innerHTML=[['A',a],['B',b]].map(([label,r])=>`<div><b>Oscilografia ${label}: ${esc(r.station)} · ${esc(r.device)}</b><br>Início: ${esc(r.start)} · Trigger: ${esc(r.trigger)}<br>${r.samples} amostras · ${r.duration.toFixed(6)} s · ${esc(r.format)}</div>`).join('');
      el('compareStats').innerHTML=[['a','A',a],['b','B',b]].map(([key,label,r])=>`<div class="stat"><strong>${r.channels.filter(c=>acts(c).length).length}</strong>Canais com ativação em ${label}</div>`).join('')+`<div class="stat"><strong>${comparison.channels.filter(c=>['only_a','only_b'].includes(c.status)).length}</strong>Canais com ativação exclusiva</div>`;
      el('qualityComparison').innerHTML=qualityHtml(a,'A')+qualityHtml(b,'B');
      renderComparison();el('comparison').hidden=false;renderAnalogs([['A',a],['B',b]]);
    }else{
      result=a;el('qualitySingle').innerHTML=qualityHtml(a,'Registro');
      el('meta').innerHTML=`<h2>${esc(result.station)} <small>· ${esc(result.device)}</small></h2><p>Início: ${esc(result.start)} · Trigger: ${esc(result.trigger)}<br>${result.samples} amostras · ${result.duration.toFixed(6)} s · ${esc(result.format)}</p>`;
      el('stats').innerHTML=[[result.channels.filter(c=>acts(c).length).length,'Canais com ativação'],[result.channels.filter(c=>initial(c)).length,'Já ativos no início'],[result.channels.length,'Canais digitais']].map(([n,s])=>`<div class="stat"><strong>${n}</strong>${s}</div>`).join('');render();el('results').hidden=false;renderAnalogs([['A',a]]);
    }
  }catch(err){resetResults();el('error').textContent=err.message}
  finally{controls.forEach((c,i)=>c.disabled=disabled[i]);el('run').textContent=compare?'Comparar oscilografias →':'Analisar oscilografia →'}
};
el('filter').onchange=()=>{if(result)render()};
el('compareFilter').onchange=()=>{if(comparison)renderComparison()};
el('pdfSingle').onclick=()=>savePdf(result,false);
el('pdfComparison').onclick=()=>savePdf(comparison,true);
el('export').onclick=()=>download(result,'analise-oscilografia.json');
el('exportComparison').onclick=()=>download(comparison,'comparacao-oscilografias.json');
function savePdf(data,compare){try{const url=URL.createObjectURL(new Blob([createReportPdf(data,compare)],{type:'application/pdf'}));const a=document.createElement('a');a.href=url;a.download=compare?'relatorio-comparacao.pdf':'relatorio-oscilografia.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(error){el('error').textContent='Não foi possível gerar o PDF: '+error.message}}

function emptyProfile(side){return {id:'perfil-'+side.toLowerCase(),version:'1.0',manufacturer:'',model:'',station:'',device:'',rules:[]}}
function profileMessage(message){el('profileMessage').textContent=message}
function readProfile(side){
  if(!el('useProfile'+side).checked)return null;
  try{const profile=JSON.parse(el('profile'+side).value);if(!profile||typeof profile!=='object'||!Array.isArray(profile.rules))throw Error('Estrutura inválida.');return profile}
  catch(error){throw Error('Perfil '+side+': JSON inválido ou lista rules ausente. '+error.message)}
}
el('profileEditors').innerHTML=['A','B'].map(side=>`<div><h3>Perfil do registro ${side}</h3><label><input id="useProfile${side}" type="checkbox">Usar perfil específico</label><label>Importar JSON <input id="importProfile${side}" type="file" accept=".json,application/json"></label><label>Editor JSON (id, versão, escopo e regras)<textarea id="profile${side}" spellcheck="false" aria-label="Editor de perfil ${side}"></textarea></label><button type="button" id="exportProfile${side}">Exportar JSON ${side}</button><button type="button" id="saveProfile${side}">Salvar neste navegador</button><button type="button" id="loadProfile${side}">Carregar salvo</button><button type="button" id="resetProfile${side}">Limpar perfil ${side}</button></div>`).join('');
for(const side of ['A','B']){
  el('profile'+side).value=JSON.stringify(emptyProfile(side),null,2);
  el('profile'+side).oninput=()=>{resetResults();profileMessage('Perfil alterado. Execute novamente a análise para aplicar e validar as regras.')};
  el('useProfile'+side).onchange=resetResults;
  el('importProfile'+side).onchange=async()=>{try{const file=el('importProfile'+side).files[0];if(!file)return;if(file.size>1024*1024)throw Error('Perfil deve ter até 1 MB.');const profile=JSON.parse(await file.text());if(!Array.isArray(profile.rules))throw Error('Lista rules ausente.');el('profile'+side).value=JSON.stringify(profile,null,2);el('useProfile'+side).checked=true;resetResults();profileMessage('Perfil '+side+' importado. Execute a análise para validar e aplicar.')}catch(error){profileMessage('Falha na importação: '+error.message)}};
  el('exportProfile'+side).onclick=()=>{try{const profile=JSON.parse(el('profile'+side).value);download(profile,'perfil-'+side+'.json')}catch(error){profileMessage(error.message)}};
  el('saveProfile'+side).onclick=()=>{try{const profile=JSON.parse(el('profile'+side).value);localStorage.setItem('oscilography-profile-'+side,JSON.stringify(profile));profileMessage('Perfil '+side+' salvo somente neste navegador. Exporte JSON para compartilhar ou fazer backup.')}catch(error){profileMessage('Não foi possível salvar: '+error.message)}};
  el('loadProfile'+side).onclick=()=>{try{const value=localStorage.getItem('oscilography-profile-'+side);if(!value)throw Error('Nenhum perfil salvo.');el('profile'+side).value=JSON.stringify(JSON.parse(value),null,2);el('useProfile'+side).checked=true;resetResults();profileMessage('Perfil '+side+' carregado. Execute novamente a análise.')}catch(error){profileMessage(error.message)}};
  el('resetProfile'+side).onclick=()=>{el('profile'+side).value=JSON.stringify(emptyProfile(side),null,2);el('useProfile'+side).checked=false;resetResults();profileMessage('Editor '+side+' limpo; o perfil salvo no navegador permanece até ser substituído.')};
}
el('genericDownload').onclick=async()=>{try{const response=await fetch('/generic-profile.json');if(!response.ok)throw Error('Falha ao carregar perfil genérico.');download(await response.json(),'perfil-generico.json')}catch(error){profileMessage(error.message)}};
el('addRule').onclick=()=>{
  try{
    const side=el('ruleSide').value,profile=JSON.parse(el('profile'+side).value);
    if(!Array.isArray(profile.rules))throw Error('Lista rules ausente no perfil.');
    const match=el('ruleName').value,canonical=el('ruleCanonical').value.trim(),status=el('ruleStatus').value,reviewer=el('ruleReviewer').value.trim(),reason=el('ruleReason').value.trim();
    if(!match.trim())throw Error('Informe o nome original do canal.');
    if(status!=='suggested'&&(!reviewer||!reason))throw Error('Confirmação/revisão manual requer responsável e justificativa.');
    if(canonical&&status==='suggested')throw Error('Equivalência requer regra confirmada ou revisão manual.');
    const phase=el('rulePhase').value;
    const rule={id:'regra-'+Date.now(),match,phase,match_type:'exact',case_sensitive:true,category:el('ruleCategory').value,function:el('ruleFunction').value.trim(),active_state:Number(el('ruleActive').value),canonical,status,reviewer,reason,priority:100};
    const index=profile.rules.findIndex(r=>r.match===match&&r.phase===phase&&r.priority===100&&r.match_type==='exact');
    if(index>=0){rule.id=profile.rules[index].id;profile.rules[index]=rule}else profile.rules.push(rule);el('profile'+side).value=JSON.stringify(profile,null,2);el('useProfile'+side).checked=true;resetResults();profileMessage('Regra adicionada ao perfil '+side+'. Confira id/versão/escopo e execute novamente a análise. Salve ou exporte para reutilizar.');
  }catch(error){profileMessage(error.message)}
};

function reviewButton(c,side){return `<button type="button" class="secondary" data-review="${side}" data-number="${c.number}">Revisar classificação</button>`}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-review]');if(!button)return;
  const side=button.dataset.review,record=comparison?comparison[side.toLowerCase()]:result;
  const c=record?.channels.find(ch=>ch.number===Number(button.dataset.number));if(!c)return;
  const cl=c.classification;
  el('ruleSide').value=side;el('ruleName').value=c.name;el('rulePhase').value=c.phase;
  el('ruleCategory').value=cl.category;el('ruleFunction').value=cl.function;el('ruleActive').value=String(cl.active_state);
  el('ruleCanonical').value=cl.canonical;el('ruleStatus').value='manual';el('ruleReviewer').value=cl.reviewer;el('ruleReason').value=cl.reason;
  const details=el('profileEditors').closest('details');details.open=true;
  el('ruleName').scrollIntoView({behavior:'smooth',block:'center'});
  profileMessage('Identificação original preenchida a partir do CFG. Revise a interpretação, informe responsável/justificativa e adicione a regra.');
});

function objectHtml(r,side='A'){const obj=r.object||{};return `<div class="panel"><h3>Objeto relacionado</h3><p><b>${esc(obj.name||'Não identificado')}</b> · ${esc(obj.type||'Não determinado')}</p><p>${obj.status==='manual'?'Identificação revisada manualmente':obj.status==='extracted'?'Extraído de campo do HDR':obj.status==='suggested'?'Sugestão a partir do texto do HDR':obj.status==='ambiguous'?'Identificação ambígua no HDR':'Sem identificação disponível'}${obj.source?' · '+esc(obj.source):''}</p>${obj.evidence?`<blockquote>${esc(obj.evidence)}</blockquote>`:''}${obj.candidates?.length>1?'<ul>'+obj.candidates.map(c=>`<li>${esc(c.name)} · ${esc(c.evidence)}</li>`).join('')+'</ul>':''}${r.hdr?.warnings?.map(w=>`<p class="warning">${esc(w)}</p>`).join('')||''}${r.hdr?.available?`<details><summary>Revisar identificação do objeto</summary><label>Nome <input id="objectName${side}" type="text" value="${esc(obj.name)}" maxlength="500"></label><label>Tipo <input id="objectType${side}" type="text" value="${esc(obj.type)}" maxlength="100"></label><label>Responsável <input id="objectReviewer${side}" type="text" maxlength="200"></label><label>Justificativa <input id="objectReason${side}" type="text" maxlength="500"></label><button type="button" data-object-review="${side}">Aplicar revisão</button><p id="objectMessage${side}"></p></details><details><summary>Texto original do HDR</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(r.hdr.text)}</pre></details>`:'<p>HDR não fornecido (opcional).</p>'}</div>`}

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-object-review]');if(!button)return;
  const side=button.dataset.objectReview,record=comparison?comparison[side.toLowerCase()]:result;
  if(!record?.hdr?.available)return;
  const name=el('objectName'+side).value.trim(),type=el('objectType'+side).value.trim(),reviewer=el('objectReviewer'+side).value.trim(),reason=el('objectReason'+side).value.trim();
  if(!name||!reviewer||!reason){el('objectMessage'+side).textContent='Informe nome, responsável e justificativa.';return}
  const detected=record.object.detected||JSON.parse(JSON.stringify(record.object));
  record.object={...record.object,detected,name,type:type||'Não determinado',status:'manual',reviewer,reason,evidence:(detected.evidence||'Texto original preservado no HDR')+' | Revisão por '+reviewer+': '+reason};
  if(comparison)el('qualityComparison').innerHTML=qualityHtml(comparison.a,'A')+qualityHtml(comparison.b,'B');else el('qualitySingle').innerHTML=qualityHtml(result,'Registro');
});
