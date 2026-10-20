/* Catálogo e sequências de cada registro; nenhuma inferência de causalidade. */
let ansiCatalog=null,ansiRecords=[];
const ansiTime=t=>{if(t==null||!Number.isFinite(t))return '—';for(const digits of [6,9,12]){const formatted=t.toFixed(digits);if(Number(formatted)===t)return formatted+' s'}return t.toString()+' s'};
const ansiOrigin=status=>origins[status]||'Origem não informada';
function filterAnsiCatalog(){
  if(!ansiCatalog)return;
  const normalize=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const query=normalize(el('ansiSearch').value.trim());
  const entries=ansiCatalog.entries.filter(e=>normalize(e.code+' '+e.name+' '+e.description).includes(query));
  el('ansiCatalogRows').innerHTML=entries.map(e=>`<tr><td><b>${esc(e.code)}</b></td><td>${esc(e.name)}</td><td>${esc(e.description)}</td><td><button type="button" data-ansi-code="${esc(e.code)}">Usar ${esc(e.code)}</button></td></tr>`).join('');
  el('ansiCatalogStatus').textContent=`${entries.length} funções · referência v${ansiCatalog.version}. O catálogo não substitui o manual e a lógica do equipamento.`;
}
async function initAnsiCatalog(){
  try{
    const response=await fetch('/ansi-catalog.json');if(!response.ok)throw Error('HTTP '+response.status);
    ansiCatalog=await response.json();
    el('ansiCodes').innerHTML=ansiCatalog.entries.map(e=>`<option value="${esc(e.code)}">${esc(e.name)}</option>`).join('');
    filterAnsiCatalog();
  }catch(error){el('ansiCatalogStatus').textContent='Não foi possível carregar o catálogo: '+error.message+'. A análise dos arquivos permanece disponível.'}
}
function renderAnsi(records){
  ansiRecords=records;el('ansiResults').hidden=false;
  const codes=[...new Set(records.flatMap(([_,r])=>(r.ansi?.functions||[]).map(f=>f.code)))];
  codes.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  const headers=records.map(([side])=>`<th scope="col">OSCILOGRAFIA ${side}</th>`).join('');
  el('ansiSummary').innerHTML=codes.length?`<table class="ansi-summary ${records.length===2?'comparison-table':''}"><thead><tr>${headers}</tr></thead><tbody>${codes.map(code=>`<tr>${records.map(([_,r])=>{
    const f=r.ansi?.functions.find(f=>f.code===code);const other=records.flatMap(([_,record])=>record.ansi?.functions||[]).find(v=>v.code===code);
    if(!f)return `<td><b>ANSI ${esc(code)} · ${esc(other?.name||'Nome não cadastrado')}</b><p>Sem canal mapeado para este código neste registro.</p></td>`;
    return `<td><b>ANSI ${esc(f.code)} · ${esc(f.name)}</b><p class="ansi-label">${f.activated?'Ativação observada em canal associado':'Sem nova ativação'}</p><small>${f.activation_count} ativação(ões) de canais · Primeira: ${ansiTime(f.first_activation)}</small><ul>${f.channels.map(c=>`<li>#${c.number} ${esc(c.name)} · ${esc(c.category)} · ${esc(ansiOrigin(c.status))}</li>`).join('')}</ul></td>`;
  }).join('')}</tr>`).join('')}</tbody></table>`:'<p>Nenhuma função ANSI foi associada pelos perfis. Consulte o catálogo e use “Revisar classificação” para codificar o sinal. Os nomes originais e as ativações digitais permanecem disponíveis.</p>';
  renderAnsiTimelines();
}
function renderAnsiTimelines(){
  const all=el('ansiEventsFilter').value==='all';
  el('ansiTimelines').innerHTML=ansiRecords.map(([side,r])=>{
    const ansi=r.ansi||{timeline:[],initial_active:[],unmapped_channels:[]};
    const events=ansi.timeline.filter(e=>all||e.codes.length);
    return `<div class="ansi-record"><h3>Oscilografia ${side}</h3>${events.length?`<div class="scroll"><table class="ansi-events"><thead><tr><th>Ordem</th><th>Instante DAT</th><th>Funções associadas</th><th>Canal / origem</th></tr></thead><tbody>${events.map(e=>`<tr><td>${e.order}${e.simultaneous?'<small>Mesmo instante</small>':''}</td><td>${ansiTime(e.time)}</td><td>${e.codes.length?e.codes.map((code,i)=>`<b>${esc(code)}</b> · ${esc(e.names[i]||'Nome não cadastrado')}`).join('<br>'):'Sem função ANSI associada'}</td><td>#${e.channel_number} ${esc(e.channel_name)}<small>${esc(e.category)} · ${esc(ansiOrigin(e.status))}</small>${e.codes.length>1?'<small>Sinal com múltiplos códigos associados.</small>':''}</td></tr>`).join('')}</tbody></table></div>`:'<p>Nenhuma nova ativação corresponde a este filtro.</p>'}<h4>Funções associadas a sinais já ativos no início</h4>${ansi.initial_active.length?'<ul>'+ansi.initial_active.map(e=>`<li>${esc(e.code)} · ${esc(e.name)} — #${e.channel_number} ${esc(e.channel_name)} · ${esc(ansiOrigin(e.status))}</li>`).join('')+'</ul>':'<p>Nenhuma função associada a sinal já ativo no início.</p>'}${ansi.unmapped_channels.length?`<details><summary>${ansi.unmapped_channels.length} canais sem associação ANSI completa</summary><ul>${ansi.unmapped_channels.map(c=>`<li>#${c.number} ${esc(c.name)} · ${esc(c.reason)}</li>`).join('')}</ul></details>`:''}</div>`;
  }).join('');
}
document.addEventListener('input',event=>{if(event.target.id==='ansiSearch')filterAnsiCatalog()});
document.addEventListener('change',event=>{if(event.target.id==='ansiEventsFilter')renderAnsiTimelines()});
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-ansi-code]');if(!button)return;
  el('ruleFunction').value=button.dataset.ansiCode;
  el('profileEditors').closest('details').open=true;
  el('ruleFunction').scrollIntoView({behavior:'smooth',block:'center'});
  profileMessage('Código ANSI preenchido. Selecione o canal, revise a categoria e a polaridade e adicione a regra ao perfil. Isso não atribui a causa do trip.');
});
