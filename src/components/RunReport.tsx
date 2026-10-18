import { useEffect, useMemo, useState } from 'react';
import { describeRules } from '../game/challenge';
import { dex, TYPE_COLORS, TYPE_PT } from '../game/data';
import {
  reportTeam, reportText, reportUrl, resultStrip, scoreText, shortText, teamShowdownText, totalKOs, type RunReport,
} from '../game/report';
import { ItemIcon, MiniSprite, RuleList, Sprite, Stars, TrainerAvatar, TypeIcon } from './common';
import { Icon } from './icons';

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Painel de compartilhar a run (no hub): link, texto curto, relatório completo e time do Showdown. */
export function ShareRunPanel({ report, onOpen }: { report: RunReport; onOpen: () => void }) {
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState('');
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    let alive = true;
    void reportUrl(report).then(u => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [report]);

  const full = useMemo(() => reportText(report, url || undefined), [report, url]);
  const doCopy = async (what: string, text: string) => {
    if (await copy(text)) {
      setCopied(what);
      setTimeout(() => setCopied(c => (c === what ? '' : c)), 1600);
    }
  };
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  return (
    <section className="panel share-run">
      <div className="block-title">
        <span>
          <Icon name="link" size={14} /> Compartilhar a run
        </span>
        <span className="share-strip">{resultStrip(report)}</span>
      </div>
      <div className="code-row">
        <input type="text" readOnly value={url || 'Gerando link...'} onFocus={e => e.currentTarget.select()} />
        <button className="btn" disabled={!url} onClick={() => doCopy('link', url)}>
          <Icon name={copied === 'link' ? 'check' : 'copy'} size={16} /> {copied === 'link' ? 'Copiado' : 'Copiar link'}
        </button>
      </div>
      <div className="share-actions">
        <button className="btn sm" onClick={() => doCopy('curto', shortText(report, url))}>
          <Icon name={copied === 'curto' ? 'check' : 'copy'} size={14} /> Resultado curto
        </button>
        <button className="btn sm" onClick={() => doCopy('completo', full)}>
          <Icon name={copied === 'completo' ? 'check' : 'copy'} size={14} /> Relatório completo
        </button>
        <button className="btn sm" onClick={() => doCopy('time', teamShowdownText(report))}>
          <Icon name={copied === 'time' ? 'check' : 'copy'} size={14} /> Time (Showdown)
        </button>
        {canShare && url && (
          <button className="btn sm" onClick={() => navigator.share({ title: `Desafio Pokémon · ${report.challenge.name}`, text: shortText(report), url }).catch(() => {})}>
            <Icon name="link" size={14} /> Enviar...
          </button>
        )}
        <button className="btn sm" onClick={() => setShowText(v => !v)}>
          {showText ? 'Esconder texto' : 'Ver texto'}
        </button>
        <button className="btn sm primary" onClick={onOpen}>
          <Icon name="next" size={14} /> Abrir relatório
        </button>
      </div>
      {showText && <textarea readOnly value={full} rows={14} onFocus={e => e.currentTarget.select()} />}
    </section>
  );
}

interface ViewProps {
  report: RunReport;
  onBack: () => void;
  onPlay: () => void;
}

/** Relatório da run (abre pelo link #run=...): time, treinadores enfrentados e o que aconteceu. */
export function RunReportView({ report, onBack, onPlay }: ViewProps) {
  const c = report.challenge;
  const team = useMemo(() => reportTeam(report), [report]);
  const kos = useMemo(() => totalKOs(report), [report]);
  const total = c.trainers.length;
  const champion = !report.lost && report.wins >= total;
  const [copied, setCopied] = useState('');
  const mvp = Object.entries(kos).sort((a, b) => b[1] - a[1])[0];

  const doCopy = async (what: string, text: string) => {
    if (await copy(text)) {
      setCopied(what);
      setTimeout(() => setCopied(''), 1600);
    }
  };

  return (
    <div className="report">
      <div className="section-head">
        <div>
          <h2>{c.name}</h2>
          <p>
            Run de {report.date.split('-').reverse().join('/') || 'data desconhecida'}
            {c.author && <> · desafio de <b>{c.author}</b></>}
            {report.ownTeam && <> · time montado “{report.ownTeam}”</>}
            {report.practice && <> · treino</>}
          </p>
        </div>
        <div className="actions">
          <button className="btn" onClick={onBack}>
            <Icon name="back" size={16} /> Início
          </button>
          <button className="btn" onClick={() => doCopy('time', teamShowdownText(report))}>
            <Icon name={copied === 'time' ? 'check' : 'copy'} size={16} /> {copied === 'time' ? 'Copiado' : 'Time (Showdown)'}
          </button>
          <button className="btn primary lg" onClick={onPlay}>
            Jogar este desafio <Icon name="next" size={18} />
          </button>
        </div>
      </div>

      <section className={`panel report-score ${champion ? 'champion' : report.lost ? 'lost' : ''}`}>
        <div className="report-score-main">
          {champion && <Icon name="crown" size={36} className="gold" />}
          <span className="report-score-num">{scoreText(report).replace(' 👑', '')}</span>
          <span className="report-score-label">{champion ? 'Desafio completo!' : report.lost ? 'Fim da run' : 'Run em andamento'}</span>
        </div>
        <div className="report-strip">{resultStrip(report)}</div>
        {mvp && (
          <div className="report-mvp">
            <Icon name="trophy" size={16} /> Destaque: <b>{mvp[0]}</b> com {mvp[1]} KO{mvp[1] > 1 ? 's' : ''}
          </div>
        )}
      </section>

      <RuleList rules={describeRules(c)} chips />

      <h3 className="report-h">Time</h3>
      <div className="report-team">
        {team.map((s, i) => {
          const sp = dex.species.get(s.species);
          return (
            <section key={i} className="panel report-mon" style={{ ['--tc' as string]: TYPE_COLORS[sp.types[0]] }}>
              <div className="report-mon-head">
                <span className="report-mon-art">
                  <Sprite species={s.species} shiny={s.shiny} />
                </span>
                <div className="report-mon-info">
                  <b>{s.name || s.species}</b>
                  {s.name && s.name !== s.species && <small className="muted">{s.species}</small>}
                  <span className="slot-types">
                    {sp.types.map(t => (
                      <TypeIcon key={t} type={t} size={16} />
                    ))}
                    {s.shiny && <span className="shiny-star">✦</span>}
                  </span>
                </div>
                {kos[s.name || s.species] ? <span className="ko-badge">{kos[s.name || s.species]} KO</span> : null}
              </div>
              <div className="report-mon-meta">
                {s.item && (
                  <span>
                    <ItemIcon name={s.item} /> {s.item}
                  </span>
                )}
                <span>{s.ability}</span>
                {s.nature && <span>{s.nature}</span>}
                {s.teraType && (c.mechanics.tera || false) && (
                  <span>
                    <TypeIcon type={s.teraType} size={14} /> Tera {TYPE_PT[s.teraType] ?? s.teraType}
                  </span>
                )}
              </div>
              <div className="report-moves">
                {s.moves.map(m => {
                  const mv = dex.moves.get(m);
                  return (
                    <span key={m} className="report-move" style={{ ['--tc' as string]: TYPE_COLORS[mv.type] }}>
                      <TypeIcon type={mv.type} size={14} /> {mv.name}
                    </span>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <h3 className="report-h">Batalhas</h3>
      <div className="report-battles">
        {c.trainers.map((t, i) => {
          const b = report.history[i];
          const status = b ? (b.won ? 'won' : 'lost') : 'pending';
          return (
            <section key={i} className={`panel report-battle ${status}`} style={{ ['--tc' as string]: t.type ? TYPE_COLORS[t.type] : '#ffcb05' }}>
              <div className="rb-trainer">
                <span className="rb-n">{i + 1}</span>
                <TrainerAvatar sprite={b?.trainer.sprite ?? t.sprite} size={56} />
                <div>
                  <b>{b?.trainer.name ?? t.name}</b>
                  <span className="muted rb-sub">
                    {t.type ? (
                      <>
                        <TypeIcon type={t.type} size={14} /> {TYPE_PT[t.type]}
                      </>
                    ) : (
                      'Time misto'
                    )}{' '}
                    · <Stars value={t.strength} />
                  </span>
                </div>
                <span className={`rb-result ${status}`}>
                  {b ? (b.won ? 'Vitória' : 'Derrota') : 'Não enfrentado'}
                  {b && <small>{b.turns} turnos</small>}
                </span>
              </div>
              {b && (
                <>
                  <div className="rb-foes">
                    {b.foe.map((f, k) => {
                      const base = dex.species.get(f.species).baseSpecies;
                      const down = b.stats.foeFainted.some(x => x.name === f.species || x.name === base);
                      return (
                        <span key={k} className={`rb-foe ${down ? 'down' : ''}`} title={f.species + (down ? ' (derrotado)' : '')}>
                          <MiniSprite species={f.species} size={48} />
                          {f.shiny && <span className="shiny-star rb-shiny">✦</span>}
                        </span>
                      );
                    })}
                  </div>
                  <div className="rb-details">
                    {Object.keys(b.stats.koBy).length > 0 && (
                      <span>
                        <b>KOs:</b> {Object.entries(b.stats.koBy).map(([n, k]) => `${n} ×${k}`).join(', ')}
                      </span>
                    )}
                    {b.stats.myFainted.length > 0 && (
                      <span>
                        <b>Caíram:</b> {b.stats.myFainted.map(f => f.name + (f.by ? ` (por ${f.by})` : '')).join(', ')}
                      </span>
                    )}
                    {b.stats.gimmicks.length > 0 && (
                      <span>
                        <b>Transformações:</b> {b.stats.gimmicks.join(', ')}
                      </span>
                    )}
                  </div>
                </>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
