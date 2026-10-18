import type { IconName } from '../components/icons';
import { config, publicUrl } from '../config';
import { hashString, pick, randomSeed, rngFor, shuffle, todayKey, type Rng } from './rng';
import { SLOT_SWAPS, TEAM_REROLLS } from './rules';

// Um desafio define tudo que muda de uma run para outra: formato, mecânicas liberadas,
// quais Pokémon podem ser sorteados, quantos rerolls/trocas e quem são os treinadores.

export type BattleFormat = 'singles' | 'doubles';

/** Como o jogador consegue o time: sorteado, montado no teambuilder ou à escolha dele. */
export type TeamMode = 'draft' | 'own' | 'both';

export const TEAM_MODE_INFO: Record<TeamMode, { label: string; desc: string }> = {
  draft: { label: 'Sorteado', desc: 'Todos sorteiam o time um Pokémon por vez, com rerolls e trocas.' },
  both: { label: 'Sorteado ou montado', desc: 'O jogador escolhe: sortear ou entrar com um time do teambuilder que respeite as regras.' },
  own: { label: 'Montado', desc: 'Só entra quem trouxer um time do teambuilder que respeite as regras.' },
};

export interface Mechanics {
  mega: boolean;
  dynamax: boolean; // inclui Gigantamax
  tera: boolean;
}

export interface TrainerDef {
  name: string;
  sprite: string; // id do sprite no Showdown
  type: string | null; // especialidade; null = time misto
  strength: number; // 1 (fraco) a 5 (campeão)
  team: string[]; // espécies fixas (opcional); vazio = sorteado
}

export interface Challenge {
  v: 1;
  kind: 'classic' | 'daily' | 'random' | 'custom';
  name: string;
  author: string;
  description: string;
  format: BattleFormat;
  teamMode: TeamMode;
  mechanics: Mechanics;
  gens: number[]; // vazio = todas
  tiers: string[]; // ids de TIER_GROUPS; vazio = todos
  rerolls: number;
  swaps: number;
  seed: number; // mesmo seed = mesmo sorteio
  trainers: TrainerDef[];
}

export const GENS: { n: number; label: string }[] = [
  { n: 1, label: 'Kanto' }, { n: 2, label: 'Johto' }, { n: 3, label: 'Hoenn' }, { n: 4, label: 'Sinnoh' },
  { n: 5, label: 'Unova' }, { n: 6, label: 'Kalos' }, { n: 7, label: 'Alola' }, { n: 8, label: 'Galar' }, { n: 9, label: 'Paldea' },
];

export const TIER_GROUPS: { id: string; label: string; tiers: string[]; hint: string }[] = [
  { id: 'Uber', label: 'Uber', tiers: ['Uber', 'AG'], hint: 'lendários e os mais fortes' },
  { id: 'OU', label: 'OU', tiers: ['OU', 'UUBL'], hint: 'o competitivo padrão' },
  { id: 'UU', label: 'UU', tiers: ['UU', 'RUBL'], hint: 'fortes, mas abaixo do OU' },
  { id: 'RU', label: 'RU', tiers: ['RU', 'NUBL'], hint: 'intermediários' },
  { id: 'NU', label: 'NU', tiers: ['NU', 'PUBL'], hint: 'pouco usados' },
  { id: 'PU', label: 'PU', tiers: ['PU', 'ZUBL'], hint: 'fracos' },
  { id: 'ZU', label: 'ZU', tiers: ['ZU', '(PU)', 'NFE', 'LC'], hint: 'os mais fracos' },
];

export const MECHANIC_INFO: Record<keyof Mechanics, { label: string; icon: IconName; desc: string }> = {
  mega: { label: 'Mega Evolução', icon: 'mega', desc: 'Um Pokémon por batalha segurando a Mega Stone certa vira a forma Mega.' },
  dynamax: { label: 'Dynamax / Gigantamax', icon: 'dynamax', desc: 'Um Pokémon por batalha fica gigante por 3 turnos: dobra o HP e usa golpes Max.' },
  tera: { label: 'Terastalização', icon: 'tera', desc: 'Um Pokémon por batalha troca o tipo pelo Tera Type escolhido.' },
};

export const TRAINER_SPRITES = [
  'red', 'blue', 'ethan', 'lyra', 'brendan', 'may', 'lucas', 'dawn', 'hilbert', 'hilda', 'nate', 'rosa', 'calem', 'serena',
  'elio', 'selene', 'victor', 'gloria', 'cynthia', 'lance', 'steven', 'wallace', 'alder', 'iris', 'diantha', 'leon', 'geeta',
  'brock', 'misty', 'ltsurge', 'erika', 'koga', 'sabrina', 'blaine', 'giovanni', 'whitney', 'morty', 'clair', 'roxanne',
  'flannery', 'winona', 'volkner', 'fantina', 'gardenia', 'candice', 'skyla', 'elesa', 'clay', 'drayden', 'roxie', 'valerie',
  'olympia', 'kahili', 'hala', 'nessa', 'raihan', 'bea', 'allister', 'marnie', 'hop', 'bede', 'piers', 'kabu', 'milo', 'opal',
  'iono', 'grusha', 'ryme', 'larry', 'tulip', 'katy', 'brassius', 'kieran', 'carmine', 'lusamine', 'guzma', 'hau', 'gladion',
  'n', 'ghetsis', 'cyrus', 'lysandre', 'rose', 'volo', 'acerola', 'olivia', 'grimsley', 'caitlin', 'shauntal', 'marshal',
  'aaron', 'bertha', 'flint', 'lucian', 'siebold', 'wikstrom', 'malva', 'drasna', 'glacia', 'sidney', 'karen', 'will', 'bruno',
  'agatha-gen3', 'lorelei-gen3', 'acetrainer', 'acetrainerf', 'veteran', 'veteranf', 'youngster', 'lass', 'hiker',
  'blackbelt', 'psychic', 'scientist', 'pokefan', 'beauty', 'ninjaboy', 'swimmer', 'fisherman', 'gentleman',
];

export const trainerSpriteUrl = (id: string) => `${config.spritesUrl}/sprites/trainers/${id}.png`;

const FX = `${config.spritesUrl}/fx`;
const BG6 = `${config.spritesUrl}/sprites/gen6bgs`;
const BG_BY_TYPE: Record<string, string> = {
  Normal: `${FX}/bg-route.png`, Fire: `${FX}/bg-mountain.png`, Water: `${FX}/bg-river.png`, Electric: `${FX}/bg-thunderplains.png`,
  Grass: `${FX}/bg-forest.png`, Ice: `${FX}/bg-icecave.png`, Fighting: `${FX}/bg-mountain.png`, Poison: `${BG6}/bg-dampcave.jpg`,
  Ground: `${FX}/bg-desert.png`, Flying: `${BG6}/bg-skypillar.jpg`, Psychic: `${BG6}/bg-library.jpg`, Bug: `${FX}/bg-meadow.png`,
  Rock: `${BG6}/bg-earthycave.jpg`, Ghost: `${BG6}/bg-darkbeach.jpg`, Dragon: `${BG6}/bg-skypillar.jpg`, Dark: `${FX}/bg-city.png`,
  Steel: `${FX}/bg-city.png`, Fairy: `${FX}/bg-meadow.png`,
};
export const backgroundFor = (t: TrainerDef) => (t.type ? BG_BY_TYPE[t.type] : `${BG6}/bg-leaderwallace.jpg`) ?? `${FX}/bg-route.png`;

// Elite clássica: o treinador que combina com cada tipo
const ELITE_BY_TYPE: Record<string, string> = {
  Normal: 'whitney', Fire: 'flint', Water: 'siebold', Electric: 'elesa', Grass: 'erika', Ice: 'glacia', Fighting: 'bruno',
  Poison: 'koga', Ground: 'bertha', Flying: 'kahili', Psychic: 'caitlin', Bug: 'aaron', Rock: 'olivia', Ghost: 'shauntal',
  Dragon: 'lance', Dark: 'grimsley', Steel: 'wikstrom', Fairy: 'valerie',
};
const CHAMPIONS = ['cynthia', 'leon', 'steven', 'diantha', 'iris', 'geeta', 'alder', 'lance', 'red'];
const capitalize = (s: string) => s.split('-')[0].replace(/^./, c => c.toUpperCase()).replace('Ltsurge', 'Lt. Surge');

export const ALL_TYPES = Object.keys(ELITE_BY_TYPE);

function eliteTrainers(rng: Rng, champion = 'cynthia'): TrainerDef[] {
  const types = shuffle(rng, ALL_TYPES).slice(0, 4);
  return [
    ...types.map((type, i) => ({ name: capitalize(ELITE_BY_TYPE[type]), sprite: ELITE_BY_TYPE[type], type, strength: i + 1, team: [] })),
    { name: capitalize(champion), sprite: champion, type: null, strength: 5, team: [] },
  ];
}

const NO_MECHANICS: Mechanics = { mega: false, dynamax: false, tera: false };

export function classicChallenge(): Challenge {
  const seed = randomSeed();
  return {
    v: 1, kind: 'classic', name: 'Liga Clássica', author: '', description: 'Elite dos Quatro e Campeã, sem transformações.',
    format: 'singles', teamMode: 'both', mechanics: { ...NO_MECHANICS }, gens: [], tiers: [], rerolls: TEAM_REROLLS, swaps: SLOT_SWAPS, seed,
    trainers: eliteTrainers(rngFor(seed, 'trainers')),
  };
}

/** Desafio do dia: tudo vem do seed da data, então é igual para todo mundo. */
export function dailyChallenge(date = todayKey()): Challenge {
  const seed = hashString(`daily:${date}`);
  const rng = rngFor(seed, 'rules');
  const format: BattleFormat = rng() < 0.35 ? 'doubles' : 'singles';
  const options: (keyof Mechanics)[] = shuffle(rng, ['mega', 'dynamax', 'tera'] as (keyof Mechanics)[]);
  const count = rng() < 0.15 ? 0 : rng() < 0.7 ? 1 : 2;
  const mechanics = { ...NO_MECHANICS };
  for (const m of options.slice(0, count)) mechanics[m] = true;
  const restriction = rng();
  const gens = restriction < 0.25 ? shuffle(rng, [1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 4).sort((a, b) => a - b) : [];
  const tiers = restriction > 0.8 ? ['OU', 'UU', 'RU'] : [];
  return {
    v: 1, kind: 'daily', name: `Desafio do dia · ${date.split('-').reverse().join('/')}`, author: '',
    description: 'Mesmo sorteio para todo mundo hoje. Só a primeira tentativa vale.',
    format, teamMode: 'draft', mechanics, gens, tiers, rerolls: TEAM_REROLLS, swaps: SLOT_SWAPS, seed,
    trainers: eliteTrainers(rngFor(seed, 'trainers'), pick(rng, CHAMPIONS)),
  };
}

// Regras pré-definidas que o modo aleatório combina
const RANDOM_PRESETS: { name: string; apply: (c: Challenge, rng: Rng) => void }[] = [
  { name: 'Só uma região', apply: (c, rng) => (c.gens = [pick(rng, [1, 3, 4, 5, 8, 9])]) },
  { name: 'Clássicos (Gen 1–3)', apply: c => (c.gens = [1, 2, 3]) },
  { name: 'Era moderna (Gen 6–9)', apply: c => (c.gens = [6, 7, 8, 9]) },
  { name: 'Sem lendários', apply: c => (c.tiers = ['OU', 'UU', 'RU', 'NU', 'PU', 'ZU']) },
  { name: 'Azarões (NU para baixo)', apply: c => (c.tiers = ['NU', 'PU', 'ZU']) },
  { name: 'Só os fortes (Uber/OU)', apply: c => (c.tiers = ['Uber', 'OU']) },
  { name: 'Megas liberadas', apply: c => (c.mechanics.mega = true) },
  { name: 'Dynamax liberado', apply: c => (c.mechanics.dynamax = true) },
  { name: 'Tera liberado', apply: c => (c.mechanics.tera = true) },
  { name: 'Tudo liberado', apply: c => (c.mechanics = { mega: true, dynamax: true, tera: true }) },
  { name: 'Batalha em duplas', apply: c => (c.format = 'doubles') },
  { name: 'Sem rerolls', apply: c => ((c.rerolls = 0), (c.swaps = 3)) },
  { name: 'Rerolls em dobro', apply: c => ((c.rerolls = 8), (c.swaps = 1)) },
];

export function randomChallenge(): Challenge {
  const seed = randomSeed();
  const rng = rngFor(seed, 'rules');
  const c: Challenge = {
    v: 1, kind: 'random', name: 'Desafio aleatório', author: '', description: '',
    format: 'singles', teamMode: 'both', mechanics: { ...NO_MECHANICS }, gens: [], tiers: [], rerolls: TEAM_REROLLS, swaps: SLOT_SWAPS, seed,
    trainers: eliteTrainers(rngFor(seed, 'trainers'), pick(rng, CHAMPIONS)),
  };
  const presets = shuffle(rng, RANDOM_PRESETS).slice(0, 2 + Math.floor(rng() * 2));
  // não combina duas restrições de geração ou de tier
  const used = new Set<string>();
  const applied: string[] = [];
  for (const p of presets) {
    const group = p.name.includes('Gen') || p.name.includes('região') ? 'gen' : p.name.includes('lendários') || p.name.includes('NU') || p.name.includes('fortes') ? 'tier' : p.name;
    if (used.has(group)) continue;
    used.add(group);
    p.apply(c, rng);
    applied.push(p.name);
  }
  c.description = applied.join(' · ');
  return c;
}

export function blankCustomChallenge(): Challenge {
  return {
    v: 1, kind: 'custom', name: 'Meu desafio', author: '', description: '',
    format: 'singles', teamMode: 'both', mechanics: { ...NO_MECHANICS }, gens: [], tiers: [], rerolls: TEAM_REROLLS, swaps: SLOT_SWAPS,
    seed: randomSeed(),
    trainers: [
      { name: 'Rival', sprite: 'blue', type: null, strength: 2, team: [] },
      { name: 'Campeão', sprite: 'red', type: null, strength: 5, team: [] },
    ],
  };
}

export interface RuleLine {
  icon: IconName;
  text: string;
}

/** Regras em texto, mostradas para quem joga e para quem monta o desafio. */
export function describeRules(c: Challenge): RuleLine[] {
  const mech = (Object.keys(MECHANIC_INFO) as (keyof Mechanics)[]).filter(m => c.mechanics[m]);
  return [
    { icon: 'swords', text: c.format === 'doubles' ? 'Batalha em duplas (2 contra 2)' : 'Batalha individual (1 contra 1)' },
    { icon: 'users', text: `Time: ${TEAM_MODE_INFO[c.teamMode ?? 'draft'].label.toLowerCase()}` },
    { icon: 'sparkles', text: mech.length ? `Liberado: ${mech.map(m => MECHANIC_INFO[m].label).join(', ')}` : 'Sem transformações' },
    { icon: 'map', text: c.gens.length ? `Só Pokémon de: ${c.gens.map(g => GENS[g - 1].label).join(', ')}` : 'Pokémon de todas as gerações' },
    { icon: 'layers', text: c.tiers.length ? `Só tiers: ${c.tiers.join(', ')}` : 'Todos os tiers' },
    ...(c.teamMode !== 'own' ? [{ icon: 'reroll' as IconName, text: `${c.rerolls} rerolls · ${c.swaps} ${c.swaps === 1 ? 'troca' : 'trocas'}` }] : []),
    { icon: 'trophy', text: `${c.trainers.length} treinadores para vencer em sequência` },
  ];
}

// ---------- compartilhar por link ----------

export function encodeChallenge(c: Challenge): string {
  const json = JSON.stringify({ ...c, kind: 'custom' });
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  bytes.forEach(b => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeChallenge(code: string): Challenge | null {
  try {
    const clean = code.trim().replace(/^.*[#&?]desafio=/, '');
    const b64 = clean.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    const json = new TextDecoder().decode(Uint8Array.from(bin, ch => ch.charCodeAt(0)));
    const c = JSON.parse(json) as Challenge;
    if (c.v !== 1 || !Array.isArray(c.trainers) || c.trainers.length === 0) return null;
    return sanitizeChallenge(c);
  } catch {
    return null;
  }
}

/** Garante valores válidos num desafio vindo de um link (dado de terceiros). */
export function sanitizeChallenge(c: Challenge): Challenge {
  const str = (s: unknown, max: number) => (typeof s === 'string' ? s.slice(0, max) : '');
  const int = (n: unknown, min: number, max: number, def: number) =>
    typeof n === 'number' && Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : def;
  return {
    v: 1,
    kind: 'custom',
    name: str(c.name, 60) || 'Desafio',
    author: str(c.author, 40),
    description: str(c.description, 300),
    format: c.format === 'doubles' ? 'doubles' : 'singles',
    teamMode: c.teamMode === 'own' || c.teamMode === 'both' ? c.teamMode : 'draft',
    mechanics: { mega: !!c.mechanics?.mega, dynamax: !!c.mechanics?.dynamax, tera: !!c.mechanics?.tera },
    gens: (Array.isArray(c.gens) ? c.gens : []).filter(g => GENS.some(x => x.n === g)),
    tiers: (Array.isArray(c.tiers) ? c.tiers : []).filter(t => TIER_GROUPS.some(x => x.id === t)),
    rerolls: int(c.rerolls, 0, 20, TEAM_REROLLS),
    swaps: int(c.swaps, 0, 10, SLOT_SWAPS),
    seed: int(c.seed, 0, 2 ** 31, randomSeed()),
    trainers: c.trainers.slice(0, 10).map(t => ({
      name: str(t.name, 24) || 'Treinador',
      sprite: TRAINER_SPRITES.includes(t.sprite) ? t.sprite : 'acetrainer',
      type: typeof t.type === 'string' && ALL_TYPES.includes(t.type) ? t.type : null,
      strength: int(t.strength, 1, 5, 3),
      team: (Array.isArray(t.team) ? t.team : []).filter(s => typeof s === 'string').slice(0, 6).map(s => s.slice(0, 40)),
    })),
  };
}

export function shareUrl(c: Challenge) {
  return `${publicUrl()}/#desafio=${encodeChallenge(c)}`;
}
