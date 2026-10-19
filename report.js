/* PDF local, sem dependências ou envio dos registros a serviços externos. */
(function(root) {
  const labels={both:'Ativado em ambos',only_a:'Ativado somente em A',only_b:'Ativado somente em B',neither:'Sem ativação em ambos',missing_a:'Canal ausente em A',missing_b:'Canal ausente em B',ambiguous:'Correspondência ambígua'};
  const name=c=>`${c.name||'(sem identificação)'} | Fase: ${c.phase||'-'} | Canal ${c.number}`;
  function reportLines(data,compare){
    const lines=['OSCILOGRAPHY',compare?'RELATÓRIO DE COMPARAÇÃO DE CANAIS DIGITAIS':'RELATÓRIO DE ANÁLISE DE CANAIS DIGITAIS',''];
    function record(r,label){
      lines.push(`${label}: ${r.station} | Equipamento: ${r.device}`,`Início do registro: ${r.start} | Trigger: ${r.trigger}`,`${r.samples} amostras | Formato ${r.format} | ${r.channels.length} canais digitais`);
      const activated=r.channels.filter(c=>c.rises.length);
      const initial=r.channels.filter(c=>c.initial);
      lines.push(`${activated.length} canais ativados durante o registro; ${initial.length} já ativos na primeira amostra.`,'CANAIS ATIVADOS (transição 0 para 1):');
      lines.push(...(activated.length?activated.map(c=>`${name(c)} | ${c.rises.length} ativação(ões)`):['Nenhum canal apresentou nova ativação.']));
      lines.push('JÁ ATIVOS NO INÍCIO (instante de ativação anterior desconhecido):',...(initial.length?initial.map(name):['Nenhum.']),'');
    }
    if(compare){
      record(data.a,'OSCILOGRAFIA A');record(data.b,'OSCILOGRAFIA B');
      // Recalcula a classificação a partir das análises, sem confiar em estados de filtros.
      const rows=root.compareRecords(data.a,data.b);
      lines.push('CONCLUSÃO AUTOMÁTICA');
      for(const status of ['both','only_a','only_b','missing_a','missing_b','ambiguous','neither']){
        const group=rows.filter(c=>c.status===status);
        lines.push(`${labels[status]}: ${group.length}`);
        for(const row of group){
          lines.push(`  ${row.name||'(sem identificação)'} | Fase: ${row.phase||'-'}`);
          if(['missing_a','missing_b','ambiguous'].includes(status)){
            for(const side of ['a','b'])lines.push(`    ${side.toUpperCase()}: ${row[side].length?row[side].map(c=>`#${c.number}: ${c.rises.length?'ativado':'sem nova ativação'}${c.initial?', já ativo no início':''}`).join('; '):'ausente no CFG'}`);
          }
        }
      }
      lines.push('','Critério: nomes e fases idênticos no CFG. A comparação considera a presença de ativação, sem comparar horários, retornos ou quantidade de ocorrências. Canais ausentes não equivalem a canais sem ativação. Nomes vazios ou duplicados não são associados automaticamente.');
    }else{
      record(data,'OSCILOGRAFIA');
      lines.push('CONCLUSÃO AUTOMÁTICA',`Foram identificados ${data.channels.filter(c=>c.rises.length).length} canais com nova ativação no período observado.`, 'DEMAIS CANAIS SEM NOVA ATIVAÇÃO:',...data.channels.filter(c=>!c.rises.length).map(c=>`${name(c)}${c.initial?' | Já ativo no início':''}`));
    }
    lines.push('','INTERPRETAÇÃO E LIMITES','Ativação significa transição digital de 0 para 1. Sinais ativos na primeira amostra são listados separadamente. Estado 1 é tratado como ativo, independentemente do estado normal declarado no CFG.','As identificações são extraídas dos arquivos; contatos, alarmes e lógicas também podem estar presentes. A identificação de uma binária não comprova disparo de proteção ou causa da falta.','A conclusão se limita aos canais e à janela de cada registro. Pulsos entre amostras e eventos anteriores ao registro não podem ser determinados. O relatório inclui todos os canais, independentemente dos filtros da tela.','Caracteres fora do alfabeto ocidental são representados por códigos U+XXXX para preservar sua identificação.');
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
    const pages=[];for(let i=0;i<lines.length;i+=46)pages.push(lines.slice(i,i+46));
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
