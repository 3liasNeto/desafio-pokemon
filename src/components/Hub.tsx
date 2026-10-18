import { useState } from 'react';
import { describeRules, type Challenge } from '../game/challenge';
import type { RunReport } from '../game/report';
import { TYPE_COLORS, TYPE_PT } from '../game/data';
import { displayName, type Build } from '../game/rules';
import { RuleList, Sprite, Stars, TrainerAvatar, TypeIcon } from './common';
import { Icon } from './icons';
import { ReservePanel } from './Draft';
import { ShareRunPanel } from './RunReport';

export function trainerTitle(c: Challenge, index: number) {
  const total = c.trainers.length;
  if (index === total - 1) return `Batalha final · ${index + 1}/${total}`;
  return `Batalha ${index + 1}/${total}`;
}

interface Props {
  challenge: Challenge;
  wins: number;
  lost: boolean;
  builds: Build[];
  reserve: string[];
  swaps: number;
  onSwap: (reserveIdx: number, teamIdx: number) => void;
  onBattle: () => void;
  onEdit: () => void;
  onRestart: () => void;
  report: RunReport;
  onOpenReport: () => void;
}

export function Hub({ challenge, wins, lost, builds, reserve, swaps, onSwap, onBattle, onEdit, onRestart, report, onOpenReport }: Props) {
  const [sharing, setSharing] = useState(false);
  const trainers = challenge.trainers;
  const total = trainers.length;
  const finished = lost || wins >= total;
  const perfect = wins >= total;
  const next = trainers[wins];

  return (
    <div className="hub">
      <div className={`score ${perfect ? 'champion' : ''}`}>
        {perfect && <Icon name="crown" size={48} className="crown" />}
        {wins}x{lost ? 1 : 0}
        <small>{perfect ? `${total}x0 — desafio completo!` : lost ? 'Fim da run' : challenge.name}</small>
      </div>

      <div className="league-path">
        {trainers.map((t, i) => {
          const state = i < wins ? 'won' : i === wins && lost ? 'lost' : i === wins && !finished ? 'next' : '';
          return (
            <div key={i} className={`league-node ${state} ${i === total - 1 ? 'boss' : ''}`}>
              <div className="node-art" style={{ ['--tc' as string]: t.type ? TYPE_COLORS[t.type] : '#ffcb05' }}>
                <TrainerAvatar sprite={t.sprite} size={78} title={t.name} />
                {state === 'won' && <span className="node-mark"><Icon name="check" size={34} /></span>}
                {state === 'lost' && <span className="node-mark x"><Icon name="x" size={34} /></span>}
              </div>
              <span className="node-name">{t.name}</span>
              <span className="node-type">
                {t.type ? (
                  <>
                    <TypeIcon type={t.type} size={14} /> {TYPE_PT[t.type]}
                  </>
                ) : (
                  'Time misto'
                )}
              </span>
            </div>
          );
        })}
      </div>

      {!finished && next ? (
        <div className="panel next-card" style={{ ['--tc' as string]: next.type ? TYPE_COLORS[next.type] : '#ffcb05' }}>
          <TrainerAvatar sprite={next.sprite} size={104} fit="body" className="next-trainer" title={next.name} />
          <div className="next-info">
            <span className="muted">{trainerTitle(challenge, wins)}</span>
            <h3>{next.name}</h3>
            <span className="muted">
              {next.type ? (
                <>
                  Especialista em <b style={{ color: TYPE_COLORS[next.type] }}>{TYPE_PT[next.type]}</b>
                </>
              ) : next.team.length ? (
                'Time montado pelo criador do desafio'
              ) : (
                'Time misto'
              )}
              <span className="nowrap"> · Força <Stars value={next.strength} /></span>
            </span>
          </div>
          <div className="actions">
            <button className="btn" onClick={onEdit}>
              Editar time
            </button>
            {report.history.length > 0 && (
              <button className={`btn ${sharing ? 'on' : ''}`} onClick={() => setSharing(v => !v)}>
                <Icon name="link" size={16} /> Compartilhar
              </button>
            )}
            <button className="btn primary lg" onClick={onBattle}>
              Batalhar!
            </button>
          </div>
        </div>
      ) : (
        <div className="actions">
          <button className="btn lg" onClick={onOpenReport}>
            <Icon name="layers" size={18} /> Ver relatório
          </button>
          <button className="btn primary lg" onClick={onRestart}>
            Nova run
          </button>
        </div>
      )}

      {(sharing || (finished && report.history.length > 0)) && (
        <div style={{ width: '100%', maxWidth: 760 }}>
          <ShareRunPanel report={report} onOpen={onOpenReport} />
        </div>
      )}

      <RuleList rules={describeRules(challenge)} chips />

      <div className="team-strip">
        {builds.map(b => (
          <div key={b.species} className="team-strip-mon" title={displayName(b)}>
            <Sprite species={b.species} shiny={b.shiny} />
            <span>{displayName(b)}</span>
          </div>
        ))}
      </div>

      {!finished && (reserve.length > 0 || swaps > 0) && (
        <div style={{ width: '100%', maxWidth: 760 }}>
          <ReservePanel
            team={builds.map(b => b.species)}
            reserve={reserve}
            swaps={swaps}
            onSwap={onSwap}
            hint={swaps > 0 ? `${swaps} troca(s) — dá pra trocar antes da próxima batalha` : 'Sem trocas'}
          />
        </div>
      )}
    </div>
  );
}
