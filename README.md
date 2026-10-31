# Operação Tática

Jogo de operações de soldados em 2D (visão de cima), feito só com HTML, CSS e JavaScript — sem imagens, sons sintetizados no navegador.

**Jogue:** abra o `index.html` (ou a página do GitHub Pages deste repositório).

## O que tem
- Campanha com 6 modos (Eliminação, Documentos, Resgate, Sabotagem, Alvo VIP, Sobrevivência) e **Partida personalizada** com tudo liberado.
- ~167 armas (pistolas, SMGs, fuzis de assalto e de batalha, DMRs, metralhadoras, 18 escopetas, snipers, antimaterial, lançadores, corpo a corpo), 56 calibres com dano/penetração próprios, acessórios e skins.
- Inimigos, reféns, objetivos e itens aparecem em todos os andares. Carregadores e cápsulas que caem seguem o estilo da arma (pente reto de pistola, STANAG, banana de AK, tambor, caixa de fita, pente de escopeta…); a munição e cada granada no chão têm o seu desenho.
- Foguetes, granadas e cargas destroem paredes (drywall, madeira, tijolo; concreto cai com 2 foguetes). Cada tiro tem som de disparo próprio (calibre, cano, ambiente fechado) e acessórios de boca mudam o ruído: silenciador abafa, freio e compensador deixam mais alto.
- Paredes de madeira, tijolo (casas) e concreto (prédios): cada calibre atravessa até certo material e todo obstáculo atravessado reduz o dano.
- 7 modelos de construção (casa, cabana de madeira, bangalô, sobrado de 2 andares, galpão, garagem, prédio de escritórios) e inimigos sorteados: cada um recebe arma, acessórios, proteção, granadas e kit médico aleatórios (melhores conforme o nível), com visual de acordo com o equipamento, e solta o que carregava.
- Prédios e sobrados com até 4 andares (duas escadas alternadas), janelas grandes de 2 ou 3 blocos que quebram inteiras, telhados que somem quando você entra, portas, janelas, penetração de materiais, visão noturna e térmica.
- Dano por partes do corpo (estilo War Thunder), sangramento, coletes, arremessáveis (granada, atordoante, fumaça, molotov, sinalizador, mina).
- **Multiplayer online** (até 8 jogadores): Todos contra todos ou Equipes, direto entre navegadores via WebRTC (PeerJS). Quem cria a sala passa o código/link aos amigos. O anfitrião pode adicionar até 8 bots (variados, básicos, elite, snipers…). Modos: Todos contra todos, Equipes, **Ataque × Defesa — Bomba** (plantar/desarmar, sem renascer no round) **Ataque × Defesa — Capturar zona** (rounds e troca de lados), **Gun Game** (escada de 15 armas), **Rei da Colina** (domine a colina sozinho para pontuar) e **Cooperativo** (ondas de hostis contra todos os jogadores). Nos modos de equipe os bots só atacam o outro time; nos demais, atacam uns aos outros.
- O peso de tudo que você carrega (armas na mão e nas costas, acessórios, munição, proteção e suprimentos) define a velocidade: armas leves quase não pesam; metralhadoras e armas pesadas reduzem bastante. Trocar de arma tem tempo de equipar (varia por categoria) e carrega sozinha se estiver vazia; 6 itens de cura (bandagem, analgésico, adrenalina, tala, kit médico, kit cirúrgico), cada um com seu tempo de uso (H usa, X troca).

- **Corpo humano**: cada parte guarda órgãos e ossos (cérebro, crânio, olhos, face, costelas, pulmões, coração, fígado, rins, estômago, coluna, ossos, artérias e músculos dos membros). Cada um tem efeitos: parada cardíaca, hemorragias, tosse que denuncia a posição, visão reduzida, tontura, fraturas que travam a mira ou a corrida, coluna que obriga a rastejar. Curas tratam cada tipo (bandagem estanca vasos, tala conserta ossos, adrenalina reanima o coração, cirurgia restaura tudo). Tecla **K** (ou clique nos bonecos) abre a ficha médica; o segundo boneco mostra a durabilidade de capacete, colete e botas.
- **Equipamentos**: 35 itens (capacetes PASGT/Ops-Core/antitumulto/cerâmico/EOD, coletes dissimulado/IIIA/assalto/porta-placas/antibomba/nível IV, botas reforçadas/atleta/hidráulicas, óculos balísticos, binóculos, térmica compacta, noturno Gen3 e visor híbrido).

## Controles
WASD mover · mouse mira/atira · 1-3 armas · R recarrega · F golpe · G arremessar · T trocar item · B tipo de cartucho · H kit médico · V reparar colete · N visão · E interagir · I inventário · Esc pausa. No celular: analógicos na tela.
