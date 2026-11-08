# Prompt para continuar o projeto "E se fosse você?" em outro chat

> Cole tudo abaixo (a partir de "Você vai continuar…") como primeira mensagem de uma sessão nova do Claude Code com o repositório **gtvmoura/claudell** selecionado.

---

Você vai continuar um projeto de vídeos curtos para TikTok que já está pronto e funcionando. Leia este documento inteiro antes de agir. Responda sempre em **português do Brasil**.

## 1. O canal e a série
- Canal no TikTok: **@esefossevoceai**, nome "E se fosse você?". Bio: "Minisséries 3D onde VOCÊ é o personagem. Comenta A ou B e decide o próximo ep 👇". A foto de perfil é um olho amarelo com "?" na pupila.
- Série atual: **"A Comunidade"**. É um apocalipse zumbi visto de cima (câmera aérea de drone), em estilo **low-poly 3D**, numa **clareira verde no meio de uma floresta, sem prédios**.
- Premissa: um fundador (o próprio canal, **@esefossevoceai**) chegou sozinho e fundou uma comunidade. **Cada seguidor que comenta vira morador.** Quem diz uma função (caçador, construtor…) ganha essa função; quem não diz vira "Morador".
- Todo episódio termina com um **dilema A/B**, votado nos comentários, que decide o próximo episódio. **Crescer tem consequências**: comida, barulho, fumaça, brigas, atrair zumbis ou saqueadores.
- **Parte 1** (publicada, mais de 13,8 mil visualizações): o fundador chega pela trilha, planta a bandeira "A COMUNIDADE · POP. 1", acende a fogueira, e à noite os zumbis saem da mata. Dilema: **A) paliçada de troncos × B) torre de vigia + armadilhas**. **A ganhou** (6 × 2 nos comentários).
- **Parte 2** (renderizada; publicar ou conferir): começa com o contexto da Parte 1. Depois vem a **fila** de moradores chegando pela trilha com **nome e função** sobre a cabeça (o usuário **gostou muito da fila**), enquanto o **contador sobe para 160 moradores** e o narrador diz "Vocês responderam. Cento e sessenta moradores!". Em seguida, **3 moradores em foco**, cada um com um **card do comentário real** na tela sobre o personagem que nasceu dele: **Yuki** (caçadora), **Ruhan** (armeiro, ex-militar) e **Anna** (master chef). Depois: "Cada um com seu trabalho na comunidade." A paliçada sobe tronco a tronco, na primeira noite os zumbis voltam e **a paliçada segura** (tochas no portão), aparece o medidor de **comida** (acaba em 3 dias) e um **sinalizador vermelho** ao longe ("alguém lá fora viu a fumaça"). Dilema: **A) caçadores saem à noite pra caçar (arriscado) × B) plantar uma horta e racionar (lento)**.
- População: **160 moradores** no total (seguidores). Só **47 têm modelo** (fundador + 46 que comentaram com nome). **Nunca diga "47 com função"**; mostre só o 160. Não precisa criar 160 modelos.

## 2. Preferências do usuário (siga à risca)
1. **Vídeo vertical 1080×1920, 30 fps, entre 61 e 70 s.**
2. **Câmera aérea/drone** (seguir personagem, planos de cima, close-ups pontuais). **Não usar 1ª pessoa.**
3. **Só o narrador fala.** Nada de falas de personagem entre aspas. O narrador explica tudo.
4. **Narração:** voz **cadu** do Piper com efeito "cinema" (tom 0,89, mais grave), velocidade 1,2, pausa 0,12. Nenhuma fala pode atropelar a seguinte.
5. **Comece com contexto** (o que aconteceu no episódio anterior e o que votaram), mostre **a escolha vencedora acontecendo** e suas **consequências**, e termine com um **novo dilema A/B**.
6. **Foque em 2 ou 3 moradores** por episódio, com o **card do comentário real** deles (usuário + texto exatos), mostrando que os comentários deram vida aos personagens. Não mostre etiqueta de todo mundo; a fila de chegada pode mostrar nomes e funções.
7. **Sempre tire prints** (stills) dos momentos-chave, **olhe-os**, corrija o que estiver ruim e só então renderize. No final, extraia prints **do vídeo pronto** e confira de novo.
8. Mostre o **roteiro ou os prints antes de um render longo** quando houver mudança grande. O usuário corrige no meio do caminho; quando ele interromper, pare e ajuste.
9. Legendas curtas, com destaque amarelo em `*palavras*`. Contador "MORADORES" no topo. Cartão final "COMENTE A OU B + seu NOME e FUNÇÃO pra virar morador".
10. Entregue o **MP4 leve para postar** (ver comandos) e uma folha de prints. Sugira a **descrição do post**, as **hashtags** (#apocalipsezumbi #oquevocefaria #pov #parteN #AComunidade) e o **comentário fixado**.

## 3. Como o usuário passa os dados
Ele manda **prints dos comentários** do TikTok. Você deve:
- extrair **nome** (o que a pessoa escreveu, ou o @ quando não escreveu) e **função**;
- contar os **votos A/B** (comentários e enquete);
- quem só disse "eu quero", "eu pfvr" etc. vira **Morador**;
- nomes repetidos se diferenciam pela função;
- moradoras: passe `visual.hair` feminino, `height 1.62` e **`beard: false`** (o sorteio pode dar barba);
- atualizar `series.json` com votos, pedidos e o vencedor.

## 4. Repositório, ambiente e Git
- Repositório: **github.com/gtvmoura/claudell**, branch **`claude/zombie-apocalypse-cristo-series-jy1dd2`** (trabalhe e envie nela).
- A conta antiga (gustavormoura05-ship-it) **não existe mais** para este projeto. Use só o repositório novo.
- **Git:** faça commits claros em português. **Envie (push) uma vez por etapa.** Se der erro 403, **não fique repetindo**: explique ao usuário e peça para conferir o app do Claude em github.com/apps/claude/installations/select_target (conta gtvmoura, repositório claudell).
- **Ambiente de nuvem "esefossevoceai"** (pessoal): libera huggingface.co, us.aws.cdn.hf.co, cas-bridge.xethub.hf.co, cdn-lfs.hf.co e cdn-lfs-us-1.hf.co para baixar as vozes do Piper.
- Coisas que **não ficam no Git** e precisam ser refeitas numa máquina nova:
  - `npm install` (three 0.187, fontes Anton e Montserrat);
  - `pip install piper-tts`;
  - as vozes em `assets/vozes/` (`pt_BR-cadu-medium.onnx` e `.onnx.json`, de `https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/cadu/medium/`; opcionalmente também faber e jeff);
  - os efeitos sonoros em `assets/sfx/` (gerados sozinhos pelo `engine/sfx.mjs`);
  - o cache de narração em `assets/tts/`.
- O Chromium e o Playwright já vêm instalados na nuvem (`require('playwright')`). Sem placa de vídeo, o render usa SwiftShader: cerca de 1,1–1,4 s por quadro com 3 páginas, ou seja, **40–55 min por episódio**. Rode em segundo plano e acompanhe o log.

## 5. Arquitetura (não reescreva; estenda)
- `engine/render.mjs`: o Playwright abre `engine/index.html`, chama `renderFrame(t)` quadro a quadro, captura em JPEG q95 e o ffmpeg junta os quadros e mixa o som.
  - Opções: `--workers 3`, `--start S --duration D --out arq.mp4`, `--stills t1,t2`, `--png`.
  - `--so-audio video.mp4` refaz **só o som** (narração e efeitos) sobre um vídeo já renderizado, em segundos.
  - Cada captura espera **2× requestAnimationFrame** depois de `renderFrame`.
- `engine/core.js`: câmera, legendas palavra por palavra, título, contador, **medidor**, **card de comentário**, cartão A/B, cartão final e pós-processamento (bloom + passe final com tone mapping, FXAA, cor, vinheta e grão).
  - **Etiquetas** são desenhadas num canvas 2D em memória comum (`willReadFrequently`) e entram na imagem pelo passe final do WebGL. Elas não se amontoam (prioridade para quem está mais perto, `maxEtiquetas`), somem perto das bordas e da legenda.
  - Câmera: pose `{pos:[x,y,z], look:[x,y,z], fov}` ou `{follow:"fundador", offset:[x,y,z]}` (drone que segue).
- `engine/scenes/floresta.js`: a cena atual (clareira de raio ~20 m, trilha ao sul em +Z, riacho a leste, fogueira em (-1.6, 0.6), bandeira em (1.4, 1.2)).
  - Estágios via `"construido": [...]`; o que não foi construído aparece como **holograma azul** (eventos `planta_on`/`planta_off`).
  - Construções existentes: `palicada` (raio 16, portão ao sul, animação `obras.palicada:[t0,t1]`, portão fecha à noite, tochas), `torre`, `cabanas`, `horta`, `roca`, `pedreira`, `panela`, `comida` (caixas que somem com o medidor) e `tocos`.
  - Eventos: `bandeira`, `fogo`, `noite`, `sinalizador`.
  - Zumbis com olhos vermelhos brilhantes saem da mata e param em `raioFim`.
- `engine/scenes/comunidade.js` e `engine/scenes/cristo.js`: cenas antigas (acampamento em ruínas e Cristo Redentor), servem de referência.
- `engine/lib/people.js`: personagens low-poly articulados.
  - `PAPEIS` traz visual, equipamento e animação por função: cacador (arco e aljava), arqueiro, construtor (capacete, colete, martelo), lenhador (machado), guardiao (lança e escudo), espadachim, lutador, militar (fuzil), cozinheiro (chapéu de chef, concha), agricultor (enxada), minerador (capacete com lanterna, picareta), medico (jaleco, maleta), ajudante (tora no ombro), criador e morador.
  - `funcaoParaPapel(texto)` mapeia o que a pessoa escreveu para um desses papéis.
  - Animações: andar, correr, capinar, martelar, mexer, machadar, picaretar, guarda, lanca, lutar, mirar, fuzil, carregarTora, acenar, apontar, olhar, assustado, sentado, plantar, zumbi, fantasma…
- `engine/tts.mjs`: narração com o Piper (cache por texto).
  - Por legenda: `fala` (ou `false`). Também `title.fala` e `narracao.extras`.
  - **Legendas entre aspas não são narradas.**
- `engine/sfx.mjs`: efeitos sintetizados (lofi, vento, passaros, fogueira, grilos, martelo, grunhido, impacto, whoosh, tensao, coracao, trilha, sino…). `martelo` bate em segundos inteiros, sincronizado com a animação `martelar`.
- `videos/comunidade-ep01/script.json` e `videos/comunidade-ep02/script.json` são os **modelos** para o próximo episódio. `series.json` guarda as regras e o histórico.

### Campos do script.json (floresta)
- **Básico:** `scene`, `duration`, `populacao`, `construido`, `obras`, `bandeira:[[t,pop]]`, `counter{keys,curve:"exp"}`, `medidor{label,keys,textos}`.
- **Fundador:** `fundador{trajeto:[[t,x,z]],acoes:[[t,anim]],yaws}`.
- **Moradores:** `cidadaos[{id,nome,funcao,papel,pos,yaw,seed,chega,de,vel,etiqueta:[t0,t1],noitePos,yawNoite,rota,visual}]`.
- **Zumbis e gancho:** `zumbis{n,aparece,setor,raioIni,raioFim,vel}`, `sinalizador{pos}`.
- **Textos na tela:** `comentarios[{start,end,user,text,cor}]`, `captions[{start,end,text,fala,y,camera}]`, `choice{start,ask,a,b,cta,sub}`.
- **Eventos, efeitos e som:** `events`, `effects` (flash/shake), `narracao{voz,velocidade,pausa,efeito,tom,pronuncia,extras}`, `sounds`.
- **Post:** `post{titulo,descricao,comentario_fixado}`.

## 6. Fluxo de cada episódio novo
1. Ler os prints, montar a lista de moradores e votos, e atualizar `series.json`.
2. Escrever o roteiro: contexto → a escolha vencedora acontecendo → 2 ou 3 moradores em foco com card de comentário → população → consequência → gancho → dilema A/B. **Mostrar ao usuário** se mudar muita coisa.
3. Copiar o `script.json` do episódio anterior para `videos/comunidade-epNN/` e ajustar. Somar a construção vencedora em `construido` e mantê-la nos próximos episódios.
4. Conferir a narração: rodar `narrar()` e checar se alguma fala passa da legenda ou atropela a seguinte (o tts.mjs avisa). Encurtar com `fala` quando precisar.
5. Tirar stills (script de stills simples com Playwright ou `--stills`), **olhar os prints** e corrigir: personagem de costas, câmera atrás de árvore ou dentro de muro, cabeça escondida pelo card, etiquetas embolando, noite escura demais.
6. **Testar o determinismo:** renderizar os mesmos instantes em ordens diferentes; os PNGs têm que sair **idênticos** (md5).
7. Rodar o render completo em segundo plano (`node engine/render.mjs videos/comunidade-epNN/script.json --workers 3`) e fazer commit + push enquanto roda.
8. Gerar a versão para postar:
   ```
   ffmpeg -i out/X.mp4 -c:v libx264 -preset slow -crf 22 -tune grain -pix_fmt yuv420p -c:a copy -movflags +faststart out/X-tiktok.mp4
   ```
9. Extrair prints **do MP4 final**, conferir (ampliar regiões suspeitas) e mandar ao usuário o vídeo, os prints, a descrição, as hashtags e o comentário fixado.

## 7. Armadilhas já resolvidas (não reintroduza)
- **Determinismo.**
  - Nada de `Math.random` ou relógio: tudo deriva de `t` e de seeds.
  - Shaders de objetos que aparecem depois (holograma, celular) ficam visíveis na carga para pré-compilar.
  - A cabeça que olha para a câmera aplica a pose **antes** de medir a posição da cabeça.
  - O canvas das etiquetas é "aquecido" na carga.
- **Etiqueta fantasma:** canvas 2D acelerado e zerado pode reaparecer com a imagem antiga. Por isso as etiquetas ficam num canvas em memória comum, misturado no passe final do WebGL.
- **`#include` de GLSL** precisa ficar sozinho na linha.
- **Performance:** não usar SpotLight (pesa em todos os pixels) nem MSAA. Use FXAA no passe final, bloom em 1/3 da resolução e quadros em JPEG.
- **Personagem "andando no lugar":** só anda se houver deslocamento real entre as chaves do trajeto, e a cadência do passo segue a velocidade.
- **Close-ups:** vire o personagem para a câmera (yaw = atan2(dx, dz) até a câmera), mire em y≈1,55 para a cabeça ficar abaixo do card, e mantenha a câmera fora do caminho de quem anda.

## 8. Ideias para a Parte 3 (conforme o voto)
- **A venceu (caçar à noite):** caçadores (Yuki em foco) saem com tochas e arcos pela mata, voltam com comida, mas alguém é mordido ou some, e isso vira um novo problema.
- **B venceu (plantar e racionar):** agricultores (Julia e Edward) fazem a roça crescer, a fome gera tensão e briga entre moradores, e o medidor de comida sobe devagar.
- Em ambos os casos, **o sinalizador vermelho** volta: um grupo de estranhos (ou saqueadores) chega à paliçada. Possível dilema seguinte: **A) deixar entrar × B) mandar embora**.
- Mantenha os 160+ moradores no contador e acrescente os novos comentários.

Comece pedindo ao usuário os prints dos comentários e da enquete da Parte 2 (se ele ainda não mandou), e confirme qual opção venceu antes de escrever o roteiro.
