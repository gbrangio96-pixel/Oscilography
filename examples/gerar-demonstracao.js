// Dados fictícios: demonstração visual, sem representar equipamento ou ocorrência real.
const fs=require('node:fs');
const path=require('node:path');
globalThis.compareRecords=require('../comparison.js').compareRecords;
const {createReportPdf}=require('../report.js');
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'dados-demonstracao.json'),'utf8'));
fs.writeFileSync(path.join(__dirname,'relatorio-demonstracao.pdf'),createReportPdf(data,true));
console.log('PDF de demonstração gerado com dados sintéticos.');
