/* PDF local, sem dependências ou envio dos registros a serviços externos. */
(function(root) {
  const labels={both:'Ativado em ambos',only_a:'Ativado somente em A',only_b:'Ativado somente em B',neither:'Sem ativação em ambos',missing_a:'Canal ausente em A',missing_b:'Canal ausente em B',ambiguous:'Correspondência ambígua'};
  const name=c=>`${c.name||'(sem identificação)'} | Fase: ${c.phase||'-'} | Canal ${c.number}`;
  const acts=c=>c.activations||c.rises;
  const initial=c=>c.initial_active??Boolean(c.initial);
  const origins={suggested:'SUGESTÃO',confirmed:'PERFIL CONFIRMADO',manual:'REVISÃO MANUAL',unclassified:'NÃO CLASSIFICADO',conflict:'CONFLITO'};
  function reportLines(data,compare){
    const generated=new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'medium',timeZone:'America/Sao_Paulo'}).format(new Date());
    const lines=['OSCILOGRAPHY | Análise digital v2.0',compare?'RELATÓRIO DE COMPARAÇÃO DE CANAIS DIGITAIS':'RELATÓRIO DE ANÁLISE DE CANAIS DIGITAIS',`Emitido em ${generated} (America/Sao_Paulo)`,''];
    const records=compare?[['A',data.a],['B',data.b]]:[['Registro',data]];
    lines.push('1. RESUMO EXECUTIVO');
    for(const [label,r] of records){
      lines.push(`${label}: ${r.station} | Equipamento: ${r.device}`,`Início: ${r.start} | Trigger: ${r.trigger}`,`${r.samples} amostras | ${r.format} | ${r.channels.length} canais digitais`,`${r.channels.filter(c=>acts(c).length).length} canais ativados durante o registro; ${r.channels.filter(initial).length} já ativos na primeira amostra.`);
      const uncertain=r.channels.filter(c=>!['confirmed','manual'].includes(c.classification?.status));
      lines.push(`${uncertain.length} canais com classificação ou polaridade não confirmada.`,`${r.validation?.warnings.length||0} alertas de qualidade.`, '');
    }
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
      if(r.files){lines.push(`CFG: ${r.files.cfg_name||'não informado'}`,`SHA-256 CFG: ${r.files.cfg_sha256}`,`DAT: ${r.files.dat_name||'não informado'}`,`SHA-256 DAT: ${r.files.dat_sha256}`)}
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
  function pdfText(s){return String(s).replace(/→/g,'para').replace(/—|–/g,'-').replace(/[^\x20-\x7e\xa0-\xff]/gu,c=>'U+'+c.codePointAt(0).toString(16).toUpperCase())}
  function createReportPdf(data,compare=false){
    const lines=reportLines(data,compare).flatMap(line=>{
      const text=pdfText(line),out=[];
      if(!text)return [''];
      let rest=text;
      while(rest.length>90){let cut=rest.lastIndexOf(' ',90);if(cut<1)cut=90;out.push(rest.slice(0,cut));rest=rest.slice(cut).trimStart()}
      out.push(rest);return out;
    });
    const pages=[];for(let i=0;i<lines.length;i+=58)pages.push(lines.slice(i,i+58));
    const objects=['<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>'];
    const kids=[];
    pages.forEach((page,index)=>{
      const pageId=objects.length+1,streamId=pageId+1;kids.push(`${pageId} 0 R`);
      objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`);
      const content=`BT /F1 9 Tf 12 TL 48 792 Td ${page.map(line=>`(${line.replace(/([\\()])/g,'\\$1')}) Tj T*`).join('\n')} ET\nBT /F1 9 Tf 48 28 Td (Oscilography | Página ${index+1} de ${pages.length}) Tj ET`;
      objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    });
    objects[1]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;
    let pdf='%PDF-1.4\n',offsets=[0];
    objects.forEach((object,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${object}\nendobj\n`});
    const xref=pdf.length;
    pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Uint8Array.from(pdf,c=>c.charCodeAt(0));
  }
  root.createReportPdf=createReportPdf;
  if(typeof module!=='undefined')module.exports={createReportPdf,reportLines};
})(typeof window!=='undefined'?window:globalThis);
