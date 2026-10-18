import { useState } from 'react';
import { dailyChallenge, decodeChallenge, describeRules, type Challenge } from '../game/challenge';
import { todayKey } from '../game/rng';
import { RuleList, TrainerAvatar } from './common';
import { Icon, type IconName } from './icons';
import { BrandMark } from './Brand';

export interface DailyResult {
  wins: number;
  lost: boolean;
  total: number;
}

interface Props {
  canResume: boolean;
  resumeLabel: string;
  dailyResult: DailyResult | null;
  myChallenges: Challenge[];
  teamCount: number;
  onTeams: () => void;
  onResume: () => void;
  onOpen: (c: Challenge) => void;
  onDaily: () => void;
  onRandom: () => void;
  onClassic: () => void;
  onCreate: () => void;
  onEditMine: (c: Challenge) => void;
  onDeleteMine: (c: Challenge) => void;
}

export function Home(p: Props) {
  const daily = dailyChallenge();
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');

  const openCode = () => {
    const c = decodeChallenge(code);
    if (!c) return setCodeError('Link ou código inválido.');
    setCodeError('');
    p.onOpen(c);
  };

  return (
    <div className="home">
      <section className="home-intro" aria-labelledby="home-title">
        <div className="home-copy">
          <span className="home-eyebrow"><span /> SORTE. ESTRATÉGIA. VITÓRIA.</span>
          <h1 id="home-title">
            Desafio <em>Pokémon</em>
          </h1>
          <p className="lead">
            Pokémon sorteados um por vez. Você decide golpes, itens, natureza, IVs, EVs e as transformações liberadas — e
            precisa vencer todos os treinadores sem perder nenhuma.
          </p>
          <div className="home-journey" aria-label="Etapas do desafio">
            <span><Icon name="dice" size={15} /> Sorteie</span><Icon name="next" size={13} />
            <span><Icon name="users" size={15} /> Monte seu time</span><Icon name="next" size={13} />
            <span><Icon name="trophy" size={15} /> Vença a liga</span>
          </div>
        </div>
        <div className="home-hero" aria-hidden="true">
          <span className="hero-orbit" />
          <BrandMark className="hero-mark" />
          <span className="hero-caption">CADA TIME, UMA NOVA JORNADA</span>
        </div>
      </section>

      {p.canResume && (
        <button className="btn primary lg" onClick={p.onResume}>
          <Icon name="play" size={16} /> Continuar: {p.resumeLabel}
        </button>
      )}

      <div className="modes">
        <section className="panel mode daily">
          <span className="mode-kicker"><span className="daily-dot" /> UM NOVO DESAFIO TODO DIA</span>
          <div className="mode-head">
            <ModeIcon name="calendar" />
            <div>
              <h3>Desafio do dia</h3>
              <span className="muted">{todayKey().split('-').reverse().join('/')} · igual para todo mundo</span>
            </div>
          </div>
          <RuleList rules={describeRules(daily).slice(0, 4)} />
          <div className="mode-trainers">
            {daily.trainers.map((t, i) => (
              <TrainerAvatar key={i} sprite={t.sprite} size={46} title={t.name} />
            ))}
          </div>
          {p.dailyResult ? (
            <div className="daily-done">
              Hoje você fez <b>{p.dailyResult.wins}x{p.dailyResult.lost ? 1 : 0}</b>
              {!p.dailyResult.lost && p.dailyResult.wins >= p.dailyResult.total && <Icon name="crown" size={18} className="gold" />}
              <button className="btn sm" onClick={p.onDaily}>
                Treinar de novo
              </button>
            </div>
          ) : (
            <button className="btn primary" onClick={p.onDaily}>
              Jogar o desafio de hoje
            </button>
          )}
        </section>

        <section className="panel mode mode-random">
          <div className="mode-head">
            <ModeIcon name="dice" />
            <div>
              <h3>Desafio aleatório</h3>
              <span className="muted">Regras sorteadas: gerações, tiers, duplas, transformações...</span>
            </div>
          </div>
          <button className="btn" onClick={p.onRandom}>
            Sortear regras
          </button>
        </section>

        <section className="panel mode mode-classic">
          <div className="mode-head">
            <ModeIcon name="trophy" />
            <div>
              <h3>Liga clássica</h3>
              <span className="muted">Elite dos Quatro + Campeã, individual, sem transformações</span>
            </div>
          </div>
          <button className="btn" onClick={p.onClassic}>
            Jogar
          </button>
        </section>

        <section className="panel mode mode-create">
          <div className="mode-head">
            <ModeIcon name="wrench" />
            <div>
              <h3>Criar desafio</h3>
              <span className="muted">Seus treinadores, suas regras. Gere um link e desafie os amigos</span>
            </div>
          </div>
          <button className="btn" onClick={p.onCreate}>
            Criar
          </button>
          {p.myChallenges.length > 0 && (
            <div className="mine">
              <span className="block-title" style={{ margin: '6px 0 4px' }}>
                Meus desafios
              </span>
              {p.myChallenges.map(c => (
                <div key={c.seed} className="mine-row">
                  <button className="link" onClick={() => p.onOpen(c)}>
                    {c.name}
                  </button>
                  <button className="btn sm" onClick={() => p.onEditMine(c)}>
                    Editar
                  </button>
                  <button className="btn sm icon-only" title="Apagar" onClick={() => p.onDeleteMine(c)}>
                    <Icon name="x" size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel mode mode-teams">
          <div className="mode-head">
            <ModeIcon name="users" />
            <div>
              <h3>Meus times</h3>
              <span className="muted">Teambuilder: monte times do zero ou importe do Showdown e entre com eles nos desafios</span>
            </div>
          </div>
          <button className="btn" onClick={p.onTeams}>
            Abrir teambuilder{p.teamCount ? ` (${p.teamCount})` : ''}
          </button>
        </section>

        <section className="panel mode mode-share">
          <div className="mode-head">
            <ModeIcon name="link" />
            <div>
              <h3>Jogar desafio de alguém</h3>
              <span className="muted">Cole o link ou o código que te mandaram</span>
            </div>
          </div>
          <div className="code-row">
            <input type="text" aria-label="Link ou código do desafio" placeholder="https://...#desafio=..." value={code} onChange={e => setCode(e.target.value)} />
            <button className="btn" onClick={openCode} disabled={!code.trim()}>
              Abrir
            </button>
          </div>
          {codeError && <span className="errors">{codeError}</span>}
        </section>
      </div>
    </div>
  );
}

function ModeIcon({ name }: { name: IconName }) {
  return (
    <span className="mode-icon">
      <Icon name={name} size={24} />
    </span>
  );
}
