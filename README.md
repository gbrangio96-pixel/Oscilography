# Oscilography

Aplicação em português para análise dos canais digitais de oscilografias COMTRADE. Extrai automaticamente as identificações do CFG e informa transições 0 → 1, retornos 1 → 0 e canais já ativos no início. Exporta o resultado em JSON.

## Executar

Requer Python 3.10 ou superior, sem dependências externas. Extraia o ZIP e abra um terminal na pasta `Oscilography`.

```sh
python3 server.py --port 8000
```

Abra `http://localhost:8000` no navegador e selecione os arquivos CFG e DAT do mesmo registro. No Windows, use `py server.py --port 8000` se o comando `python3` não estiver disponível. Encerre com Ctrl+C. Limite total: 32 MB por par. Os arquivos são processados em memória e não são salvos pelo aplicativo.

## Validar

```sh
python3 -m unittest discover -s tests -v
node --test tests/test_comparison.js
```

Suporta canais digitais em DAT ASCII, BINARY, BINARY32 e FLOAT32, com configuração COMTRADE 1991/1999/2013. Os canais analógicos são usados apenas para posicionar os dados digitais; não há análise de formas de onda. Tempos são relativos à referência do DAT, com multiplicador do CFG e reconstrução pelas taxas de amostragem quando o timestamp é zero. Identificação de função usa o nome original, sem inferir códigos ANSI ou traduzir identificações proprietárias.

## Comparar duas oscilografias

Selecione **Comparar dois registros** e carregue os pares CFG/DAT de A e B. A tabela mostra os estados, ativações e retornos lado a lado, os canais presentes somente em um registro e as diferenças entre os tempos das ativações. Há filtros para sinais ativos, diferenças e todos os canais, além de exportação completa em JSON.

A associação usa nome e fase exatamente como declarados no CFG; números e posições dos canais podem ser diferentes. Nomes vazios ou repetidos na mesma fase são sinalizados como ambíguos, sem cálculo de diferença temporal. Nomes diferentes não são considerados equivalentes automaticamente.

Os tempos usam a referência de cada DAT, sem alinhamento por horário absoluto ou trigger. O delta é B menos A, em milissegundos, pareando ativações pela ordem de ocorrência. Quantidades diferentes de ativações são indicadas; as ocorrências excedentes não recebem delta. Janelas, pré-falta e relógios distintos devem ser considerados na interpretação. “Transições iguais” significa igualdade dos estados inicial/final e das listas de transições, e não equivalência dos equipamentos ou da oscilografia completa. O limite é de 32 MB por par.

Node.js é necessário apenas para executar os testes da comparação; o aplicativo continua usando somente Python e um navegador.

Estado 1 é apresentado como ativo, independentemente do campo de estado normal do CFG (que também é exibido). Uma transição digital não comprova disparo de proteção: contatos, alarmes e sinais de lógica também podem estar registrados. Operações anteriores à primeira amostra e pulsos entre amostras não podem ser determinados. A validação usa registros sintéticos; valide também com registros reais dos relés utilizados antes de uso operacional.
