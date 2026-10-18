# Desafio Pokémon

Sorteie seus Pokémon um por vez, monte golpes, itens, natureza, IVs e EVs e enfrente uma sequência de
treinadores sem perder nenhuma batalha. As batalhas rodam no simulador do Pokémon Showdown (`@pkmn/sim`),
e a IA dos rivais calcula o dano real de cada golpe com a calculadora do Smogon (`@smogon/calc`).

**Modos:** desafio do dia (mesmas regras e treinadores para todos; cada um sorteia o próprio time), desafio aleatório, Liga clássica, desafios criados
pelo jogador (compartilhados por link) e teambuilder com import/export no formato do Showdown.
Batalhas individuais e em duplas, com Mega Evolução, Dynamax/Gigantamax e Terastalização.

## Rodando localmente

Requer Node 20.19 ou mais novo.

```bash
npm install
cp .env.example .env   # opcional: edite os valores
npm run dev
```

Outros comandos:

| Comando | O que faz |
|---|---|
| `npm run build` | Verifica os tipos e gera o site em `dist/` |
| `npm run preview` | Serve o build de produção localmente |
| `npm run lint` | Lint do código |

## Variáveis de ambiente

Todas estão documentadas em [`.env.example`](.env.example) e são opcionais.

| Variável | Para que serve |
|---|---|
| `VITE_PUBLIC_URL` | URL pública do site: links de compartilhar, URL canônica, sitemap e prévia dos links |
| `VITE_BASE_PATH` | Subpasta do deploy (padrão `/`) |
| `VITE_AUTHOR_NAME` | Seu nome no rodapé |
| `VITE_PORTFOLIO_URL` | Link do portfólio no rodapé |
| `VITE_PIX_KEY`, `VITE_PIX_NAME`, `VITE_PIX_CITY` | Doação por Pix no rodapé (com nome e cidade, gera QR Code e "Pix copia e cola") |
| `VITE_SPRITES_URL`, `VITE_ITEM_ICONS_URL` | Origem das imagens (só para quem hospedar as imagens por conta própria) |

As variáveis `VITE_*` são gravadas no build: depois de mudar alguma, é preciso gerar o build de novo
(no Railway isso acontece sozinho).

## Deploy no Railway

1. Crie um projeto no Railway e escolha **Deploy from GitHub repo** com este repositório.
2. Em **Variables**, cadastre as variáveis do `.env.example` (no mínimo `VITE_PUBLIC_URL` com o domínio do serviço).
3. Em **Settings → Networking**, gere um domínio (ou conecte o seu) e use esse endereço em `VITE_PUBLIC_URL`.

O Railway detecta o projeto Vite, roda `npm run build` e publica a pasta `dist/` como site estático —
não precisa de Dockerfile nem de comando de start. Ao alterar uma variável, ele faz um novo deploy com o
valor novo.

## Como funciona

- **Sorteio:** cada run tem a sua seed, então cada jogador recebe Pokémon e rivais diferentes. Desafios criados
  podem ligar "mesmo sorteio para todos" para que todos joguem com a mesma sequência.
- **Sem backend:** tudo roda no navegador. Runs, times e desafios criados ficam no `localStorage` do jogador;
  desafios e relatórios de run são compartilhados dentro do próprio link (`#desafio=` e `#run=`).
- **Carregamento:** a página inicial baixa só o necessário (~2,5 MB). Os dados de golpes de cada Pokémon e o
  gerador de times carregam em segundo plano, e o motor de batalha com a IA só ao entrar na primeira batalha.
  Detalhes em [`vite.config.ts`](vite.config.ts).
- **SEO:** meta tags, Open Graph, dados estruturados, `robots.txt`, `sitemap.xml` e `site.webmanifest` são
  gerados no build a partir das variáveis de ambiente.

## Créditos

Pokémon e os nomes relacionados são marcas da Nintendo, Game Freak e The Pokémon Company; este é um fan game
gratuito, sem afiliação. Sprites do [Pokémon Showdown](https://play.pokemonshowdown.com), simulação com
[`@pkmn/sim`](https://github.com/pkmn/ps), dano com [`@smogon/calc`](https://github.com/smogon/damage-calc),
ícones de itens da [PokeAPI](https://github.com/PokeAPI/sprites) e ícones de tipo de
[duiker101/pokemon-type-svg-icons](https://github.com/duiker101/pokemon-type-svg-icons).
