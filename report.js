/* PDF local, sem dependências ou envio dos registros a serviços externos. */
(function(root) {
  const labels={both:'Ativado em ambos',only_a:'Ativado somente em A',only_b:'Ativado somente em B',neither:'Sem ativação em ambos',missing_a:'Canal ausente em A',missing_b:'Canal ausente em B',ambiguous:'Correspondência ambígua'};
  const name=c=>`${c.name||'(sem identificação)'} | Fase: ${c.phase||'-'} | Canal ${c.number}`;
  const acts=c=>c.activations||c.rises;
  const initial=c=>c.initial_active??Boolean(c.initial);
  const objectOrigins={extracted:'Extraído de campo HDR',suggested:'Sugestão do texto HDR',ambiguous:'Ambíguo',manual:'Revisão manual',not_identified:'Não identificado'};
  const origins={suggested:'SUGESTÃO',confirmed:'PERFIL CONFIRMADO',manual:'REVISÃO MANUAL',unclassified:'NÃO CLASSIFICADO',conflict:'CONFLITO'};
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
    lines.push('6. LIMITES E RECOMENDAÇÕES','Ativação significa entrada no estado ativo da regra: 0 para 1 ou 1 para 0. Sinais ativos na primeira amostra são listados separadamente. Sem regra, estado ativo 1 é uma hipótese padrão. Estado normal no CFG não define automaticamente a polaridade.','As identificações são extraídas dos arquivos; contatos, alarmes e lógicas também podem estar presentes. A identificação de uma binária não comprova disparo de proteção ou causa da falta.','Fabricante/modelo são metadados declarados, sem identificação automática. Regras confirmadas representam a declaração do responsável, não validação independente da engenharia do relé.','A conclusão se limita aos canais e à janela de cada registro. Pulsos entre amostras e eventos anteriores não podem ser determinados. O relatório inclui todos os canais, independentemente dos filtros da tela.','Revisar alertas, classificações sugeridas, polaridades e ambiguidades. Conferir a lógica do equipamento e os documentos de referência. Análise de correntes/tensões ainda não está implementada.','Caracteres fora do alfabeto ocidental são representados por códigos U+XXXX; nomes originais e perfis completos permanecem no JSON.');
    return lines;
  }
  function createReportLayout(data,compare=false){
    const engine=root.PdfLayout||(typeof require!=='undefined'?require('./pdf_layout.js'):null);
    if(!engine)throw Error('Módulo de diagramação PDF não carregado. Atualize a página.');
    const {Document,colors:C,wrap}=engine;
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
    const side=channels=>channels.length?channels.map(c=>`${c.name||'(sem identificação)'} (#${c.number})\n${acts(c).length?'ATIVADO':'Sem nova ativação'}${initial(c)?'; já ativo no início':''}`).join('\n\n'):'Ausente no CFG';

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
    doc.table(compare?['IDENTIFICAÇÃO','REGISTRO A','REGISTRO B']:['IDENTIFICAÇÃO','REGISTRO'],fields.map(([label,get])=>[{text:label,font:'F2'},...records.map(([_,r])=>get(r)||'Não informado')]),compare?[145,185,185]:[145,370]);
    doc.paragraph(records.map(([label,r])=>`${label}: ${uncertain(r)} canal(is) com classificação ou polaridade não confirmada.`).join(' '),{background:records.some(([_,r])=>uncertain(r))?C.warning:C.mint,fill:records.some(([_,r])=>uncertain(r))?C.amber:C.teal,size:9.5});

    doc.section('2','Evidências observadas','Nomes originais preservados. Ativação é a entrada no estado ativo aplicado ao canal.');
    for(const [label,r] of records){
      doc.subtitle(`${label} | Canais ativados`);
      const activated=r.channels.filter(c=>acts(c).length);
      if(activated.length)doc.table(['CANAL ORIGINAL','FASE','CLASSIFICAÇÃO','ORIGEM','EVIDÊNCIA'],activated.map(c=>[
        {text:`#${c.number} · ${c.name||'(sem identificação)'}`,font:'F2'},c.phase||'-',category(c),{text:origin(c),fill:originColor(c)},`${acts(c).length} ativação(ões)\nAtivo em ${state(c)}`]),[175,40,100,105,95]);
      else doc.paragraph('Nenhum canal apresentou nova ativação.',{fill:C.muted});
      const already=r.channels.filter(initial);
      doc.subtitle(`${label} | Já ativos na primeira amostra`);
      if(already.length)doc.table(['CANAL ORIGINAL','CLASSIFICAÇÃO','EVIDÊNCIA'],already.map(c=>[name(c),category(c),`Estado inicial: ${c.initial}\nJá ativo no início; instante anterior desconhecido.`]),[215,140,160]);
      else doc.paragraph('Nenhum canal já ativo no início.',{fill:C.muted});
    }

    doc.section('3','Conclusão e interpretação',compare?'Comparação dos canais ativados, sem comparação de horários.':'Fatos observados e hipóteses de interpretação apresentados separadamente.');
    if(compare){
      const statuses=['both','only_a','only_b','missing_a','missing_b','ambiguous','neither'];
      doc.table(['RESULTADO DA COMPARAÇÃO','QUANTIDADE'],statuses.map(status=>[labels[status],String(rows.filter(c=>c.status===status).length)]),[400,115]);
      for(const status of statuses){const group=rows.filter(c=>c.status===status);if(!group.length)continue;
        doc.subtitle(`${labels[status]} · ${group.length}`);
        doc.table(['CANAL / SIGNIFICADO','REGISTRO A','REGISTRO B'],group.map(c=>[`${c.name||'(sem identificação)'}\nFase: ${c.phase||'-'}\n${c.basis||'Nome/fase'}`,side(c.a),side(c.b)]),[165,175,175]);
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
