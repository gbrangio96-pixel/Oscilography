# Oscilography

Aplicação em português para análise dos canais digitais de oscilografias COMTRADE. Extrai automaticamente as identificações do CFG e informa transições 0 → 1, retornos 1 → 0 e canais já ativos no início. Exporta o resultado em JSON e relatório automático PDF. Inclui classificação rastreável por perfis e validação de integridade dos arquivos.

## Executar

Requer Python 3.10 ou superior, sem dependências externas. Extraia o ZIP e abra um terminal na pasta `Oscilography`.

```sh
python3 server.py --port 8000
```

Abra `http://localhost:8000` no navegador e selecione os arquivos CFG e DAT do mesmo registro, ou um arquivo único CFF/ZIP. No Windows, use `py server.py --port 8000` se o comando `python3` não estiver disponível. Encerre com Ctrl+C. Limite total: 32 MB por par. Os arquivos são processados em memória e não são salvos pelo aplicativo.

## Validar

```sh
python3 -m unittest discover -s tests -v
node --test tests/test_comparison.js tests/test_report.js
```

Suporta canais digitais em DAT ASCII, BINARY, BINARY32 e FLOAT32, com configuração COMTRADE 1991/1999/2001/2013. Os canais analógicos são usados apenas para posicionar os dados digitais; não há análise de formas de onda. Tempos são relativos à referência do DAT, com multiplicador do CFG e reconstrução pelas taxas de amostragem quando o timestamp é zero. Identificação de função usa o nome original, sem inferir códigos ANSI ou traduzir identificações proprietárias.

## Formatos e revisões

A revisão **2001** é reconhecida junto com 1991, 1999 e 2013. Além do par CFG/DAT, é possível carregar CFF, ZIP com um registro e DAT dividido em segmentos numerados. Campos de revisão não padronizados são diagnosticados e lidos em modo de compatibilidade somente quando a estrutura passa pelas validações.

Veja [COMPATIBILITY.md](COMPATIBILITY.md) para formatos binários, codificações, limites e variações de exportadores. O suporte validado não equivale a uma garantia para qualquer arquivo proprietário ou danificado.

## Comparar duas oscilografias

Selecione **Comparar dois registros** e carregue os pares CFG/DAT de A e B. A tabela destaca os canais ativados em ambos, somente em A ou somente em B, além dos canais ausentes no CFG e das correspondências ambíguas. Os horários, os retornos e a quantidade de ativações não influenciam a classificação. Os sinais já ativos na primeira amostra são indicados separadamente e não contam como nova ativação.

A associação usa nome/fase originais ou equivalências explícitas confirmadas nos perfis de interpretação. Identificações repetidas, aliases em conflito e regras conflitantes são apresentados como ambíguos. Horários não influenciam a comparação. Ativações respeitam a polaridade configurada no perfil, incluindo sinais ativos em 0.

## Perfis e classificação das binárias

Abra **Perfis de interpretação** para importar, exportar, editar ou salvar perfis no navegador. Há um perfil independente para A e para B. O botão **Revisar classificação** preenche automaticamente o nome/fase do canal a partir do CFG; você só revisa o significado e a polaridade. Perfis específicos têm precedência sobre as sugestões genéricas. Nomes desconhecidos permanecem não classificados.

Categorias: partida, disparo, bloqueio, alarme, posição e desconhecido. Função ANSI é opcional. A interface mostra origem da classificação, regra, perfil/versão, justificativa, responsável e estado ativo. Regras confirmadas ou revisões manuais exigem responsável e justificativa. Nenhum fabricante ou firmware é presumido automaticamente.

Veja [PROFILES.md](PROFILES.md) para o esquema JSON, escopo por estação/equipamento, prioridades, curingas, equivalências entre fabricantes e critérios de validação. O perfil genérico pode ser baixado na interface. Ele é conservador e suas classificações são sugestões, sem equivalências automáticas.

## Qualidade e relatório PDF

Erros estruturais bloqueiam a análise: contagem de canais incompatível, DAT truncado, amostras fora de ordem, estados digitais inválidos, datas inválidas e limites de amostras inconsistentes. Lacunas de amostras, identificações duplicadas, timestamps reconstruídos/repetidos e conflitos de regras geram alertas visíveis. A validação é estrutural e não comprova que dois arquivos compatíveis são da mesma ocorrência.

Após analisar ou comparar, clique em **Baixar relatório PDF**. O documento é gerado no navegador sem bibliotecas adicionais ou serviços externos. Contém resumo executivo, evidências, conclusão automática, qualidade, hashes SHA-256 dos arquivos e do perfil, regras aplicadas, responsável e anexo com todos os canais. Sugestões e fatos observados são identificados separadamente; a conclusão não afirma a causa da falta ou a abertura efetiva do disjuntor apenas por uma binária.

O relatório usa todos os canais, independentemente dos filtros. Caracteres fora do alfabeto ocidental aparecem como códigos U+XXXX; as identificações originais permanecem no JSON. Preserve CFG/DAT originais, perfil JSON e análise JSON para revisão reproduzível.

Node.js é necessário apenas para executar os testes da comparação; o aplicativo continua usando somente Python e um navegador.

O estado ativo é definido pela regra (0 ou 1). Sem regra, estado 1 é uma hipótese explícita. O campo de estado normal do CFG é exibido, mas não define automaticamente a polaridade. Uma transição digital não comprova disparo de proteção: contatos, alarmes e sinais de lógica também podem estar registrados. Operações anteriores à primeira amostra e pulsos entre amostras não podem ser determinados. A validação usa registros sintéticos; valide também com registros reais dos relés utilizados antes de uso operacional.

## Gerar o pacote distribuível

```sh
python3 package_app.py
```

O arquivo `downloads/Oscilography.zip` inclui aplicação, documentação e testes, sem dependências externas para executar a aplicação.
