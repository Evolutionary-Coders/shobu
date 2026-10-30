# ADR 0030 — sniper laser como arma principal padrão

- **status**: proposta
- **data**: 2026-10-29
- **decidem**: _a preencher_

## contexto

a linha ARMA PRINCIPAL da EDITAR CLASSE existe desde o `9d82879` com uma opção só, a SNIPER
SHB-96, e a seta nela não andava. o pedido agora é uma sniper laser futurista, a **HANABI LX-01**,
como arma principal **padrão**, com a SHB-96 como segunda opção da mesma linha. as duas jogam igual: a mesma
configuração, um tiro mata, o ferrolho fica. muda o modelo (primeira e terceira pessoa) e a cor
do feixe.

online, os outros jogadores precisam saber qual das duas desenhar na mão de cada um e de que cor
sai o feixe dele. até aqui a única escolha por jogador que os outros clientes viam era o nome de
perfil (`profile.callsign` → campo `name` do estado da sala); a lâmina vai só do cliente ao
servidor (`loadout.melee`).

## decisão

1. **o núcleo tem o tipo.** `PrimaryWeapon = 'laser' | 'classic'`, `PRIMARY_WEAPONS` na ordem do
   menu (a primeira é a padrão) e o código do fio é o índice nessa lista. a regra de tiro não lê
   a escolha: a kill continua sendo `sniper`.
2. **a escolha viaja como o nome.** o cliente manda `loadout.primary` na entrada e a cada partida
   que a troca; o servidor valida (`isPrimaryWeapon`), guarda no assento e escreve no campo
   `primary` (`uint8`) do estado da sala. o bot leva a laser. o cliente copia o campo sem
   interpolar, como a postura, e um código desconhecido, ou a falta do campo num servidor antigo,
   vira a laser.
3. **sem migração da preferência guardada.** `primary: 0` passa a ser a laser. todo 0 guardado
   até aqui era o padrão de uma linha travada, não uma escolha da SHB-96, e convertê-lo em
   clássica guardaria uma preferência que ninguém expressou, contra a decisão de a laser ser a
   padrão. quem quiser a clássica a escolhe uma vez.

## consequências

- servidor e cliente sobem juntos: um cliente antigo nunca manda `loadout.primary` e aparece
  com a laser para os outros.
- o acabamento da sniper (SKIN DA SNIPER) vale para a arma principal que estiver na mão: as duas
  são snipers e o vestem igual. a miniatura do menu passa a ser uma por arma e acabamento
  (`laser-*.webp` e `sniper-*.webp`).
- o nome da laser é HANABI LX-01 no menu e no hud (`HANABI · LX-01` no bloco da arma), e o hud
  mostra a arma principal da partida, não mais a SHB-96 fixa.
- a troca de arma principal é só no menu; a tecla 2 continua livre.
