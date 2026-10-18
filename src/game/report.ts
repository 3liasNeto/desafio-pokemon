import { Teams } from '@pkmn/sim';
import { publicUrl } from '../config';
import type { PokemonSet } from '@pkmn/sim';
import type { BattleStats } from './battle';
import { describeRules, GENS, sanitizeChallenge, type Challenge } from './challenge';
import { buildToSet, dex, TYPE_PT } from './data';
import type { Build } from './rules';

// Relatório de uma run: o time do jogador, cada treinador enfrentado com o time dele e o que aconteceu.
// Vira um link (#run=...) que abre o relatório, ou um texto no estilo Showdown para colar em qualquer lugar.

export interface BattleRecord {
  trainer: { name: string; sprite: string; type: string | null; strength: number };
  foe: { species: string; shiny: boolean }[];
  won: boolean;
  turns: number;
  stats: BattleStats;
}

export interface RunReport {
  v: 1;
  challenge: Challenge;
  date: string; // AAAA-MM-DD
  wins: number;
  lost: boolean;
  practice: boolean;
  ownTeam?: string;
  team: string; // time do jogador no formato compacto do Showdown (Teams.pack)
  history: BattleRecord[];
}

export function makeReport(r: {
  challenge: Challenge; builds: Build[]; wins: number; lost: boolean; practice: boolean; ownTeam?: string; history?: BattleRecord[];
}, date: string): RunReport {
  return {
    v: 1,
    challenge: r.challenge,
    date,
    wins: r.wins,
    lost: r.lost,
    practice: r.practice,
    ownTeam: r.ownTeam,
    team: Teams.pack(r.builds.map(buildToSet)),
    history: r.history ?? [],
  };
}

/** Time do relatório com os nomes oficiais (o formato compacto guarda só ids de item e habilidade). */
export function reportTeam(report: RunReport): PokemonSet[] {
  return ((Teams.unpack(report.team) ?? []) as PokemonSet[]).map(s => ({
    ...s,
    species: dex.species.get(s.species).name || s.species,
    item: s.item ? dex.items.get(s.item).name || s.item : '',
    ability: s.ability ? dex.abilities.get(s.ability).name || s.ability : '',
  }));
}

/** Total de KOs de cada Pokémon do jogador na run inteira. */
export function totalKOs(report: RunReport): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of report.history) for (const [name, n] of Object.entries(b.stats.koBy)) out[name] = (out[name] ?? 0) + n;
  return out;
}

/** Placar em quadradinhos (✅ venceu, ❌ perdeu, ⬜ não chegou), como nos jogos diários. */
export function resultStrip(report: RunReport) {
  return report.challenge.trainers
    .map((_, i) => (i < report.wins ? '✅' : i === report.wins && report.lost ? '❌' : '⬜'))
    .join('');
}

export function scoreText(report: RunReport) {
  const total = report.challenge.trainers.length;
  return `${report.wins}x${report.lost ? 1 : 0}${!report.lost && report.wins >= total ? ' 👑' : ''}`;
}

const nameOf = (s: PokemonSet) => s.name && s.name !== s.species ? `${s.name} (${s.species})` : s.species;

/** Time no formato de importação do Showdown. */
export function teamShowdownText(report: RunReport) {
  const sets = reportTeam(report).map(s => ({ ...s, moves: s.moves.map(m => dex.moves.get(m).name) }));
  return Teams.export(sets).trim();
}

/** Texto completo da run, no estilo dos replays/pastes do Showdown. */
export function reportText(report: RunReport, url?: string) {
  const c = report.challenge;
  const date = report.date.split('-').reverse().join('/');
  const team = reportTeam(report);
  const kos = totalKOs(report);
  const lines: string[] = [];
  lines.push(`=== Desafio Pokémon · ${c.name} ===`);
  lines.push(`${resultStrip(report)}  ${scoreText(report)}${report.practice ? ' (treino)' : ''}`);
  lines.push(`Data: ${date}${report.ownTeam ? ` · Time: ${report.ownTeam}` : ''}`);
  lines.push(`Regras: ${describeRules(c).map(r => r.text).join(' · ')}`);
  lines.push('');
  lines.push('--- Meu time ---');
  lines.push(team.map(s => `${nameOf(s)}${s.item ? ` @ ${s.item}` : ''}${kos[s.name] ? ` — ${kos[s.name]} KO${kos[s.name] > 1 ? 's' : ''}` : ''}`).join('\n'));
  lines.push('');
  lines.push('--- Batalhas ---');
  report.history.forEach((b, i) => {
    const type = b.trainer.type ? ` (${TYPE_PT[b.trainer.type]})` : '';
    lines.push(`${i + 1}. ${b.won ? '✅' : '❌'} vs ${b.trainer.name}${type} — ${b.turns} turnos`);
    lines.push(`   Time rival: ${b.foe.map(f => f.species + (f.shiny ? ' ✨' : '')).join(', ')}`);
    const ko = Object.entries(b.stats.koBy).map(([n, k]) => `${n} ${k}`).join(', ');
    if (ko) lines.push(`   KOs: ${ko}`);
    if (b.stats.myFainted.length) lines.push(`   Caíram: ${b.stats.myFainted.map(f => f.name + (f.by ? ` (por ${f.by})` : '')).join(', ')}`);
    if (b.stats.gimmicks.length) lines.push(`   Transformações: ${b.stats.gimmicks.join(', ')}`);
  });
  const left = c.trainers.slice(report.history.length);
  if (left.length && !report.lost) lines.push(`Faltam: ${left.map(t => t.name).join(', ')}`);
  lines.push('');
  lines.push('--- Time (importar no Showdown) ---');
  lines.push(teamShowdownText(report));
  if (url) lines.push('', `Ver a run: ${url}`);
  return lines.join('\n');
}

/** Texto curto para redes/chat (estilo jogos diários). */
export function shortText(report: RunReport, url?: string) {
  const c = report.challenge;
  const gens = c.gens.length ? ` · ${c.gens.map(g => GENS[g - 1].label).join('/')}` : '';
  return [`Desafio Pokémon · ${c.name}${gens}`, `${resultStrip(report)} ${scoreText(report)}`, url ?? ''].filter(Boolean).join('\n');
}

// ---------- link ----------

const toB64 = (bytes: Uint8Array) => {
  let bin = '';
  bytes.forEach(b => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64 = (s: string) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64 + '==='.slice((b64.length + 3) % 4)), ch => ch.charCodeAt(0));
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** Codifica o relatório para o link. Comprime quando o navegador permite (links ~3x menores). */
export async function encodeReport(report: RunReport): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(report));
  if (typeof CompressionStream !== 'undefined') {
    try {
      return `z${toB64(await pipe(bytes, new CompressionStream('deflate-raw')))}`;
    } catch {
      /* cai no formato sem compressão */
    }
  }
  return `j${toB64(bytes)}`;
}

export async function decodeReport(code: string): Promise<RunReport | null> {
  try {
    const clean = code.trim().replace(/^.*[#&?]run=/, '');
    const raw = fromB64(clean.slice(1));
    const bytes = clean[0] === 'z' ? await pipe(raw, new DecompressionStream('deflate-raw')) : raw;
    const r = JSON.parse(new TextDecoder().decode(bytes)) as RunReport;
    if (r.v !== 1 || typeof r.team !== 'string') return null;
    return sanitizeReport(r);
  } catch {
    return null;
  }
}

/** Valores seguros num relatório vindo de um link (dado de terceiros). */
function sanitizeReport(r: RunReport): RunReport {
  const str = (s: unknown, max: number) => (typeof s === 'string' ? s.slice(0, max) : '');
  const int = (n: unknown, max: number) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(max, Math.round(n))) : 0);
  const names = (list: unknown) =>
    (Array.isArray(list) ? list : []).slice(0, 12).map(f => ({ name: str(f?.name, 30), by: f?.by ? str(f.by, 30) : undefined }));
  const challenge = sanitizeChallenge(r.challenge);
  return {
    v: 1,
    challenge: { ...challenge, kind: r.challenge?.kind === 'daily' ? 'daily' : challenge.kind },
    date: /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : '',
    wins: int(r.wins, 20),
    lost: !!r.lost,
    practice: !!r.practice,
    ownTeam: r.ownTeam ? str(r.ownTeam, 40) : undefined,
    team: str(r.team, 4000),
    history: (Array.isArray(r.history) ? r.history : []).slice(0, 10).map(b => ({
      trainer: {
        name: str(b?.trainer?.name, 24),
        sprite: str(b?.trainer?.sprite, 30).replace(/[^a-z0-9-]/g, ''),
        type: typeof b?.trainer?.type === 'string' ? str(b.trainer.type, 12) : null,
        strength: int(b?.trainer?.strength, 5),
      },
      foe: (Array.isArray(b?.foe) ? b.foe : []).slice(0, 6).map(f => ({ species: str(f?.species, 40), shiny: !!f?.shiny })),
      won: !!b?.won,
      turns: int(b?.turns, 999),
      stats: {
        koBy: Object.fromEntries(Object.entries(b?.stats?.koBy ?? {}).slice(0, 12).map(([k, v]) => [str(k, 30), int(v, 6)])),
        myFainted: names(b?.stats?.myFainted),
        foeFainted: names(b?.stats?.foeFainted),
        gimmicks: (Array.isArray(b?.stats?.gimmicks) ? b.stats.gimmicks : []).slice(0, 6).map((g: unknown) => str(g, 40)),
      },
    })),
  };
}

export async function reportUrl(report: RunReport) {
  return `${publicUrl()}/#run=${await encodeReport(report)}`;
}
