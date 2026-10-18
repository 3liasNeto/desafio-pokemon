// Configuração do site, vinda das variáveis de ambiente VITE_* (veja .env.example).
// O Vite grava esses valores no build: ao mudar uma variável no servidor (ex.: Railway), o site é
// reconstruído com o valor novo. Tudo tem um padrão, então o jogo funciona mesmo sem .env.

// em scripts fora do Vite (ex.: testes com tsx) import.meta.env não existe
const env = ((import.meta.env as unknown) ?? {}) as Record<string, string | undefined>;
const read = (key: string) => (env[key] ?? '').trim();
const noTrailingSlash = (url: string) => url.replace(/\/+$/, '');

/** Caminho onde o app é servido ("/" ou "/subpasta/"). */
export const BASE_PATH = env.BASE_URL || '/';

/** URL pública do site, usada nos links de compartilhar desafio e run. */
export function publicUrl(): string {
  const configured = read('VITE_PUBLIC_URL');
  if (configured) return noTrailingSlash(configured);
  if (typeof location === 'undefined') return '';
  return noTrailingSlash(`${location.origin}${BASE_PATH}`);
}

export const config = {
  /** Base dos sprites de Pokémon, treinadores e cenários (padrão: servidor do Pokémon Showdown). */
  spritesUrl: noTrailingSlash(read('VITE_SPRITES_URL') || 'https://play.pokemonshowdown.com'),
  /** Pasta com os ícones de itens em PNG (padrão: PokeAPI no GitHub). */
  itemIconsUrl: noTrailingSlash(read('VITE_ITEM_ICONS_URL') || 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items'),
  /** Rodapé: quem fez o site e onde encontrar. */
  authorName: read('VITE_AUTHOR_NAME'),
  portfolioUrl: read('VITE_PORTFOLIO_URL'),
  /** Rodapé: doação por Pix. Nome e cidade permitem gerar o código "Pix copia e cola". */
  pixKey: read('VITE_PIX_KEY'),
  pixName: read('VITE_PIX_NAME'),
  pixCity: read('VITE_PIX_CITY'),
};

/** Caminho de um arquivo da pasta public/, respeitando a subpasta do deploy. */
export const publicAsset = (file: string) => `${BASE_PATH}${file.replace(/^\/+/, '')}`;
