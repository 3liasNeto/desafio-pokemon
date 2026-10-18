import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Builder } from './components/Builder';
import { Brand } from './components/Brand';
import { ChallengeSetup } from './components/ChallengeSetup';
import { Stepper } from './components/common';
import { Draft } from './components/Draft';
import { Home, type DailyResult } from './components/Home';
import { Hub, trainerTitle } from './components/Hub';
import { TeamEditor, TeamList } from './components/Teams';
import {
  blankCustomChallenge, classicChallenge, dailyChallenge, decodeChallenge, randomChallenge, type Challenge,
} from './game/challenge';
import { buildToSet, defaultBuild, gameDataReady, loadGameData, opponentTeam, randomSpecies, speciesPool } from './game/data';
import { psSeed, randomSeed, rngFor, todayKey } from './game/rng';
import type { SavedTeam } from './game/teams';
import { decodeReport, makeReport, type BattleRecord, type RunReport } from './game/report';
import { RunReportView } from './components/RunReport';
import { Footer } from './components/Footer';
import { TEAM_SIZE, type Build } from './game/rules';

// telas pesadas carregam sob demanda: a batalha traz o simulador de batalha, a IA e a calculadora de dano
const BattleScreen = lazy(() => import('./components/BattleScreen').then(m => ({ default: m.BattleScreen })));
const ChallengeEditor = lazy(() => import('./components/ChallengeEditor').then(m => ({ default: m.ChallengeEditor })));
const preloadBattle = () => void import('./components/BattleScreen');

function Loading({ text = 'Carregando dados do jogo...' }: { text?: string }) {
  return (
    <div className="waiting loading-screen">
      <span className="pokeball-mini" /> {text}
    </div>
  );
}

type Phase = 'draft' | 'build' | 'hub' | 'battle';

interface Run {
  challenge: Challenge;
  phase: Phase;
  team: string[]; // espécies que já estão no time
  candidate: string | null; // Pokémon sorteado esperando decisão
  reserve: string[]; // rejeitados com reroll; podem entrar no time com uma troca
  builds: Build[];
  rerolls: number;
  swaps: number;
  wins: number;
  lost: boolean;
  draws: number; // quantos sorteios já foram feitos (define o próximo, de forma determinística)
  battleSeed: number;
  started: boolean; // já passou da montagem inicial
  practice: boolean; // desafio diário já jogado hoje: não conta
  dailyDate?: string;
  ownTeam?: string; // nome do time do teambuilder usado (sem sorteio)
  seed?: number; // sorteio desta run (Pokémon, sets e rivais); runs antigas usam a seed do desafio
  history?: BattleRecord[]; // cada batalha jogada: treinador, time dele e o que aconteceu
}

type Screen =
  | { name: 'home' }
  | { name: 'setup'; challenge: Challenge; note?: string }
  | { name: 'editor'; challenge: Challenge }
  | { name: 'teams'; back?: Screen }
  | { name: 'team-edit'; team: SavedTeam; back?: Screen }
  | { name: 'report'; report: RunReport; back?: Screen }
  | { name: 'run' };

// chance da IA jogar um ataque aleatório, pela força do treinador (1–5)
const AI_RANDOMNESS = [0.15, 0.08, 0.04, 0.01, 0];
const SAVE_KEY = 'pokemon-desafio-run-v3';
const MINE_KEY = 'pokemon-desafio-meus';
const TEAMS_KEY = 'pokemon-desafio-times';
const dailyKey = (date: string) => `pokemon-desafio-diario-${date}`;

function storageGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function storageSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sem storage, segue sem salvar */
  }
}

function loadRun(): Run | null {
  const run = storageGet<Run>(SAVE_KEY);
  if (!run || !run.challenge || !Array.isArray(run.reserve)) return null;
  // recarregar no meio da batalha volta para o hub (a batalha recomeça)
  return run.phase === 'battle' ? { ...run, phase: 'hub' } : run;
}

/** Seed do sorteio da run: própria de cada jogador, a não ser que o desafio peça o mesmo sorteio para todos. */
const runSeed = (r: Pick<Run, 'seed' | 'challenge'>) => r.seed ?? r.challenge.seed;

function drawNext(c: Challenge, seed: number, draws: number, exclude: string[]) {
  return randomSpecies(rngFor(seed, 'draw', draws), speciesPool(c), { exclude });
}

function newRun(challenge: Challenge, practice = false): Run {
  const seed = challenge.sameDraw ? challenge.seed : randomSeed();
  return {
    challenge,
    seed,
    phase: 'draft',
    team: [],
    candidate: drawNext(challenge, seed, 0, []),
    reserve: [],
    builds: [],
    rerolls: challenge.rerolls,
    swaps: challenge.swaps,
    wins: 0,
    lost: false,
    draws: 1,
    battleSeed: 0,
    started: false,
    practice,
    dailyDate: challenge.kind === 'daily' ? todayKey() : undefined,
  };
}

/** Entra no desafio com um time do teambuilder: pula o sorteio e vai direto para as batalhas. */
function runFromTeam(challenge: Challenge, team: SavedTeam): Run {
  const builds = team.builds.map(b => ({ ...b, moves: [...b.moves], ivs: { ...b.ivs }, evs: { ...b.evs } }));
  return {
    ...newRun(challenge),
    phase: 'hub',
    team: builds.map(b => b.species),
    candidate: null,
    builds,
    rerolls: 0,
    swaps: 0,
    started: true,
    ownTeam: team.name,
  };
}

const taken = (r: Run) => [...r.team, ...r.reserve, ...(r.candidate ? [r.candidate] : [])];
const isFinished = (r: Run) => r.lost || r.wins >= r.challenge.trainers.length;

export default function App() {
  const [run, setRun] = useState<Run | null>(null);
  const [saved, setSaved] = useState(loadRun);
  const [mine, setMine] = useState<Challenge[]>(() => storageGet<Challenge[]>(MINE_KEY) ?? []);
  const [teams, setTeams] = useState<SavedTeam[]>(() => storageGet<SavedTeam[]>(TEAMS_KEY) ?? []);
  const [screen, setScreen] = useState<Screen>(() => {
    const fromLink = location.hash.includes('desafio=') ? decodeChallenge(location.hash) : null;
    return fromLink ? { name: 'setup', challenge: fromLink, note: 'Desafio recebido por link.' } : { name: 'home' };
  });
  const [dailyResult, setDailyResult] = useState(() => storageGet<DailyResult>(dailyKey(todayKey())));

  const [dataReady, setDataReady] = useState(gameDataReady);

  useEffect(() => {
    performance.mark('app:ready');
    // a home não precisa dos dados pesados: carrega em segundo plano depois que ela aparece
    const t = setTimeout(() => {
      void loadGameData().then(() => setDataReady(true));
    }, 50);
    return () => clearTimeout(t);
  }, []);

  // quem chega no hub provavelmente vai batalhar: já busca o código da batalha
  useEffect(() => {
    if (run?.phase === 'hub') preloadBattle();
  }, [run?.phase]);

  useEffect(() => {
    if (run) storageSet(SAVE_KEY, run);
  }, [run]);

  // resultado do diário: só a primeira tentativa vale
  useEffect(() => {
    if (!run || run.challenge.kind !== 'daily' || run.practice || !run.dailyDate || !isFinished(run)) return;
    const result = { wins: run.wins, lost: run.lost, total: run.challenge.trainers.length };
    storageSet(dailyKey(run.dailyDate), result);
    if (run.dailyDate === todayKey()) setDailyResult(result);
  }, [run]);

  // relatório da run atual (para compartilhar)
  const report = useMemo(
    () => (run ? makeReport(run, run.dailyDate ?? todayKey()) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [run?.history, run?.builds, run?.wins, run?.lost, run?.challenge],
  );

  // link de relatório (#run=...): abre a run compartilhada por alguém
  useEffect(() => {
    if (!location.hash.includes('run=')) return;
    void decodeReport(location.hash).then(r => r && setScreen({ name: 'report', report: r }));
  }, []);

  // título da aba por tela (aparece no histórico, nos favoritos e ao compartilhar)
  useEffect(() => {
    const titles: Record<Screen['name'], string> = {
      home: 'Desafio Pokémon — Monte seu time e vença a Liga',
      setup: screen.name === 'setup' ? `${screen.challenge.name} · Desafio Pokémon` : '',
      editor: 'Criar desafio · Desafio Pokémon',
      teams: 'Teambuilder · Desafio Pokémon',
      'team-edit': 'Teambuilder · Desafio Pokémon',
      report: screen.name === 'report' ? `Run: ${screen.report.challenge.name} · Desafio Pokémon` : '',
      run: run ? `${run.challenge.name} (${run.wins}x${run.lost ? 1 : 0}) · Desafio Pokémon` : 'Desafio Pokémon',
    };
    document.title = titles[screen.name] || 'Desafio Pokémon';
  }, [screen, run]);

  const update = (fn: (r: Run) => Partial<Run>) => setRun(r => (r ? { ...r, ...fn(r) } : r));
  const c = run?.challenge;

  const myTeam = useMemo(() => run?.builds.map(buildToSet) ?? [], [run?.builds]);
  const foeTeam = useMemo(() => {
    if (!run || !c || !c.trainers[run.wins]) return [];
    const t = c.trainers[run.wins];
    return opponentTeam(rngFor(runSeed(run), 'foe', run.wins), {
      type: t.type, strength: t.strength, team: t.team, pool: speciesPool(c), mechanics: c.mechanics,
    });
    // novo time adversário a cada batalha iniciada
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.battleSeed]);
  const battleSeed = useMemo(() => (run && c ? psSeed(rngFor(runSeed(run), 'battle', run.wins, run.battleSeed)) : ''), [run?.battleSeed]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveTeam = (t: SavedTeam) => {
    setTeams(prev => {
      const list = [t, ...prev.filter(x => x.id !== t.id)].sort((a, b) => b.updatedAt - a.updatedAt);
      storageSet(TEAMS_KEY, list);
      return list;
    });
  };
  const deleteTeam = (t: SavedTeam) => {
    setTeams(prev => {
      const list = prev.filter(x => x.id !== t.id);
      storageSet(TEAMS_KEY, list);
      return list;
    });
  };

  const startRun = (challenge: Challenge, team: SavedTeam | null = null) => {
    // o diário vale só na primeira vez que alguém começa (mesmo que abandone no meio)
    const startedKey = `${dailyKey(todayKey())}-iniciado`;
    const practice = challenge.kind === 'daily' && (!!storageGet(dailyKey(todayKey())) || !!storageGet(startedKey));
    if (challenge.kind === 'daily' && !practice) storageSet(startedKey, true);
    setRun(team ? { ...runFromTeam(challenge, team), practice } : newRun(challenge, practice));
    setScreen({ name: 'run' });
    history.replaceState(null, '', location.pathname);
  };

  const keep = () =>
    update(r => {
      if (!r.candidate) return {};
      const team = [...r.team, r.candidate];
      if (team.length >= TEAM_SIZE) return { team, candidate: null };
      return { team, candidate: drawNext(r.challenge, runSeed(r), r.draws, [...team, ...r.reserve]), draws: r.draws + 1 };
    });

  const reroll = () =>
    update(r => {
      if (!r.candidate || r.rerolls <= 0) return {};
      return {
        reserve: [...r.reserve, r.candidate],
        candidate: drawNext(r.challenge, runSeed(r), r.draws, taken(r)),
        draws: r.draws + 1,
        rerolls: r.rerolls - 1,
      };
    });

  const swap = (reserveIdx: number, teamIdx: number) =>
    update(r => {
      if (r.swaps <= 0) return {};
      const incoming = r.reserve[reserveIdx];
      const outgoing = r.team[teamIdx];
      const team = r.team.map((s, i) => (i === teamIdx ? incoming : s));
      const reserve = r.reserve.map((s, i) => (i === reserveIdx ? outgoing : s));
      const builds = r.builds.length
        ? r.builds.map((b, i) => (i === teamIdx ? defaultBuild(incoming, rngFor(runSeed(r), 'build', incoming)) : b))
        : r.builds;
      return { team, reserve, builds, swaps: r.swaps - 1 };
    });

  const saveMine = (ch: Challenge) => {
    const list = [ch, ...mine.filter(m => m.seed !== ch.seed)].slice(0, 30);
    setMine(list);
    storageSet(MINE_KEY, list);
  };

  const step = run?.phase === 'draft' ? 0 : run?.phase === 'build' && !run.started ? 1 : 2;
  const goHome = () => {
    setSaved(loadRun());
    setScreen({ name: 'home' });
  };

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={goHome} aria-label="Desafio Pokémon — início">
          <Brand />
        </button>
        {screen.name === 'run' && run && (
          <>
            <span className="topbar-title">
              {run.challenge.name}
              {run.practice && ' · treino'}
              {run.ownTeam && ` · ${run.ownTeam}`}
            </span>
            <Stepper step={step} />
          </>
        )}
      </header>

      <main className="app-main">

        {screen.name === 'home' && (
          <Home
            canResume={!!saved && !isFinished(saved)}
            resumeLabel={saved ? `${saved.challenge.name} (${saved.wins}x0)` : ''}
            dailyResult={dailyResult}
            myChallenges={mine}
            teamCount={teams.length}
            onTeams={() => setScreen({ name: 'teams' })}
            onResume={() => {
              setRun(loadRun());
              setScreen({ name: 'run' });
            }}
            onOpen={ch => setScreen({ name: 'setup', challenge: ch })}
            onDaily={() =>
              setScreen({
                name: 'setup',
                challenge: dailyChallenge(),
                note:
                  dailyResult || storageGet(`${dailyKey(todayKey())}-iniciado`)
                    ? 'Você já começou o desafio de hoje — esta tentativa é só treino e não muda o seu resultado.'
                    : 'Só a primeira tentativa de hoje conta.',
              })
            }
            onRandom={() => setScreen({ name: 'setup', challenge: randomChallenge() })}
            onClassic={() => setScreen({ name: 'setup', challenge: classicChallenge() })}
            onCreate={() => setScreen({ name: 'editor', challenge: blankCustomChallenge() })}
            onEditMine={ch => setScreen({ name: 'editor', challenge: ch })}
            onDeleteMine={ch => {
              const list = mine.filter(m => m.seed !== ch.seed);
              setMine(list);
              storageSet(MINE_KEY, list);
            }}
          />
        )}

        {screen.name !== 'home' && screen.name !== 'report' && !dataReady && <Loading />}

        {screen.name === 'setup' && dataReady && (
          <ChallengeSetup
            challenge={screen.challenge}
            note={screen.note}
            onBack={goHome}
            teams={teams}
            onOpenTeams={() => setScreen({ name: 'teams', back: screen })}
            onPlay={team => startRun(screen.challenge, team)}
            onReroll={screen.challenge.kind === 'random' ? () => setScreen({ name: 'setup', challenge: randomChallenge() }) : undefined}
            onEditCopy={
              screen.challenge.kind === 'custom' || screen.challenge.kind === 'random'
                ? () => setScreen({ name: 'editor', challenge: { ...screen.challenge, kind: 'custom', seed: randomSeed() } })
                : undefined
            }
          />
        )}

        {screen.name === 'editor' && dataReady && (
          <Suspense fallback={<Loading text="Abrindo o editor..." />}>
            <ChallengeEditor
              initial={screen.challenge}
              onBack={goHome}
              onSave={ch => saveMine({ ...ch, kind: 'custom' })}
              onPlay={ch => {
                saveMine({ ...ch, kind: 'custom' });
                setScreen({ name: 'setup', challenge: { ...ch, kind: 'custom' } });
              }}
            />
          </Suspense>
        )}

        {screen.name === 'report' && (
          <RunReportView
            report={screen.report}
            onBack={() => {
              history.replaceState(null, '', location.pathname);
              setScreen(screen.back ?? { name: 'home' });
            }}
            onPlay={() => {
              history.replaceState(null, '', location.pathname);
              const ch = screen.report.challenge;
              // um desafio diário de outro dia vira desafio normal (o de hoje é outro)
              const today = ch.kind === 'daily' && screen.report.date === todayKey();
              setScreen({ name: 'setup', challenge: today ? ch : { ...ch, kind: ch.kind === 'daily' ? 'custom' : ch.kind } });
            }}
          />
        )}

        {screen.name === 'teams' && dataReady && (
          <TeamList
            teams={teams}
            onBack={() => setScreen(screen.back ?? { name: 'home' })}
            onSave={saveTeam}
            onDelete={deleteTeam}
            onEdit={team => setScreen({ name: 'team-edit', team, back: screen })}
          />
        )}

        {screen.name === 'team-edit' && dataReady && (
          <TeamEditor key={screen.team.id} team={screen.team} onSave={saveTeam} onBack={() => setScreen(screen.back ?? { name: 'teams' })} />
        )}

        {screen.name === 'run' && run && c && dataReady && (
          <>
            {run.phase === 'draft' && (
              <Draft
                team={run.team}
                candidate={run.candidate}
                reserve={run.reserve}
                rerolls={run.rerolls}
                swaps={run.swaps}
                onKeep={keep}
                onReroll={reroll}
                onSwap={swap}
                onConfirm={() => update(r => ({ phase: 'build', builds: r.team.map(s => defaultBuild(s, rngFor(runSeed(r), 'build', s))) }))}
              />
            )}

            {run.phase === 'build' && (
              <Builder
                builds={run.builds}
                mechanics={c.mechanics}
                onChange={builds => update(() => ({ builds }))}
                doneLabel={run.started ? 'Salvar e voltar' : 'Começar as batalhas'}
                onDone={() => update(() => ({ phase: 'hub', started: true }))}
              />
            )}

            {run.phase === 'hub' && (
              <Hub
                challenge={c}
                wins={run.wins}
                lost={run.lost}
                builds={run.builds}
                reserve={run.reserve}
                swaps={run.swaps}
                onSwap={swap}
                onBattle={() => update(r => ({ phase: 'battle', battleSeed: r.battleSeed + 1 }))}
                onEdit={() => update(() => ({ phase: 'build' }))}
                onRestart={goHome}
                report={report!}
                onOpenReport={() => report && setScreen({ name: 'report', report, back: { name: 'run' } })}
              />
            )}

            {run.phase === 'battle' && c.trainers[run.wins] && (
              <Suspense fallback={<Loading text="Preparando a batalha..." />}>
                <BattleScreen
                  key={run.battleSeed}
                  index={run.wins}
                  total={c.trainers.length}
                  title={trainerTitle(c, run.wins)}
                  trainer={c.trainers[run.wins]}
                  format={c.format}
                  mechanics={c.mechanics}
                  myTeam={myTeam}
                  foeTeam={foeTeam}
                  aiRandomness={AI_RANDOMNESS[c.trainers[run.wins].strength - 1] ?? 0}
                  seed={battleSeed}
                  onEnd={(won, summary) =>
                    update(r => {
                      const t = r.challenge.trainers[r.wins];
                      const record: BattleRecord = {
                        trainer: { name: t.name, sprite: t.sprite, type: t.type, strength: t.strength },
                        foe: foeTeam.map(f => ({ species: f.species, shiny: !!f.shiny })),
                        won,
                        ...summary,
                      };
                      const history = [...(r.history ?? []), record];
                      return won ? { phase: 'hub', wins: r.wins + 1, history } : { phase: 'hub', lost: true, history };
                    })
                  }
                />
              </Suspense>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
