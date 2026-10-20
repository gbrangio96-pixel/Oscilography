/* PDF local, sem dependências ou envio dos registros a serviços externos. */
(function(root) {
  const labels={both:'Ativado em ambos',only_a:'Ativado somente em A',only_b:'Ativado somente em B',neither:'Sem ativação em ambos',missing_a:'Canal ausente em A',missing_b:'Canal ausente em B',ambiguous:'Correspondência ambígua'};
  const name=c=>`${c.name||'(sem identificação)'} | Fase: ${c.phase||'-'} | Canal ${c.number}`;
  const acts=c=>c.activations||c.rises;
  const initial=c=>c.initial_active??Boolean(c.initial);
  const objectOrigins={extracted:'Extraído de campo HDR',suggested:'Sugestão do texto HDR',ambiguous:'Ambíguo',manual:'Revisão manual',not_identified:'Não identificado'};
  const origins={suggested:'SUGESTÃO',confirmed:'PERFIL CONFIRMADO',manual:'REVISÃO MANUAL',unclassified:'NÃO CLASSIFICADO',conflict:'CONFLITO'};
  const ansiTime=value=>{if(!Number.isFinite(value))return 'não disponível';for(const digits of [6,9,12]){const formatted=value.toFixed(digits);if(Number(formatted)===value)return formatted+' s'}return value.toString()+' s'};
  const ansiOrigin=status=>origins[status]||'NÃO CLASSIFICADO';
  const ansiChannel=channel=>`#${channel.number} ${channel.name||'(sem identificação)'} | ${channel.category||'desconhecido'} | ${ansiOrigin(channel.status)}`;
  const ansiFunctionText=fn=>!fn?'Função não identificada neste registro.':`ANSI ${fn.code} · ${fn.name||'Nome não cadastrado'}\n${fn.activated?'Sinal associado ativado':'Sem nova ativação observada'} | ${fn.activation_count||0} ocorrência(s)\nPrimeira ativação: ${Number.isFinite(fn.first_activation)?ansiTime(fn.first_activation):'não observada'}\n${(fn.channels||[]).map(ansiChannel).join('\n')}`;
  const ansiEventText=event=>!event?'Sem ocorrência nesta posição da sequência.':`Ordem ${event.order}${event.simultaneous?' · SIMULTÂNEO':''} | ${ansiTime(event.time)}\n${event.codes?.length?'ANSI '+event.codes.join(' / '):'ANSI não identificado'}${event.names?.length?' · '+event.names.join(' / '):''}\n#${event.channel_number} ${event.channel_name||'(sem identificação)'} | Fase: ${event.phase||'-'}\n${event.category||'desconhecido'} | ${ansiOrigin(event.status)}`;
  const ansiInitialText=event=>!event?'Sem sinal já ativo nesta posição.':`ANSI ${event.code} · ${event.name||'Nome não cadastrado'}\n#${event.channel_number} ${event.channel_name||'(sem identificação)'}\n${ansiOrigin(event.status)} | Já ativo no início; momento da ativação não observado.`;
  const ansiNotice='Os códigos representam funções associadas aos sinais digitais. Uma ativação não identifica automaticamente a função responsável pelo trip. Um sinal com vários códigos não confirma independentemente a atuação de cada função. Sugestões permanecem distintas de associações confirmadas.';
  const ansiTimeNotice='Tempos em segundos na referência do DAT de cada registro. A ordem é interna a cada oscilografia; empates indicam ativações no mesmo timestamp, sem ordem resolvida entre elas. Sinais já ativos na primeira amostra não recebem uma ativação artificial em t=0.';
  function reportLines(data,compare){
    const generated=new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'medium',timeZone:'America/Sao_Paulo'}).format(new Date());
    const lines=['OSCILOGRAPHY | Análise digital v2.0',compare?'RELATÓRIO DE COMPARAÇÃO DE CANAIS DIGITAIS':'RELATÓRIO DE ANÁLISE DE CANAIS DIGITAIS',`Emitido em ${generated} (America/Sao_Paulo)`,''];
    const records=compare?[['A',data.a],['B',data.b]]:[['Registro',data]];
    lines.push('1. RESUMO EXECUTIVO');
    for(const [label,r] of records){
      lines.push(`${label}: ${r.station} | Equipamento: ${r.device}`,`Início: ${r.start} | Trigger: ${r.trigger}`,`${r.samples} amostras | ${r.format} | Revisão ${r.revision||'-'} | ${r.channels.length} canais digitais`,`${r.channels.filter(c=>acts(c).length).length} canais ativados durante o registro; ${r.channels.filter(initial).length} já ativos na primeira amostra.`);
      const uncertain=r.channels.filter(c=>!['confirmed','manual'].includes(c.classification?.status));
      lines.push(`${uncertain.length} canais com classificação ou polaridade não confirmada.`,`${(r.validation?.warnings.length||0)+(r.hdr?.warnings?.length||0)} alertas de qualidade.`, '');
    }
    for(const [label,r] of records){if(r.object?.name)lines.push(`${label} - Objeto relacionado: ${r.object.name} | Tipo: ${r.object.type}`,`Fonte: ${r.object.source} | Origem: ${objectOrigins[r.object.status]||r.object.status}`,`Evidência HDR: ${r.object.evidence}`);else lines.push(`${label} - Objeto relacionado: não identificado (HDR opcional).`)}
    lines.push('2. EVIDÊNCIAS OBSERVADAS');
    for(const [label,r] of records){
      lines.push(`${label} - CANAIS ATIVADOS (entrada no estado ativo configurado):`);
      const activated=r.channels.filter(c=>acts(c).length);
      lines.push(...(activated.length?activated.map(c=>`${name(c)} | ${acts(c).length} ativação(ões)`):['Nenhum canal apresentou nova ativação.']));
      const already=r.channels.filter(initial);
      lines.push(`${label} - JÁ ATIVOS NO INÍCIO:`,...(already.length?already.map(name):['Nenhum.']), '');
    }
    if(records.some(([_,r])=>r.ansi)){
      lines.push('FUNÇÕES ANSI ASSOCIADAS E SEQUÊNCIA DE ATIVAÇÕES',ansiNotice,ansiTimeNotice);
      for(const [label,r] of records){
        if(!r.ansi){lines.push(`${label}: análise ANSI não disponível nesta versão do registro.`);continue}
        lines.push(`${label} | Catálogo de referência: ${r.ansi.catalog_version||'versão não informada'}`,'FUNÇÕES ANSI IDENTIFICADAS:');
        lines.push(...((r.ansi.functions||[]).length?r.ansi.functions.map(ansiFunctionText):['Nenhuma associação ANSI identificada.']));
        lines.push(`${label} | SEQUÊNCIA DE NOVAS ATIVAÇÕES:`);
        lines.push(...((r.ansi.timeline||[]).length?r.ansi.timeline.map(ansiEventText):['Nenhuma nova ativação na sequência ANSI.']));
        lines.push(`${label} | ANSI JÁ ATIVOS NO INÍCIO:`);
        lines.push(...((r.ansi.initial_active||[]).length?r.ansi.initial_active.map(ansiInitialText):['Nenhum sinal ANSI já ativo identificado.']));
        lines.push(`${label} | CANAIS SEM ASSOCIAÇÃO ANSI:`);
        lines.push(...((r.ansi.unmapped_channels||[]).length?r.ansi.unmapped_channels.map(c=>`#${c.number} ${c.name} | ${c.reason||'Sem código associado'}`):['Nenhum.']),'');
      }
    }
    lines.push('3. CONCLUSÃO AUTOMÁTICA E INTERPRETAÇÃO');
    if(compare){
      const rows=root.compareRecords(data.a,data.b);
      for(const status of ['both','only_a','only_b','missing_a','missing_b','ambiguous','neither']){
        const group=rows.filter(c=>c.status===status);
        lines.push(`${labels[status]}: ${group.length}`);
        for(const row of group){
          lines.push(`  ${row.name||'(sem identificação)'} | Fase: ${row.phase||'-'} | ${row.basis||'Nome/fase'}`);
          for(const side of ['a','b'])lines.push(`    ${side.toUpperCase()}: ${row[side].length?row[side].map(c=>`${c.name} (#${c.number}): ${acts(c).length?'ativado':'sem nova ativação'}${initial(c)?', já ativo no início':''}`).join('; '):'ausente no CFG'}`);
        }
      }
      lines.push('Critério: nome/fase originais ou equivalência confirmada com categoria, função e fase idênticas. Não são comparados horários, retornos ou quantidade de ocorrências. Ausência no CFG não comprova ausência de atuação do equipamento.');
    }
    for(const [label,r] of records){
      const activated=r.channels.filter(c=>acts(c).length);
      for(const category of ['partida','disparo','bloqueio','alarme','posição']){
        const confirmed=activated.filter(c=>c.classification?.category===category&&['confirmed','manual'].includes(c.classification.status));
        const suggested=activated.filter(c=>c.classification?.category===category&&c.classification.status==='suggested');
        if(confirmed.length)lines.push(`${label}: ${confirmed.length} canal(is) ativado(s) classificado(s) como ${category} por regra confirmada/manual: ${confirmed.map(c=>c.name).join('; ')}.`);
        if(suggested.length)lines.push(`${label}: hipótese textual de ${category} em ${suggested.map(c=>c.name).join('; ')}. A classificação e a polaridade requerem conferência.`);
      }
      if(!activated.length)lines.push(`${label}: nenhuma nova ativação na janela registrada segundo as polaridades aplicadas.`);
      if(activated.some(c=>['unclassified','conflict'].includes(c.classification?.status)))lines.push(`${label}: há ativações sem interpretação definida; revisar os canais e o perfil antes de concluir sobre funções de proteção.`);
    }
    lines.push('Não é possível concluir automaticamente sobre a causa da falta, seletividade ou abertura efetiva do disjuntor apenas com essas binárias.');
    lines.push('','4. QUALIDADE E RASTREABILIDADE');
    for(const [label,r] of records){
      lines.push(label);
      if(r.files){lines.push(`CFG: ${r.files.cfg_name||'não informado'}`,`SHA-256 CFG: ${r.files.cfg_sha256}`,`DAT: ${r.files.dat_name||'não informado'}`,`SHA-256 DAT: ${r.files.dat_sha256}`);if(r.files.container_name)lines.push(`Contêiner: ${r.files.container_name}`,`SHA-256 contêiner: ${r.files.container_sha256}`);for(const part of r.files.dat_segments||[])lines.push(`Segmento: ${part.name}`,`SHA-256 segmento: ${part.sha256}`)}
      if(r.profile){lines.push(`Perfil: ${r.profile.id} | Versão: ${r.profile.version}`,`Fabricante/modelo declarados: ${r.profile.manufacturer||'-'} / ${r.profile.model||'-'}`,`Escopo: estação ${r.profile.station||'(sem restrição)'}; equipamento ${r.profile.device||'(sem restrição)'}`,`SHA-256 perfil: ${r.profile.sha256}`,`Fallback genérico: v${r.profile.generic_fallback_version}`)}
      lines.push('Verificações concluídas:',...(r.validation?.checks||['Não disponíveis nesta análise.']));
      lines.push('Alertas:',...(r.validation?.warnings.length?r.validation.warnings:['Nenhum alerta estrutural detectado. Isso não comprova a correção da lógica ou do perfil.']),'');
    }
    lines.push('5. ANEXO - EVIDÊNCIAS E REGRAS POR CANAL');
    for(const [label,r] of records){
      lines.push(label);
      for(const c of r.channels){
        const cl=c.classification;
        lines.push(name(c),`  Estado inicial/final: ${c.initial}/${c.final}; normal CFG: ${c.normal??'-'}; ativo em ${cl?.active_state??1}.`,`  ${acts(c).length} ativação(ões); ${initial(c)?'já ativo no início':'não ativo no início'}.`);
        if(cl){
          lines.push(`  ${origins[cl.status]} | Categoria: ${cl.category} | Função: ${cl.function||'não identificada'}`,`  Regra: ${cl.rule_id||'nenhuma'} | Perfil: ${cl.profile_id} v${cl.profile_version}`,`  Justificativa: ${cl.reason}`,`  Responsável: ${cl.reviewer||'não informado'} | Equivalência: ${cl.canonical||'nenhuma'}`);
          if(cl.status==='conflict')lines.push('  Candidatas em conflito: '+cl.candidates.join('; '));
        }
        // Instantes são evidências do registro individual; não há comparação temporal A/B.
        if(!compare&&acts(c).length)lines.push('  Instantes de ativação no DAT (s; até 12): '+acts(c).slice(0,12).map(t=>t.toFixed(6)).join('; ')+(acts(c).length>12?' (lista completa no JSON)':''));
        lines.push('');
      }
    }
    lines.push('6. LIMITES E RECOMENDAÇÕES','Ativação significa entrada no estado ativo da regra: 0 para 1 ou 1 para 0. Sinais ativos na primeira amostra são listados separadamente. Sem regra, estado ativo 1 é uma hipótese padrão. Estado normal no CFG não define automaticamente a polaridade.','As identificações são extraídas dos arquivos; contatos, alarmes e lógicas também podem estar presentes. A identificação de uma binária não comprova disparo de proteção ou causa da falta.','Fabricante/modelo são metadados declarados, sem identificação automática. Regras confirmadas representam a declaração do responsável, não validação independente da engenharia do relé.','A conclusão se limita aos canais e à janela de cada registro. Pulsos entre amostras e eventos anteriores não podem ser determinados. O relatório inclui todos os canais, independentemente dos filtros da tela.','Revisar alertas, classificações sugeridas, polaridades e ambiguidades. Conferir a lógica do equipamento e os documentos de referência. As estatísticas analógicas são descritivas da janela: não determinam fasores, seletividade ou tipo de falta.','Caracteres fora do alfabeto ocidental são representados por códigos U+XXXX; nomes originais e perfis completos permanecem no JSON.');
    return lines;
  }
  function createReportLayout(data,compare=false){
    const engine=root.PdfLayout||(typeof require!=='undefined'?require('./pdf_layout.js'):null);
    if(!engine)throw Error('Módulo de diagramação PDF não carregado. Atualize a página.');
    const {Document,colors:C,wrap,width}=engine;
    const doc=new Document((compare?'Comparação de registros':'Análise de oscilografia')+(data.demonstration?' · DEMONSTRAÇÃO':''));
    const records=compare?[['A',data.a],['B',data.b]]:[['Registro',data]];
    const semantic=reportLines(data,compare);
    const count=r=>r.channels.filter(c=>acts(c).length).length;
    const uncertain=r=>r.channels.filter(c=>!['confirmed','manual'].includes(c.classification?.status)).length;
    const warnings=records.reduce((n,[_,r])=>n+(r.validation?.warnings.length||0)+(r.hdr?.warnings?.length||0),0);
    const rows=compare?root.compareRecords(data.a,data.b):[];
    const origin=c=>origins[c.classification?.status]||'NÃO CLASSIFICADO';
    const originColor=c=>['confirmed','manual'].includes(c.classification?.status)?C.teal:c.classification?.status==='conflict'?C.red:C.amber;
    const state=c=>c.classification?.active_state??1;
    const category=c=>(c.classification?.category||'desconhecido')+(c.classification?.function?' / ANSI '+c.classification.function:'');
    const side=channels=>channels.length?channels.map(c=>`${c.name||'(sem identificação)'} (#${c.number})\n${acts(c).length?'ATIVADO':'Sem nova ativação'}${initial(c)?'; já ativo no início':''}\nTempo ativo: ${((c.total_active_duration||0)*1000).toFixed(3)} ms${c.duration_estimated?' (estimado com lacunas)':''}`).join('\n\n'):'Ausente no CFG';

    // A capa funciona também como primeira página executiva, sem página vazia decorativa.
    doc.rect(0,0,595,204,C.navy);doc.rect(40,58,40,4,C.mint);
    doc.text(40,27,'OSCILOGRAPHY',13,'F2',C.white);if(data.demonstration)doc.text(365,30,'DADOS SINTÉTICOS · EXEMPLO',8,'F2',C.mint);
    doc.text(40,76,'PROTEÇÃO DE SISTEMAS ELÉTRICOS',9,'F2',C.mint);
    doc.text(40,100,'Relatório de',30,'F2',C.white);
    doc.text(40,137,compare?'comparação digital':'análise digital',30,'F2',C.white);
    doc.text(40,181,semantic[2],8.5,'F1',C.mint);
    doc.y=220;
    doc.section('1','Resumo executivo','Visão dos canais digitais. Quantidades referem-se à janela de cada registro.');
    const metrics=compare?[[count(data.a),'Ativados em A'],[count(data.b),'Ativados em B'],[rows.filter(c=>['only_a','only_b'].includes(c.status)).length,'Ativações exclusivas'],[warnings,'Alertas de qualidade']]:[[count(data),'Canais ativados'],[data.channels.filter(initial).length,'Já ativos no início'],[uncertain(data),'Não confirmados'],[warnings,'Alertas de qualidade']];
    metrics.forEach(([value,label],i)=>{const x=40+i*132;doc.rect(x,doc.y,119,76,C.pale);doc.rect(x,doc.y,119,3,i===3&&warnings?C.warning:C.mint);doc.text(x+12,doc.y+10,String(value),27,'F2',i===3&&warnings?C.amber:C.teal);wrap(label,96,8.5,'F2').forEach((line,j)=>doc.text(x+12,doc.y+47+j*11,line,8.5,'F2',C.muted))});
    doc.y+=94;
    const fields=[['Objeto relacionado',r=>r.object?.name||'Não identificado'],['Tipo do objeto',r=>r.object?.type||'Não determinado'],['Estação',r=>r.station],['Equipamento',r=>r.device],['Início do registro',r=>r.start],['Trigger',r=>r.trigger],['Formato / revisão',r=>`${r.format} / ${r.revision||'não informada'}`],['Amostras / canais',r=>`${r.samples} / ${r.channels.length}`],['Perfil / versão',r=>r.profile?`${r.profile.id} / ${r.profile.version}`:'Não informado']];
    if(compare)doc.table(['OSCILOGRAFIA A','OSCILOGRAFIA B'],fields.map(([label,get])=>records.map(([_,r])=>`${label}\n${get(r)||'Não informado'}`)),[257.5,257.5]);
    else doc.table(['IDENTIFICAÇÃO','REGISTRO'],fields.map(([label,get])=>[{text:label,font:'F2'},get(data)||'Não informado']),[145,370]);
    doc.paragraph(records.map(([label,r])=>`${label}: ${uncertain(r)} canal(is) com classificação ou polaridade não confirmada.`).join(' '),{background:records.some(([_,r])=>uncertain(r))?C.warning:C.mint,fill:records.some(([_,r])=>uncertain(r))?C.amber:C.teal,size:9.5});

    doc.section('2','Evidências observadas','Nomes originais preservados. Ativação é a entrada no estado ativo aplicado ao canal.');
    for(const [label,r] of records){
      doc.subtitle(`${label} | Canais ativados`);
      const activated=r.channels.filter(c=>acts(c).length);
      if(activated.length)doc.table(['CANAL ORIGINAL','FASE','CLASSIFICAÇÃO','ORIGEM','EVIDÊNCIA'],activated.map(c=>[
        {text:`#${c.number} · ${c.name||'(sem identificação)'}`,font:'F2'},c.phase||'-',category(c),{text:origin(c),fill:originColor(c)},`${acts(c).length} ativação(ões)\nAtivo em ${state(c)}\n${((c.total_active_duration||0)*1000).toFixed(3)} ms observados`]),[175,40,100,105,95]);
      else doc.paragraph('Nenhum canal apresentou nova ativação.',{fill:C.muted});
      const already=r.channels.filter(initial);
      doc.subtitle(`${label} | Já ativos na primeira amostra`);
      if(already.length)doc.table(['CANAL ORIGINAL','CLASSIFICAÇÃO','EVIDÊNCIA'],already.map(c=>[name(c),category(c),`Estado inicial: ${c.initial}\nJá ativo no início; instante anterior desconhecido.`]),[215,140,160]);
      else doc.paragraph('Nenhum canal já ativo no início.',{fill:C.muted});
    }

    if(records.some(([_,r])=>r.ansi)){
      doc.subtitle('Funções ANSI associadas aos canais');
      doc.paragraph(ansiNotice,{background:C.warning,fill:C.amber,size:9.5});
      const versions=records.map(([label,r])=>`${label}: ${r.ansi?.catalog_version||'análise ANSI não disponível'}`).join(' | ');
      doc.paragraph('Catálogo de referência · '+versions,{size:9,fill:C.muted});
      if(compare){
        const allCodes=[...new Set(records.flatMap(([_,r])=>(r.ansi?.functions||[]).map(fn=>fn.code)))].sort((a,b)=>String(a).localeCompare(String(b),'pt-BR',{numeric:true}));
        if(allCodes.length)doc.table(['OSCILOGRAFIA A','OSCILOGRAFIA B'],allCodes.map(code=>records.map(([_,r])=>ansiFunctionText((r.ansi?.functions||[]).find(fn=>fn.code===code)))),[257.5,257.5]);
        else doc.paragraph('Nenhuma associação ANSI identificada nos registros.',{fill:C.muted});
      }else{
        const functions=data.ansi?.functions||[];
        if(functions.length)doc.table(['CÓDIGO / NOME ANSI','SINAIS / ORIGEM','ATIVAÇÃO OBSERVADA'],functions.map(fn=>[
          {text:`${fn.code} · ${fn.name||'Nome não cadastrado'}`,font:'F2'},
          (fn.channels||[]).map(ansiChannel).join('\n'),
          `${fn.activated?'Sinal associado ativado':'Sem nova ativação'}\n${fn.activation_count||0} ocorrência(s)\nPrimeira: ${Number.isFinite(fn.first_activation)?ansiTime(fn.first_activation):'não observada'}`]),[160,200,155]);
        else doc.paragraph('Nenhuma associação ANSI identificada.',{fill:C.muted});
      }
      doc.subtitle('Sequência de ativações por registro');
      doc.paragraph(ansiTimeNotice,{size:9.5,fill:C.muted});
      if(compare){
        doc.paragraph('As linhas abaixo colocam as sequências lado a lado pela posição de apresentação. Elas não estabelecem correspondência entre eventos de A e B, alinhamento de relógios ou diferenças de horário.',{size:9,background:C.mint,fill:C.teal});
        const events=records.map(([_,r])=>r.ansi?.timeline||[]),length=Math.max(...events.map(list=>list.length));
        if(length)doc.table(['OSCILOGRAFIA A','OSCILOGRAFIA B'],Array.from({length},(_,i)=>events.map(list=>ansiEventText(list[i]))),[257.5,257.5]);
        else doc.paragraph('Nenhuma nova ativação na sequência ANSI.',{fill:C.muted});
      }else{
        const events=data.ansi?.timeline||[];
        if(events.length)doc.table(['ORDEM / TEMPO DAT','ANSI / SINAL ORIGINAL','CATEGORIA / ORIGEM'],events.map(event=>[
          `${event.order}${event.simultaneous?' · SIMULTÂNEO':''}\n${ansiTime(event.time)}`,
          `${event.codes?.length?'ANSI '+event.codes.join(' / '):'ANSI não identificado'}${event.names?.length?' · '+event.names.join(' / '):''}\n#${event.channel_number} ${event.channel_name||'(sem identificação)'}\nFase: ${event.phase||'-'}`,
          `${event.category||'desconhecido'}\n${ansiOrigin(event.status)}`]),[105,265,145]);
        else doc.paragraph('Nenhuma nova ativação na sequência ANSI.',{fill:C.muted});
      }
      doc.subtitle('Funções associadas a sinais já ativos no início');
      if(compare){
        const initial=records.map(([_,r])=>r.ansi?.initial_active||[]),length=Math.max(...initial.map(list=>list.length));
        if(length)doc.table(['OSCILOGRAFIA A','OSCILOGRAFIA B'],Array.from({length},(_,i)=>initial.map(list=>ansiInitialText(list[i]))),[257.5,257.5]);
        else doc.paragraph('Nenhum sinal ANSI já ativo identificado.',{fill:C.muted});
      }else{
        const initial=data.ansi?.initial_active||[];
        if(initial.length)doc.table(['ANSI / SINAL ORIGINAL','EVIDÊNCIA'],initial.map(event=>[
          `ANSI ${event.code} · ${event.name||'Nome não cadastrado'}\n#${event.channel_number} ${event.channel_name||'(sem identificação)'}`,
          `${ansiOrigin(event.status)}\nJá ativo no início; momento da ativação não observado.`]),[290,225]);
        else doc.paragraph('Nenhum sinal ANSI já ativo identificado.',{fill:C.muted});
      }
      if(records.some(([_,r])=>r.ansi?.unmapped_channels?.length)){
        doc.subtitle('Canais sem associação ANSI');
        doc.paragraph('A ausência de código não exclui a ativação do canal da análise digital. A associação pode ser revisada no perfil.',{size:9,fill:C.muted});
        if(compare){
          const missing=records.map(([_,r])=>r.ansi?.unmapped_channels||[]),length=Math.max(...missing.map(list=>list.length));
          doc.table(['OSCILOGRAFIA A','OSCILOGRAFIA B'],Array.from({length},(_,i)=>missing.map(list=>list[i]?`#${list[i].number} ${list[i].name}\n${list[i].reason||'Sem código associado'}`:'Nenhum canal nesta posição.')),[257.5,257.5]);
        }else doc.table(['CANAL ORIGINAL','MOTIVO'],data.ansi.unmapped_channels.map(c=>[`#${c.number} ${c.name}`,c.reason||'Sem código associado']),[245,270]);
      }
    }

    // Estatísticas globais e gráficos próprios de cada registro; sem alinhar relógios A/B.
    const fmtValue=v=>v==null?'Não disponível':Number(v).toPrecision(6);
    for(const [label,r] of records){
      if(!r.analog_channels?.length)continue;
      doc.subtitle(`${label} | Valores analógicos`);
      doc.paragraph('Escala a × amostra + b; unidade e referência P/S do CFG. RMS global amostral, incluindo componente CC; não é RMS de ciclo. Sem conversão automática de TC/TP. Tempos dos gráficos incluem o skew do canal. Estatísticas usam todas as amostras válidas.',{size:9,background:C.mint,fill:C.teal});
      doc.table(['CANAL / UNIDADE / REF.','MÍNIMO','MÁXIMO','RMS JANELA'],r.analog_channels.map(c=>[`${c.name} (${c.unit}) / ${c.reference}\n${c.valid_samples} válidas; ${c.missing_samples} ausentes`,fmtValue(c.minimum),fmtValue(c.maximum),fmtValue(c.rms)]),[215,100,100,100]);
      if(r.analog_channels.length>8)doc.paragraph('Gráficos dos primeiros 8 canais neste PDF; todos os canais estão nas estatísticas e podem ser selecionados na interface.',{size:9,fill:C.muted});
      for(const c of r.analog_channels.slice(0,8)){
        const points=c.plot||[],valid=points.filter(p=>p[1]!=null);
        doc.ensure(235);doc.paragraph(`${label} · #${c.number} ${c.name} | Fase ${c.phase||'não informada'} | ${c.unit} | referência ${c.reference}`,{size:10,font:'F2',fill:C.teal,gap:5});
        if(!valid.length){doc.paragraph('Sem pontos válidos para desenhar o canal.');continue}
        doc.ensure(210);
        const top=doc.y+8,bottom=top+150,left=103,right=540;
        let lo=c.minimum,hi=c.maximum,t0=points[0][0],t1=points[points.length-1][0];
        if(lo===hi){const pad=Math.abs(lo)*.05||1;lo-=pad;hi+=pad}if(t0===t1)t1=t0+1;
        const x=t=>left+(t-t0)/(t1-t0)*(right-left),y=v=>bottom-(v-lo)/(hi-lo)*150;
        for(let j=0;j<=4;j++){const f=j/4;doc.line(left,top+f*150,right,top+f*150,C.line);doc.text(42,top+f*150-3,(hi-f*(hi-lo)).toPrecision(4),8,'F3',C.muted);const tick=(t0+f*(t1-t0)).toPrecision(4);doc.text(Math.max(40,Math.min(555-width(tick,8,'F3'),left+f*(right-left)-width(tick,8,'F3')/2)),bottom+10,tick,8,'F3',C.muted)}
        let path='',open=false;
        for(const [time,value] of points){if(value==null){open=false;continue}const command=`${x(time).toFixed(2)} ${(842-y(value)).toFixed(2)} ${open?'l':'m'} `;path+=command;open=true;doc.rect(x(time)-.4,y(value)-.4,.8,.8,C.teal)}
        if(path)doc.command('q '+C.teal.map(v=>v.toFixed(3)).join(' ')+' RG .8 w '+path+' S Q');
        doc.text(230,bottom+28,'Tempo do DAT + skew (s)',9,'F1',C.muted);
        doc.y=bottom+47;doc.paragraph(c.plot_reduced?'Gráfico com envelope min/max; lacunas interrompem o traço.':'Gráfico das amostras; lacunas interrompem o traço.',{size:8,fill:C.muted,gap:12});
      }
    }

    doc.section('3','Conclusão e interpretação',compare?'Comparação dos canais ativados, sem comparação de horários.':'Fatos observados e hipóteses de interpretação apresentados separadamente.');
    if(compare){
      const statuses=['both','only_a','only_b','missing_a','missing_b','ambiguous','neither'];
      doc.table(['RESULTADO DA COMPARAÇÃO','QUANTIDADE'],statuses.map(status=>[labels[status],String(rows.filter(c=>c.status===status).length)]),[400,115]);
      for(const status of statuses){const group=rows.filter(c=>c.status===status);if(!group.length)continue;
        doc.subtitle(`${labels[status]} · ${group.length}`);
        doc.table(['OSCILOGRAFIA A','OSCILOGRAFIA B'],group.map(c=>['a','b'].map(key=>`${c.name||'(sem identificação)'} | Fase: ${c.phase||'-'}\n${c.basis||'Nome/fase'}\n\n${side(c[key])}`)),[257.5,257.5]);
      }
    }
    const section3=semantic.slice(semantic.indexOf('3. CONCLUSÃO AUTOMÁTICA E INTERPRETAÇÃO')+1,semantic.indexOf('4. QUALIDADE E RASTREABILIDADE'));
    const interpretation=compare?section3.slice(section3.findIndex(s=>s.startsWith('Critério:'))):section3;
    for(const line of interpretation.filter(Boolean))doc.paragraph(line,{size:10,background:line.includes('hipótese')||line.includes('Não é possível')?C.warning:null,fill:line.includes('hipótese')||line.includes('Não é possível')?C.amber:C.ink});

    doc.section('4','Qualidade e rastreabilidade','Identificação das fontes, do perfil aplicado e das limitações detectadas.');
    for(const [label,r] of records){
      doc.subtitle(`${label} | Objeto relacionado`);
      if(r.object?.name){doc.paragraph(`${r.object.name} | ${r.object.type}`,{font:'F2',background:C.mint,fill:C.teal});doc.paragraph(`Fonte: ${r.object.source} | Origem: ${objectOrigins[r.object.status]||r.object.status}. Evidência: ${r.object.evidence}`,{size:9.5})}else doc.paragraph(r.object?.status==='ambiguous'?'HDR contém múltiplos candidatos; objeto não selecionado.':'Objeto não identificado; HDR é opcional.',{size:9.5});
      if(r.object?.candidates?.length>1)doc.table(['CANDIDATO','EVIDÊNCIA HDR'],r.object.candidates.map(c=>[c.name,c.evidence]),[215,300]);
      for(const warning of r.hdr?.warnings||[])doc.paragraph(warning,{background:C.warning,fill:C.amber,size:9});
      doc.subtitle(`${label} | Qualidade do registro`);
      doc.paragraph((r.validation?.checks||['Verificações indisponíveis nesta análise.']).map(s=>'· '+s).join('\n'),{size:9.5});
      const alerts=r.validation?.warnings||[];
      doc.paragraph(alerts.length?alerts.map(s=>'ALERTA · '+s).join('\n'):'Nenhum alerta estrutural detectado. Isso não comprova a correção da lógica ou do perfil.',{background:alerts.length?C.warning:C.mint,fill:alerts.length?C.amber:C.teal,size:9.5});
      const sources=[];
      if(r.files){sources.push(['Arquivo CFG',r.files.cfg_name||'Não informado'],['SHA-256 CFG',r.files.cfg_sha256||'Não informado'],['Arquivo DAT',r.files.dat_name||'Não informado'],['SHA-256 DAT',r.files.dat_sha256||'Não informado']);if(r.files.container_name)sources.push(['Contêiner',r.files.container_name],['SHA-256 contêiner',r.files.container_sha256]);for(const part of r.files.dat_segments||[])sources.push(['Segmento',part.name],['SHA-256 segmento',part.sha256])}
      if(r.files?.hdr_name)sources.push(['Arquivo HDR',r.files.hdr_name],['SHA-256 HDR',r.files.hdr_sha256]);
      if(r.profile)sources.push(['Perfil / versão',`${r.profile.id} / ${r.profile.version}`],['SHA-256 perfil',r.profile.sha256||'Não informado'],['Fabricante / modelo',`${r.profile.manufacturer||'Não informado'} / ${r.profile.model||'Não informado'}`],['Escopo',`Estação: ${r.profile.station||'sem restrição'}; equipamento: ${r.profile.device||'sem restrição'}`],['Fallback genérico',r.profile.generic_fallback_version||'Não informado']);
      if(sources.length)doc.table(['FONTE / IDENTIFICADOR','VALOR'],sources.map(([label,value])=>[label,{text:value,font:label.startsWith('SHA-256')?'F3':'F1',size:label.startsWith('SHA-256')?8:9}]),[145,370]);
    }

    doc.section('5','Anexo técnico por canal','Relação completa, incluindo canais sem nova ativação e classificações não confirmadas.');
    for(const [label,r] of records){
      doc.subtitle(`${label} | ${r.channels.length} canais digitais`);
      for(const c of r.channels){
        doc.ensure(100);doc.paragraph(name(c),{font:'F2',size:11,background:C.pale,fill:C.navy,gap:4});
        const cl=c.classification;
        const facts=[['Estados observados',`Inicial: ${c.initial}; final: ${c.final}; normal CFG: ${c.normal??'-'}`],['Ativação aplicada',`${acts(c).length} ativação(ões); ativo em ${state(c)}; ${initial(c)?'já ativo no início':'não ativo no início'}`]];
        if(c.active_intervals)facts.push(['Tempo ativo observado',`${(c.total_active_duration*1000).toFixed(3)} ms${c.duration_estimated?' (estimado com lacunas)':''}`],...c.active_intervals.map((interval,i)=>['Intervalo ativo '+(i+1),`${(interval.observed_duration*1000).toFixed(3)} ms; ${interval.left_censored?'já ativo no início; ':''}${interval.right_censored?'ativo no fim; ':''}${interval.gap_affected?'afetado por lacuna; ':''}${interval.complete?'intervalo completo':'intervalo incompleto/incerto'}`]));
        if(cl)facts.push(['Classificação',`${origin(c)} | ${category(c)}`],['Regra / perfil',`${cl.rule_id||'nenhuma'} | ${cl.profile_id} v${cl.profile_version}`],['Justificativa',cl.reason||'Não informada'],['Responsável',cl.reviewer||'Não informado'],['Equivalência',cl.canonical||'Nenhuma']);
        if(cl?.status==='conflict')facts.push(['Regras em conflito',(cl.candidates||[]).join('; ')]);
        if(!compare&&acts(c).length)facts.push(['Ativações no DAT (s)',acts(c).slice(0,12).map(t=>t.toFixed(6)).join('; ')+(acts(c).length>12?' (até 12; lista completa no JSON)':'')]);
        doc.table(['EVIDÊNCIA / INTERPRETAÇÃO','DETALHAMENTO'],facts,[145,370]);
      }
    }
    doc.section('6','Limites e recomendações');
    const limits=semantic.slice(semantic.indexOf('6. LIMITES E RECOMENDAÇÕES')+1);
    limits.forEach((line,i)=>doc.paragraph(`${i+1}. ${line}`,{size:10,background:i===1?C.warning:null,fill:i===1?C.amber:C.ink}));
    return doc;
  }
  function createReportPdf(data,compare=false){return createReportLayout(data,compare).serialize()}
  root.createReportLayout=createReportLayout;
  root.createReportPdf=createReportPdf;
  if(typeof module!=='undefined')module.exports={createReportPdf,reportLines,createReportLayout};
})(typeof window!=='undefined'?window:globalThis);
