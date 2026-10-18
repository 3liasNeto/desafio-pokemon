import { useState } from 'react';
import { describeRules, MECHANIC_INFO, shareUrl, TEAM_MODE_INFO, type Challenge, type Mechanics } from '../game/challenge';
import { teamProblems, type SavedTeam } from '../game/teams';
import { speciesPool, TYPE_COLORS, TYPE_PT } from '../game/data';
import { RuleList, Sprite, Stars, TrainerAvatar, TypeIcon } from './common';
import { Icon } from './icons';

interface Props {
  challenge: Challenge;
  note?: string;
  teams: SavedTeam[];
  onOpenTeams: () => void;
  /** time salvo escolhido (null = sortear) */
  onPlay: (team: SavedTeam | null) => void;
  onBack: () => void;
  onReroll?: () => void;
  onEditCopy?: () => void;
}

/** Mostra as regras de um desafio antes de começar (diário, aleatório ou de link). */
export function ChallengeSetup({ challenge: c, note, teams, onOpenTeams, onPlay, onBack, onReroll, onEditCopy }: Props) {
  const pool = speciesPool(c).length;
  const mech = (Object.keys(MECHANIC_INFO) as (keyof Mechanics)[]).filter(m => c.mechanics[m]);
  const mode = c.teamMode ?? 'draft';
  const legal = teams.filter(t => teamProblems(t.builds, c).length === 0);
  // escolha inicial: sortear quando pode; senão o primeiro time válido
  const [choice, setChoice] = useState<string>(mode === 'own' ? (legal[0]?.id ?? '') : 'draft');
  const chosenTeam = teams.find(t => t.id === choice) ?? null;
  const canStart = choice === 'draft' ? mode !== 'own' : !!chosenTeam && teamProblems(chosenTeam.builds, c).length === 0;

  return (
    <div className="setup">
      <div className="section-head">
        <div>
          <h2>{c.name}</h2>
          <p>
            {c.author && <>por <b>{c.author}</b> · </>}
            {c.description || 'Vença todos os treinadores em sequência, sem perder nenhuma batalha.'}
          </p>
        </div>
        <div className="actions">
          <button className="btn" onClick={onBack}>
            <Icon name="back" size={16} /> Voltar
          </button>
          {onReroll && (
            <button className="btn" onClick={onReroll}>
              <Icon name="dice" size={16} /> Outras regras
            </button>
          )}
          <button className="btn primary lg" disabled={!canStart} onClick={() => onPlay(choice === 'draft' ? null : chosenTeam)}>
            Começar <Icon name="next" size={18} />
          </button>
        </div>
      </div>
      {note && <div className="panel note">{note}</div>}

      {mode !== 'draft' && (
        <section className="panel setup-card team-choice">
          <div className="block-title">
            <span>
              <Icon name="users" size={14} /> Seu time · {TEAM_MODE_INFO[mode].label}
            </span>
            <button className="btn sm" onClick={onOpenTeams}>
              <Icon name="wrench" size={14} /> Abrir teambuilder
            </button>
          </div>
          <div className="team-options">
            {mode === 'both' && (
              <button className={`team-option ${choice === 'draft' ? 'on' : ''}`} onClick={() => setChoice('draft')}>
                <span className="team-option-icon">
                  <Icon name="dice" size={22} />
                </span>
                <span>
                  <b>Sortear o time</b>
                  <small>
                    Um Pokémon por vez, com {c.rerolls} rerolls e {c.swaps} trocas.
                  </small>
                </span>
              </button>
            )}
            {teams.map(t => {
              const problems = teamProblems(t.builds, c);
              return (
                <button
                  key={t.id}
                  className={`team-option ${choice === t.id ? 'on' : ''} ${problems.length ? 'bad' : ''}`}
                  onClick={() => setChoice(t.id)}
                  title={problems.join('\n')}
                >
                  <span className="team-option-mons">
                    {t.builds.slice(0, 6).map((b, i) => (
                      <Sprite key={i} species={b.species} shiny={b.shiny} />
                    ))}
                  </span>
                  <span>
                    <b>{t.name || 'Sem nome'}</b>
                    <small className={problems.length ? 'errors' : 'ok-text'}>{problems.length ? problems[0] : 'Pode entrar neste desafio'}</small>
                  </span>
                </button>
              );
            })}
            {teams.length === 0 && (
              <p className="muted" style={{ margin: 0 }}>
                Você ainda não tem times salvos. Monte um no teambuilder para entrar com ele.
              </p>
            )}
          </div>
          {chosenTeam && teamProblems(chosenTeam.builds, c).length > 1 && (
            <ul className="import-notes">
              {teamProblems(chosenTeam.builds, c).map(p => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {mode === 'own' && legal.length === 0 && teams.length > 0 && (
            <span className="errors">Nenhum dos seus times respeita as regras deste desafio ainda.</span>
          )}
        </section>
      )}

      <div className="setup-grid">
        <section className="panel setup-card">
          <div className="block-title">Regras</div>
          <RuleList rules={[...describeRules(c), { icon: 'target', text: `${pool} espécies podem sair no sorteio` }]} />
          {mech.length > 0 && (
            <div className="mech-explain">
              {mech.map(m => (
                <div key={m} className="mech-row">
                  <span className="mech-icon"><Icon name={MECHANIC_INFO[m].icon} size={20} /></span>
                  <div>
                    <b>{MECHANIC_INFO[m].label}</b>
                    <p>{MECHANIC_INFO[m].desc}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {c.format === 'doubles' && (
            <div className="mech-row">
              <span className="mech-icon"><Icon name="swords" size={20} /></span>
              <div>
                <b>Duplas</b>
                <p>Dois Pokémon de cada lado ao mesmo tempo. Você escolhe a ação e o alvo de cada um; golpes em área acertam os dois rivais.</p>
              </div>
            </div>
          )}
        </section>

        <section className="panel setup-card">
          <div className="block-title">Treinadores ({c.trainers.length})</div>
          <div className="trainer-list">
            {c.trainers.map((t, i) => (
              <div key={i} className="trainer-row" style={{ ['--tc' as string]: t.type ? TYPE_COLORS[t.type] : '#ffcb05' }}>
                <span className="trainer-n">{i + 1}</span>
                <TrainerAvatar sprite={t.sprite} size={46} />
                <div>
                  <b>{t.name}</b>
                  <span className="muted">
                    {t.type ? (
                      <>
                        <TypeIcon type={t.type} size={14} /> {TYPE_PT[t.type]}
                      </>
                    ) : t.team.length ? (
                      'Time montado'
                    ) : (
                      'Time misto'
                    )}{' '}
                    · <Stars value={t.strength} />
                  </span>
                </div>
              </div>
            ))}
          </div>
          {c.kind === 'custom' && <ShareBox challenge={c} />}
          {onEditCopy && (
            <button className="btn sm" style={{ marginTop: 10 }} onClick={onEditCopy}>
              <Icon name="edit" size={14} /> Editar uma cópia deste desafio
            </button>
          )}
        </section>
      </div>
    </div>
  );
}

export function ShareBox({ challenge }: { challenge: Challenge }) {
  const [copied, setCopied] = useState(false);
  const url = shareUrl(challenge);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="share">
      <div className="block-title" style={{ marginTop: 12 }}>
        Compartilhar
      </div>
      <div className="code-row">
        <input type="text" readOnly value={url} onFocus={e => e.currentTarget.select()} />
        <button className="btn" onClick={copy}>
          <Icon name={copied ? 'check' : 'copy'} size={16} /> {copied ? 'Copiado' : 'Copiar link'}
        </button>
      </div>
      <span className="muted" style={{ fontSize: 12 }}>
        Quem abrir o link joga com as mesmas regras, treinadores e o mesmo sorteio.
      </span>
    </div>
  );
}
