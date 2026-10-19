# Compatibilidade COMTRADE

## Revisões e representações

O leitor reconhece as revisões 1991, 1999, 2001 (IEC 60255-24) e 2013.
O campo de revisão ausente é tratado como layout legado 1991. Campos vazios ou
rótulos como `IEC 60255-24:2001` e `1999.0` são diagnosticados/normalizados.

Revisões não reconhecidas não são rejeitadas só pelo rótulo: a aplicação tenta
ler os campos e os dados pelo layout conhecido, aplicando todas as validações.
Se a leitura passa, a análise e o PDF mostram alerta de **modo de compatibilidade**.
Isso não certifica revisões futuras ou estruturas proprietárias. Um campo de
revisão desconhecido não autoriza reinterpretar bytes arbitrariamente.

| Dados | Interpretação |
|---|---|
| ASCII | Valores digitais 0/1 em colunas individuais |
| BINARY | Analógicos int16, digitais empacotados em palavras uint16 |
| BINARY32 | Analógicos int32, digitais empacotados em palavras uint16 |
| FLOAT32 | Analógicos float32, digitais empacotados em palavras uint16 |

Os formatos binários seguem a ordem little-endian do COMTRADE. A aplicação não
adivinha outro formato quando o declarado é incompatível com o conteúdo.
As quatro representações são testadas com as quatro revisões; a validação usa
registros sintéticos e não estabelece conformidade com todo exportador existente.

## Formas de carregar

- **CFG + DAT:** selecione o CFG no primeiro campo e o DAT no segundo.
- **CFG + segmentos:** selecione todos os segmentos no segundo campo. Extensões
  `.d00`, `.d01`, `.001`, `.002` etc. são ordenadas numericamente. Nomes-base
  precisam coincidir; segmentos intermediários ausentes ou repetidos são rejeitados.
  Os índices de amostras devem permanecer crescentes ao longo do registro.
- **CFF:** selecione o arquivo único no primeiro campo. O DAT separado fica dispensado.
  São lidas as seções CFG e DAT, incluindo os quatro formatos. CFF binário precisa
  declarar o tamanho da seção DAT em bytes (`--- file type: DAT BINARY: N ---`).
  A leitura respeita o tamanho binário e não separa bytes de dados como linhas.
- **ZIP:** selecione no primeiro campo um pacote contendo exatamente um CFG com
  seu DAT/segmentos, ou um único CFF. Para CFG, os dados precisam estar na mesma
  pasta e ter o mesmo nome-base. ZIPs com vários registros exigem separação prévia.
  O pacote é lido em memória, sem extrair arquivos no servidor.

Limite de 32 MB por entrada, incluindo o tamanho descompactado do ZIP. Um ZIP pode
ter até 1000 arquivos. A seção HDR e o arquivo HDR de mesmo nome-base/pasta são lidos opcionalmente para
identificar o objeto relacionado. HDR/INF não são usados para inferir funções
de proteção ou alterar polaridades dos canais digitais.

## Variações de exportadores

CFG/DAT ASCII aceitam UTF-8, Windows-1252, Latin-1 e UTF-16/32 com detecção de BOM
(UTF-16 sem BOM também é detectado por padrão de bytes nulos). São reconhecidos
separadores vírgula, ponto e vírgula e tabulação. Separadores não padrão são
indicados como alertas. A codificação aplica-se ao texto; DAT binário não é decodificado.
Descrições digitais legadas com três campos (número,nome,estado normal) são aceitas.

Timestamp ausente (`0xFFFFFFFF`, ou zero após a primeira amostra) é reconstruído
pelas taxas declaradas. Se não houver taxa utilizável, a leitura falha com diagnóstico.
Para `nrates=0`, os timestamps são necessários. Precisões e metadados adicionais
do CFG 2013 não são usados para sincronizar relógios ou comparar horários.

Amostras analógicas ausentes/não finitas geram alerta e não ocultam canais digitais
válidos. Elas não recebem interpretação elétrica nesta versão. Valores digitais
inválidos, contagens incompatíveis, DAT truncado e sequências fora de ordem continuam
sendo erros, inclusive no modo de compatibilidade.

O JSON/PDF identifica revisão, alertas e hashes. Para segmentos ASCII, o DAT reunido
pode ter separadores de linha/codificação normalizados; hashes individuais dos
segmentos originais também são incluídos. CFF/ZIP recebem hash do contêiner original.

Se uma variante falhar, preserve o diagnóstico e os arquivos originais. Formatos
proprietários, arquivos danificados e novas revisões precisam de validação específica;
não é correto prometer leitura universal sem analisar sua estrutura.
