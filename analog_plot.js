/* Gráficos locais: um canal por painel, sem misturar unidades ou referências. */
const analogNumber=value=>value==null?'—':Number(value).toLocaleString('pt-BR',{maximumSignificantDigits:6});
let analogRecords={};
function renderAnalogs(records){
  analogRecords=Object.fromEntries(records);
  el('analogResults').hidden=false;
  el('analogCards').innerHTML=records.map(([side,r])=>`<div><h3>Oscilografia ${side}</h3>${!r.analog_channels?.length?'<p>Sem canais analógicos no CFG.</p>':`<label>Canal para plotar<select id="analogSelect${side}" data-analog="${side}">${r.analog_channels.map((c,i)=>`<option value="${i}">#${c.number} · ${esc(c.name)} (${esc(c.unit)})</option>`).join('')}</select></label><div id="analogPlot${side}"></div><div class="scroll"><table><thead><tr><th>Canal / unidade</th><th>Mínimo</th><th>Máximo</th><th>RMS janela</th></tr></thead><tbody>${r.analog_channels.map(c=>`<tr><td>${esc(c.name)} · ${esc(c.unit)}<small>Ref.: ${esc(c.reference)} · ${c.valid_samples} válidas; ${c.missing_samples} ausentes</small></td><td>${analogNumber(c.minimum)}</td><td>${analogNumber(c.maximum)}</td><td>${analogNumber(c.rms)}</td></tr>`).join('')}</tbody></table></div>`}</div>`).join('');
  for(const [side,r] of records)if(r.analog_channels?.length)drawAnalog(side,0);
}
function drawAnalog(side,index){
  const c=analogRecords[side].analog_channels[index],p=c.plot||[],valid=p.filter(v=>v[1]!=null);
  if(!valid.length){el('analogPlot'+side).innerHTML='<p>Não há amostras válidas para desenhar este canal.</p>';return}
  let t0=p[0][0],t1=p[p.length-1][0],lo=c.minimum,hi=c.maximum;
  if(t1===t0)t1=t0+1;if(lo===hi){const pad=Math.abs(lo)*.05||1;lo-=pad;hi+=pad}
  const x=t=>80+(t-t0)/(t1-t0)*640,y=v=>220-(v-lo)/(hi-lo)*180;
  let path='',open=false;
  for(const [t,v] of p){if(v==null){open=false;continue}path+=(open?' L':' M')+x(t).toFixed(2)+' '+y(v).toFixed(2);open=true}
  const grid=[0,.25,.5,.75,1].map(f=>`<line x1="80" x2="720" y1="${40+f*180}" y2="${40+f*180}" stroke="#33445a"/><text x="72" y="${44+f*180}" text-anchor="end">${analogNumber(hi-f*(hi-lo))}</text><text x="${80+f*640}" y="245" text-anchor="middle">${analogNumber(t0+f*(t1-t0))}</text>`).join('');
  el('analogPlot'+side).innerHTML=`<p><b>${esc(c.name)}</b> · Fase CFG: ${esc(c.phase||'não informada')} · ${esc(c.unit)} · referência ${esc(c.reference)}<br>Pico absoluto: ${analogNumber(c.peak)} · Média: ${analogNumber(c.mean)} · RMS janela: ${analogNumber(c.rms)}</p><svg viewBox="0 0 800 280" style="width:100%;background:#0c1422;border-radius:8px" role="img" aria-label="Forma de onda ${esc(c.name)}"><g fill="#b9c9db" font-family="sans-serif" font-size="12">${grid}<text x="80" y="22">${esc(c.unit)}</text><text x="400" y="273" text-anchor="middle">Tempo do DAT + skew (s)</text></g><path d="${path}" fill="none" stroke="#6fddba" stroke-width="1.6"/></svg><small>${c.plot_reduced?'Envelope min/max para visualização. Estatísticas usam todas as amostras válidas.':'Todas as amostras na visualização.'} RMS não é valor de ciclo nem fasor.</small>`;
}
document.addEventListener('change',event=>{if(event.target.matches('[data-analog]'))drawAnalog(event.target.dataset.analog,Number(event.target.value))});
