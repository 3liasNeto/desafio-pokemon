import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

const SIM_DATA = fileURLToPath(new URL('./node_modules/@pkmn/sim/build/esm/data/', import.meta.url))

/**
 * O @pkmn/sim importa de forma fixa os dados de todas as gerações antigas (Gen 1–8, BDSP, Legends),
 * mas o jogo só usa a Gen 9 (a base do simulador). Os dados dessas gerações só são lidos se alguém
 * pedir `Dex.forGen(1..8)`, o que nunca acontece aqui. Este plugin troca esses arquivos por módulos
 * vazios no bundle — o pacote continua instalado e intacto, só deixa de carregar o que não é usado.
 */
function stripLegacyGens(): Plugin {
  const legacy = /\/@pkmn\/sim\/build\/esm\/data\/mods\/(gen[1-8](?:bdsp|legends)?)\/(index|learnsets|legality)\.mjs$/
  const PREFIX = '\0pkmn-legacy:'
  return {
    name: 'pkmn-strip-legacy-gens',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || !importer.includes('@pkmn/sim') || !source.includes('/mods/gen')) return null
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      const m = resolved?.id.match(legacy)
      return m ? `${PREFIX}${m[1]}:${m[2]}` : null
    },
    load(id) {
      if (!id.startsWith(PREFIX)) return null
      const [mod, file] = id.slice(PREFIX.length).split(':')
      const gen = Number(mod.match(/\d/)![0])
      if (file === 'learnsets') return 'export const Learnsets = {};'
      if (file === 'legality') return 'export const Legality = {};'
      // se algum dia alguém pedir essa geração, ela herda da Gen 9 em vez de quebrar
      return `export const Scripts = { gen: ${gen}, inherit: 'gen9' };`
    },
  }
}

/**
 * As learnsets da Gen 9 (quais golpes cada Pokémon aprende, ~5 MB) só são usadas no sorteio e na
 * montagem do time. O simulador as importa de forma fixa; aqui ele recebe um objeto vazio, e o jogo
 * preenche esse mesmo objeto depois da primeira tela com `loadGameData()` (src/game/data.ts).
 * Só vale no build: em dev o Vite pré-empacota o simulador inteiro e as learnsets já vêm junto.
 */
function deferLearnsets(): Plugin {
  const STUB = '\0pkmn-learnsets-stub'
  const LEGALITY_STUB = '\0pkmn-legality-stub'
  return {
    name: 'pkmn-defer-learnsets',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === 'virtual:pkmn-learnsets-stub') return STUB
      if (source === 'virtual:pkmn-learnsets-real') return `${SIM_DATA}learnsets.mjs`
      if (source === 'virtual:pkmn-legality-real') return `${SIM_DATA}legality.mjs`
      if (!importer?.endsWith('/@pkmn/sim/build/esm/sim/dex.mjs')) return null
      if (source === '../data/learnsets.mjs') return STUB
      if (source === '../data/legality.mjs') return LEGALITY_STUB
      return null
    },
    load(id) {
      if (id === STUB) return 'export const Learnsets = {};'
      if (id === LEGALITY_STUB) return 'export const Legality = {};'
      return null
    },
  }
}

const SITE = {
  name: 'Desafio Pokémon',
  title: 'Desafio Pokémon — Monte seu time e vença a Liga',
  description:
    'Sorteie Pokémon, monte seu time e enfrente a Liga sem perder nenhuma batalha. Desafio do dia, duplas, Mega, Dynamax, Tera, teambuilder e desafios criados por você.',
  themeColor: '#0d1528',
  ogImage: 'og-image.jpg',
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/**
 * SEO: meta tags (canônica, Open Graph, Twitter), dados estruturados e os arquivos robots.txt,
 * sitemap.xml e site.webmanifest, montados a partir das variáveis do .env no momento do build.
 */
function seo(env: Record<string, string>, base: string): Plugin {
  const site = (env.VITE_PUBLIC_URL || '').trim().replace(/\/+$/, '')
  const abs = (path: string) => (site ? `${site}/${path}` : `${base}${path}`)
  return {
    name: 'site-seo',
    transformIndexHtml() {
      const author = (env.VITE_AUTHOR_NAME || '').trim()
      const portfolio = (env.VITE_PORTFOLIO_URL || '').trim()
      const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'VideoGame',
        name: SITE.name,
        description: SITE.description,
        ...(site ? { url: `${site}/` } : {}),
        image: abs(SITE.ogImage),
        inLanguage: 'pt-BR',
        genre: ['Estratégia', 'Batalha por turnos'],
        gamePlatform: 'Navegador',
        applicationCategory: 'GameApplication',
        operatingSystem: 'Web',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'BRL' },
        ...(author ? { author: { '@type': 'Person', name: author, ...(portfolio ? { url: portfolio } : {}) } } : {}),
      }
      const meta = (attr: 'name' | 'property', key: string, content: string) => ({ tag: 'meta', attrs: { [attr]: key, content }, injectTo: 'head' as const })
      return [
        { tag: 'meta', attrs: { name: 'robots', content: 'index, follow, max-image-preview:large' }, injectTo: 'head' },
        ...(author ? [meta('name', 'author', author)] : []),
        ...(site ? [{ tag: 'link', attrs: { rel: 'canonical', href: `${site}/` }, injectTo: 'head' as const }] : []),
        { tag: 'link', attrs: { rel: 'manifest', href: `${base}site.webmanifest` }, injectTo: 'head' },
        meta('property', 'og:type', 'website'),
        meta('property', 'og:site_name', SITE.name),
        meta('property', 'og:locale', 'pt_BR'),
        meta('property', 'og:title', SITE.title),
        meta('property', 'og:description', SITE.description),
        ...(site ? [meta('property', 'og:url', `${site}/`)] : []),
        meta('property', 'og:image', abs(SITE.ogImage)),
        meta('property', 'og:image:width', '1200'),
        meta('property', 'og:image:height', '630'),
        meta('property', 'og:image:alt', 'Desafio Pokémon: sorteie seu time e vença a Liga'),
        meta('name', 'twitter:card', 'summary_large_image'),
        meta('name', 'twitter:title', SITE.title),
        meta('name', 'twitter:description', SITE.description),
        meta('name', 'twitter:image', abs(SITE.ogImage)),
        { tag: 'script', attrs: { type: 'application/ld+json' }, children: JSON.stringify(jsonLd), injectTo: 'head' },
      ]
    },
    generateBundle() {
      const today = new Date().toISOString().slice(0, 10)
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nAllow: /\n${site ? `\nSitemap: ${site}/sitemap.xml\n` : ''}`,
      })
      if (site) {
        this.emitFile({
          type: 'asset',
          fileName: 'sitemap.xml',
          source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${esc(site)}/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>\n</urlset>\n`,
        })
      }
      this.emitFile({
        type: 'asset',
        fileName: 'site.webmanifest',
        source: JSON.stringify(
          {
            name: SITE.name,
            short_name: 'Desafio Pokémon',
            description: SITE.description,
            lang: 'pt-BR',
            start_url: base,
            scope: base,
            display: 'standalone',
            background_color: '#0a0e1a',
            theme_color: SITE.themeColor,
            icons: [
              { src: `${base}apple-touch-icon.png`, sizes: '180x180', type: 'image/png' },
              { src: `${base}favicon.svg`, sizes: 'any', type: 'image/svg+xml' },
            ],
          },
          null,
          2,
        ),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  // subpasta do deploy (ex.: /desafio/); padrão: raiz do domínio
  const base = `/${(env.VITE_BASE_PATH || '/').replace(/^\/+|\/+$/g, '')}/`.replace(/\/+/g, '/')
  return {
    base,
    plugins: [react(), stripLegacyGens(), deferLearnsets(), seo(env, base)],
    build: {
      // dados do jogo são grandes por natureza; o aviso padrão de 500 kB não ajuda aqui
      chunkSizeWarningLimit: 4000,
      rolldownOptions: {
        output: {
          // um arquivo por pacote: baixam em paralelo e continuam em cache quando só o jogo muda
          codeSplitting: {
            groups: [
              { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 30, includeDependenciesRecursively: false },
              { name: 'calc', test: /node_modules[\\/]@smogon[\\/]calc[\\/]/, priority: 20, includeDependenciesRecursively: false },
              { name: 'randoms', test: /node_modules[\\/]@pkmn[\\/]randoms[\\/]/, priority: 20, includeDependenciesRecursively: false },
              // as learnsets ficam fora: carregam sob demanda (deferLearnsets)
              { name: 'sim', test: id => /node_modules[\\/]@pkmn[\\/]/.test(id) && !/data[\\/](learnsets|legality)\.mjs$/.test(id), priority: 10 },
              { name: 'learnsets', test: /@pkmn[\\/]sim[\\/]build[\\/]esm[\\/]data[\\/](learnsets|legality)\.mjs$/, priority: 15, includeDependenciesRecursively: false },
            ],
          },
        },
      },
    },
  }
})
