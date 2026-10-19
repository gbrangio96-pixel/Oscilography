/* Motor PDF A4 local. Métricas das fontes padrão Helvetica (Adobe). */
(function(root){
const FONT_WIDTHS={"Helvetica":[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500],"Helvetica-Bold":[278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556]};
const C={navy:[.055,.10,.17],teal:[.0,.42,.36],mint:[.87,.95,.93],ink:[.13,.18,.24],muted:[.37,.43,.50],line:[.85,.89,.91],pale:[.96,.97,.98],amber:[.57,.32,.04],warning:[1,.96,.87],red:[.66,.16,.15],white:[1,1,1]};
const clean=s=>String(s??'').replace(/→/g,'para').replace(/—|–/g,'-').replace(/[^\x0a\x20-\x7e\xa0-\xff]/gu,c=>'U+'+c.codePointAt(0).toString(16).toUpperCase());
const escaped=s=>clean(s).replace(/([\\()])/g,'\\$1');
const color=c=>c.map(n=>n.toFixed(3)).join(' ');
const width=(s,size,font='F1')=>[...clean(s)].reduce((sum,c)=>sum+(font==='F3'?600:(FONT_WIDTHS[font==='F2'?'Helvetica-Bold':'Helvetica'][c.charCodeAt(0)-32]||761)),0)*size/1000;
function wrap(value,max,size=10,font='F1'){
  const output=[];
  for(const paragraph of clean(value).split('\n')){
    let line='';
    for(const word of paragraph.split(/\s+/).filter(Boolean)){
      if(width(line?line+' '+word:word,size,font)<=max){line=line?line+' '+word:word;continue}
      if(line){output.push(line);line=''}
      for(const char of word){if(line&&width(line+char,size,font)>max){output.push(line);line=''}line+=char}
    }
    output.push(line);
  }
  return output.length?output:[''];
}
class Document{
  constructor(title){this.title=title;this.pages=[];this.bookmarks=[];this.newPage(true)}
  newPage(cover=false){this.page={commands:[],text:[]};this.pages.push(this.page);this.y=cover?0:76;if(!cover){this.text(40,25,'OSCILOGRAPHY',11,'F2',C.navy);this.text(555-width(this.title,8),28,this.title,8,'F1',C.muted);this.line(40,54,555,54,C.line)}}
  command(s){this.page.commands.push(s)}
  rect(x,y,w,h,fill){this.command(`${color(fill)} rg ${x} ${842-y-h} ${w} ${h} re f`)}
  line(x,y,x2,y2,stroke=C.line){this.command(`${color(stroke)} RG .6 w ${x} ${842-y} m ${x2} ${842-y2} l S`)}
  text(x,y,s,size=10,font='F1',fill=C.ink){s=clean(s);this.page.text.push({x,y,s,size,font,width:width(s,size,font)});this.command(`BT /${font} ${size} Tf ${color(fill)} rg 1 0 0 1 ${x} ${842-y-size} Tm (${escaped(s)}) Tj ET`)}
  ensure(height){if(this.y+height>782)this.newPage()}
  space(n=10){this.y+=n}
  paragraph(value,{size=10,font='F1',fill=C.ink,background=null,pad=background?12:0,gap=9}={}){
    const lines=wrap(value,515-2*pad,size,font),leading=size*1.45;
    if(lines.length*leading+2*pad<=706)this.ensure(Math.min(706,lines.length*leading+2*pad));
    while(lines.length){
      this.ensure(leading+2*pad);
      const take=Math.max(1,Math.floor((782-this.y-2*pad)/leading));
      const chunk=lines.splice(0,take),height=chunk.length*leading+2*pad;
      if(background)this.rect(40,this.y,515,height,background);
      chunk.forEach((line,i)=>this.text(40+pad,this.y+pad+i*leading,line,size,font,fill));
      this.y+=height;
      if(lines.length)this.newPage();
    }
    this.y+=gap;
  }
  section(number,title,description=''){
    this.ensure(100);this.space(12);this.bookmarks.push({title:number+'. '+title,page:this.pages.length-1,y:this.y});
    this.rect(40,this.y,27,25,C.teal);this.text(48,this.y+5,number,11,'F2',C.white);
    const lines=wrap(title,475,16,'F2');lines.forEach((line,i)=>this.text(78,this.y+i*21,line,16,'F2',C.navy));
    this.y+=Math.max(30,lines.length*21)+8;
    if(description)this.paragraph(description,{size:9.5,fill:C.muted});
  }
  subtitle(title){this.ensure(62);this.paragraph(title,{font:'F2',size:11,fill:C.teal,gap:10})}
  table(headers,rows,widths){
    const headerLines=headers.map((s,i)=>wrap(s,widths[i]-16,8,'F2'));
    const headerHeight=Math.max(...headerLines.map(l=>l.length))*11+16;
    const drawHeader=()=>{this.rect(40,this.y,515,headerHeight,C.navy);let x=40;headerLines.forEach((lines,i)=>{lines.forEach((line,j)=>this.text(x+8,this.y+8+j*11,line,8,'F2',C.white));x+=widths[i]});this.y+=headerHeight};
    this.ensure(headerHeight+36);drawHeader();
    rows.forEach((row,index)=>{
      const cells=row.map((v,i)=>{const o=typeof v==='object'&&v!==null?v:{text:String(v??'')};return {...o,lines:wrap(o.text,widths[i]-16,o.size||9,o.font||'F1')}});
      let remaining=Math.max(...cells.map(c=>c.lines.length));
      const fullHeight=remaining*12+16;
      if(fullHeight<=706-headerHeight&&this.y+fullHeight>782){this.newPage();drawHeader()}
      while(remaining){
        if(782-this.y<28){this.newPage();drawHeader()}
        const count=Math.min(remaining,Math.max(1,Math.floor((782-this.y-16)/12)));
        const height=count*12+16;
        this.rect(40,this.y,515,height,index%2?C.white:C.pale);
        let x=40;
        cells.forEach((cell,i)=>{cell.lines.splice(0,count).forEach((line,j)=>this.text(x+8,this.y+8+j*12,line,cell.size||9,cell.font||'F1',cell.fill||C.ink));x+=widths[i]});
        this.y+=height;this.line(40,this.y,555,this.y,C.line);remaining-=count;
        if(remaining){this.newPage();drawHeader()}
      }
    });
    this.space(14);
  }
  serialize(){
    const objects=['<< /Type /Catalog /Pages 2 0 R >>','',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>'];
    const kids=[];
    this.pages.forEach((page,index)=>{
      const id=objects.length+1;kids.push(`${id} 0 R`);
      objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${id+1} 0 R >>`);
      const footer=`${color(C.line)} RG .6 w 40 43 m 555 43 l S\nBT /F1 8 Tf ${color(C.muted)} rg 1 0 0 1 40 27 Tm (Oscilography | Relatório técnico digital) Tj ET\nBT /F1 8 Tf 1 0 0 1 462 27 Tm (Página ${index+1} de ${this.pages.length}) Tj ET`;
      const content=page.commands.join('\n')+'\n'+footer;
      objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    });
    objects[1]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
    if(this.bookmarks.length){
      const rootId=objects.length+1,first=rootId+1;objects.push(`<< /Type /Outlines /First ${first} 0 R /Last ${first+this.bookmarks.length-1} 0 R /Count ${this.bookmarks.length} >>`);
      this.bookmarks.forEach((b,i)=>objects.push(`<< /Title (${escaped(b.title)}) /Parent ${rootId} 0 R ${i?`/Prev ${first+i-1} 0 R `:''}${i<this.bookmarks.length-1?`/Next ${first+i+1} 0 R `:''}/Dest [${kids[b.page]} /XYZ null ${842-b.y} null] >>`));
      objects[0]=`<< /Type /Catalog /Pages 2 0 R /Outlines ${rootId} 0 R >>`;
    }
    const infoId=objects.length+1;objects.push(`<< /Title (${escaped(this.title)}) /Author (Oscilography) /Subject (Análise de canais digitais COMTRADE) >>`);
    let pdf='%PDF-1.4\n',offsets=[0];
    objects.forEach((obj,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`});
    const start=pdf.length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${start}\n%%EOF\n`;
    return Uint8Array.from(pdf,c=>c.charCodeAt(0));
  }
}
root.PdfLayout={Document,colors:C,wrap,width};
if(typeof module!=='undefined')module.exports=root.PdfLayout;
})(typeof window!=='undefined'?window:globalThis);
