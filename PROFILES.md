# Perfis de interpretação

Nenhum perfil de fabricante é selecionado automaticamente. O CFG identifica estação,
equipamento e canais, mas não garante identificação de modelo, firmware ou lógica.
O perfil genérico só sugere classificações para uma lista curta de nomes conhecidos.
Termos desconhecidos permanecem não classificados. Sem regra de polaridade, assume-se
estado ativo 1 e essa hipótese é indicada na análise e no PDF.

## Uso na interface

1. Analise o registro e clique em **Revisar classificação** no canal desejado. O nome
   e a fase originais são preenchidos automaticamente, sem renomear o CFG.
2. Em **Perfis de interpretação**, confira categoria, função, estado ativo e justificativa.
   Regras confirmadas ou revisões manuais exigem responsável e justificativa.
3. Adicione/atualize a regra, confira id/versão/escopo no editor JSON e analise novamente.
4. Exporte o perfil em JSON ou salve explicitamente neste navegador. Nenhum perfil é
   gravado automaticamente no servidor. O armazenamento local depende do navegador e
   da origem (incluindo a porta); use JSON como backup e para compartilhar.

É possível usar perfis diferentes para A e B. Editar/importar um perfil invalida os
resultados na tela; a aplicação só reaplica as regras ao executar novamente a análise.
Perfis JSON só são considerados válidos depois da validação pelo servidor na análise.
Um perfil exportado/salvo ainda pode conter erros se não tiver sido analisado.

## Formato JSON

```json
{
  "id": "instalacao-rele-01",
  "version": "1.0",
  "manufacturer": "Fabricante informado pelo responsável",
  "model": "Modelo/firmware informado pelo responsável",
  "station": "",
  "device": "",
  "rules": [
    {
      "id": "saida-07",
      "match": "SAIDA_07",
      "match_type": "exact",
      "case_sensitive": true,
      "phase": "",
      "category": "disparo",
      "function": "",
      "active_state": 1,
      "canonical": "",
      "status": "suggested",
      "reviewer": "",
      "reason": "Exemplo: conferir a saída na lógica do equipamento.",
      "priority": 100
    }
  ]
}
```

Este exemplo não é um perfil validado de equipamento. Só confirme após conferir a
lógica/documentação. `station` e `device`, quando preenchidos, precisam corresponder
exatamente ao CFG; valores vazios não restringem o uso. Fabricante e modelo são
metadados declarados e não restringem/selecionam automaticamente o perfil.

Categorias: `partida`, `disparo`, `bloqueio`, `alarme`, `posição`, `desconhecido`.
Função ANSI é um texto opcional; não deve ser inferida apenas porque um número aparece
no nome. `52A`/`52B` não determinam por si só qual estado significa disjuntor aberto.

`match_type` aceita `exact` ou `glob` (curingas `*`, `?`, classes `[ABC]`).
Por padrão, não diferencia maiúsculas/minúsculas; não remove espaços ou acentos.
`phase`, se omitido, aceita qualquer fase; se presente, exige igualdade exata,
inclusive quando vazio. Não são aceitas expressões regulares ou código executável.

Regras específicas correspondentes têm precedência sobre o perfil genérico.
Dentro do perfil específico, vence a maior `priority` (-10000 a 10000). Havendo
empate, o canal fica em conflito, sem classificação/equivalência automática. A
polaridade então volta à hipótese 1, com alerta explícito. IDs precisam ser únicos;
limite de 500 regras. O editor guiado usa correspondência exata, prioridade 100 e
atualiza a regra existente para o mesmo nome/fase/prioridade.

`active_state` pode ser 0 ou 1. Ativação é a entrada nesse estado; portanto uma regra
ativa em 0 usa transições 1 para 0. Estado normal do CFG é apenas apresentado, nunca
usado para inferir automaticamente a polaridade. Os estados e transições brutos
permanecem no JSON ao lado das ativações interpretadas.

`status`: `suggested` (sugestão), `confirmed` (perfil confirmado) ou `manual`
(revisão manual). Os dois últimos exigem `reviewer` e `reason`. A confirmação é a
declaração do responsável, não uma certificação independente do sistema.

## Comparar nomes diferentes

Defina o mesmo `canonical` nos dois perfis somente quando os sinais tiverem o mesmo
significado operacional, por exemplo `ordem_geral_disparo`. Para aceitar a associação,
as regras devem estar confirmadas/manuais e categoria, função e fase precisam coincidir.
Polaridades podem ser diferentes: cada canal é interpretado antes da comparação.

Um canal com equivalência configurada não é associado por coincidência de nome a
outro sem a equivalência; o sistema prefere expor a ausência de correspondência.
Múltiplos canais com o mesmo significado/fase ficam ambíguos, sem escolher arbitrariamente.
Sugestões genéricas não criam equivalências. A comparação nunca usa horários ou
quantidades de ativações para decidir se o canal ativou nos dois registros.

## Evidências e reprodução

O JSON inclui nomes originais, estados brutos, ativações interpretadas, classificação,
regra, justificativa, responsável, perfil/versão e regras completas do perfil específico.
O perfil genérico de fallback é identificado por versão. Arquivos CFG/DAT e perfil
recebem hashes SHA-256; alterações de conteúdo são rastreáveis mesmo se a versão
não tiver sido atualizada. Preserve os arquivos originais, o perfil e o JSON junto
ao PDF para uma revisão técnica reproduzível.

Na validação, erros estruturais bloqueiam a análise; lacunas de amostras, nomes
duplicados, tempos reconstruídos/repetidos e conflitos de regras geram alertas.
Dois arquivos diferentes com estrutura compatível podem passar pela validação:
a ferramenta não comprova que CFG e DAT vieram da mesma ocorrência. Confira sua origem.
Correntes/tensões e causalidade elétrica não são analisadas nesta versão.
