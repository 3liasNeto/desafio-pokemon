import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { config } from '../config';
import { trainerSpriteUrl, type RuleLine } from '../game/challenge';
import { dex, spriteUrls, TYPE_COLORS, TYPE_PT } from '../game/data';
import { TRAINER_BOXES } from '../game/trainerBoxes';
import { TYPE_ICON_SVG } from '../game/typeIcons';
import { Icon } from './icons';

/**
 * Sprite do Pokémon com carregamento progressivo: mostra na hora a imagem estática (PNG pequeno)
 * e troca pela animada (GIF, bem maior) assim que ela termina de baixar — nunca fica um quadro vazio.
 */
export function Sprite({
  species, back = false, shiny = false, className, alt,
}: { species: string; back?: boolean; shiny?: boolean; className?: string; alt?: string }) {
  const urls = spriteUrls(species, back, shiny); // [animado, estático, reserva]
  const key = `${species}|${back}|${shiny}`;
  const [animReady, setAnimReady] = useState<string | null>(null);
  const [fallback, setFallback] = useState({ key, i: 1 });

  useEffect(() => {
    let alive = true;
    const img = new Image();
    img.onload = () => alive && setAnimReady(key);
    img.src = urls[0];
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const staticIdx = fallback.key === key ? fallback.i : 1;
  const src = animReady === key ? urls[0] : urls[Math.min(staticIdx, urls.length - 1)];
  return (
    <img
      className={className}
      src={src}
      alt={alt ?? species}
      decoding="async"
      onError={() => src !== urls[0] && staticIdx < urls.length - 1 && setFallback({ key, i: staticIdx + 1 })}
    />
  );
}

/** Imagem pequena e estática do Pokémon (para listas longas: não carrega GIFs animados). */
export function MiniSprite({ species, size = 36 }: { species: string; size?: number }) {
  const id = dex.species.get(species).spriteid;
  const base = `${config.spritesUrl}/sprites`;
  const urls = [`${base}/gen5/${id}.png`, `${base}/dex/${id}.png`, `${base}/ani/${id}.gif`];
  const [state, setState] = useState({ id, i: 0 });
  const i = state.id === id ? state.i : 0;
  return (
    <span className="mini-sprite" style={{ width: size, height: size }}>
      <img src={urls[i]} alt="" loading="lazy" onError={() => i < urls.length - 1 && setState({ id, i: i + 1 })} />
    </span>
  );
}

/** Ícone redondo do tipo, na cor do tipo. */
export function TypeIcon({ type, size = 22, title }: { type: string; size?: number; title?: string }) {
  const svg = TYPE_ICON_SVG[type];
  return (
    <span
      className="type-icon"
      title={title ?? TYPE_PT[type] ?? type}
      style={{ width: size, height: size, background: TYPE_COLORS[type] ?? '#666', boxShadow: `0 0 10px ${TYPE_COLORS[type] ?? '#666'}66` }}
    >
      {svg && <svg viewBox="0 0 512 512" dangerouslySetInnerHTML={{ __html: svg }} />}
    </span>
  );
}

/** Pílula com ícone + nome do tipo. */
export function TypeBadge({ type, small }: { type: string; small?: boolean }) {
  return (
    <span className={`type ${small ? 'sm' : ''}`} style={{ background: TYPE_COLORS[type] ?? '#666' }}>
      {TYPE_ICON_SVG[type] && (
        <svg viewBox="0 0 512 512" dangerouslySetInnerHTML={{ __html: TYPE_ICON_SVG[type] }} />
      )}
      {TYPE_PT[type] ?? type}
    </span>
  );
}

const CATEGORY_TITLE: Record<string, string> = { Physical: 'Físico', Special: 'Especial', Status: 'Status' };

/** Selo da categoria do golpe, no estilo dos jogos: físico (explosão), especial (ondas), status (yin-yang). Tamanho fixo. */
export function CategoryIcon({ category }: { category: string; size?: number }) {
  return (
    <span className={`cat-badge cat-${category.toLowerCase()}`} title={CATEGORY_TITLE[category]}>
      <svg viewBox="0 0 24 24" width="14" height="14">
        {category === 'Physical' && (
          <path d="M12 1.5l2.3 5.2 5.4-1.9-1.8 5.4 5.1 2.3-5.1 2.3 1.8 5.4-5.4-1.9L12 23.5l-2.3-5.2-5.4 1.9 1.8-5.4L1 12.5l5.1-2.3-1.8-5.4 5.4 1.9z" fill="currentColor" />
        )}
        {category === 'Special' && (
          <g fill="none" stroke="currentColor" strokeWidth="2.4">
            <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
            <circle cx="12" cy="12" r="6" />
            <circle cx="12" cy="12" r="10" />
          </g>
        )}
        {category === 'Status' && (
          <g>
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.2" />
            <path d="M12 2a10 10 0 0 1 0 20 5 5 0 0 1 0-10 5 5 0 0 0 0-10z" fill="currentColor" />
          </g>
        )}
      </svg>
    </span>
  );
}

/** Lista de regras com ícones (lista vertical ou chips). */
export function RuleList({ rules, chips }: { rules: RuleLine[]; chips?: boolean }) {
  return (
    <ul className={chips ? 'rule-chips' : 'rule-list'}>
      {rules.map(r => (
        <li key={r.text}>
          <Icon name={r.icon} size={16} />
          <span>{r.text}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Avatar de treinador centralizado pelo conteúdo real do sprite (os sprites do Showdown têm
 * o personagem em posições diferentes dentro de um quadro 80x80).
 * `fit="bust"` enquadra cabeça e tronco (avatares redondos); `fit="body"` mostra o corpo inteiro.
 */
export function TrainerAvatar({
  sprite, size, fit = 'bust', className, title,
}: { sprite: string; size: number; fit?: 'bust' | 'body'; className?: string; title?: string }) {
  const [x, y, w, h] = TRAINER_BOXES[sprite] ?? [0, 0, 80, 80];
  let scale: number;
  let left: number;
  let top: number;
  if (fit === 'body') {
    scale = (size * 0.92) / Math.max(w, h);
    left = size / 2 - (x + w / 2) * scale;
    top = size / 2 - (y + h / 2) * scale;
  } else {
    // mostra ~60% de cima do personagem, centralizado na horizontal
    const visibleH = h * 0.62;
    scale = (size * 0.9) / Math.max(w, visibleH);
    left = size / 2 - (x + w / 2) * scale;
    top = size * 0.1 - y * scale;
  }
  return (
    <span className={`trainer-avatar ${className ?? ''}`} style={{ width: size, height: size }} title={title}>
      <img
        src={trainerSpriteUrl(sprite)}
        alt={title ?? ''}
        loading="lazy"
        style={{ width: 80 * scale, height: 80 * scale, left, top }}
      />
    </span>
  );
}

export function hpColor(ratio: number) {
  return ratio > 0.5 ? 'var(--good)' : ratio > 0.2 ? 'var(--warn)' : 'var(--bad)';
}

export function GenderMark({ gender }: { gender: string }) {
  if (gender === 'M') return <span className="gender m">♂</span>;
  if (gender === 'F') return <span className="gender f">♀</span>;
  return null;
}

const STEPS = ['Sorteio', 'Montagem', 'Liga'];
export function Stepper({ step }: { step: number }) {
  return (
    <div className="stepper">
      {STEPS.map((s, i) => (
        <div key={s} className={`step ${i < step ? 'done' : i === step ? 'on' : ''}`}>
          <span className="step-ball" />
          {s}
        </div>
      ))}
    </div>
  );
}

export interface ComboOption {
  id: string;
  label: string;
  icon?: React.ReactNode;
  meta?: React.ReactNode; // à direita (poder, categoria...)
  desc?: string; // explicação mostrada na lista e no campo
  badge?: string; // destaque (ex.: "Mega!")
  disabled?: boolean;
  search?: string; // texto extra para a busca
}

/** Combobox com busca, ícones e explicação de cada opção. Usado para golpes, itens, natureza, habilidade e Tera. */
export function Combobox({
  value, options, onChange, placeholder = 'Escolher...', searchPlaceholder = 'Buscar...', clearable, emptySlot, tint,
}: {
  value: string;
  options: ComboOption[];
  onChange: (id: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  clearable?: string; // texto do botão de remover
  emptySlot?: React.ReactNode;
  tint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null);
  const current = options.find(o => o.id === value);

  // o popup vai para o <body> (portal): nunca fica atrás de outro painel nem é cortado por overflow
  useLayoutEffect(() => {
    if (!open) return;
    ref.current?.scrollIntoView({ block: 'nearest' });
    const place = () => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(Math.max(r.width, 340), window.innerWidth - 16);
      const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
      const below = window.innerHeight - r.bottom - 12;
      const above = r.top - 12;
      if (below >= 260 || below >= above) setPos({ left, width, top: r.bottom + 6, maxH: Math.max(160, below) });
      else setPos({ left, width, bottom: window.innerHeight - r.top + 6, maxH: Math.max(160, above) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter(o => `${o.label} ${o.search ?? ''} ${o.desc ?? ''}`.toLowerCase().includes(q))
    : options;

  return (
    <div className="combo" ref={ref}>
      <button
        type="button"
        className="combo-slot"
        title={current?.desc}
        style={tint ? { ['--tc' as string]: tint } : undefined}
        onClick={() => {
          setOpen(o => !o);
          setQuery('');
        }}
      >
        {current ? (
          <>
            {current.icon}
            <span className="combo-main">
              <b>
                {current.label}
                {current.badge && <em className="combo-badge">{current.badge}</em>}
              </b>
              {current.desc && <small>{current.desc}</small>}
            </span>
            {current.meta}
          </>
        ) : (
          emptySlot ?? <span className="muted">{placeholder}</span>
        )}
        <Icon name="chevron" size={16} className="combo-caret" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            className="combo-pop"
            style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: Math.min(pos.maxH, 440) }}
          >
            <input type="search" autoFocus placeholder={searchPlaceholder} value={query} onChange={e => setQuery(e.target.value)} />
            <div className="combo-list">
              {clearable && value && (
                <button
                  type="button"
                  className="combo-row clear"
                  onClick={() => {
                    onChange('');
                    setOpen(false);
                  }}
                >
                  {clearable}
                </button>
              )}
              {filtered.slice(0, 400).map(o => (
                <button
                  type="button"
                  key={o.id}
                  className={`combo-row ${o.id === value ? 'on' : ''}`}
                  disabled={o.disabled}
                  onClick={() => {
                    onChange(o.id);
                    setOpen(false);
                  }}
                >
                  {o.icon ?? <span />}
                  <span className="combo-row-main">
                    <span className="combo-row-name">
                      {o.label}
                      {o.badge && <em className="combo-badge">{o.badge}</em>}
                    </span>
                    {o.desc && <small>{o.desc}</small>}
                  </span>
                  {o.meta ?? <span />}
                </button>
              ))}
              {filtered.length === 0 && <span className="muted" style={{ padding: 10 }}>Nada encontrado</span>}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

export function ItemIcon({ name }: { name: string }) {
  const slug = name.toLowerCase().replace(/['’.]/g, '').replace(/\s+/g, '-');
  return (
    <img
      className="item-icon"
      alt=""
      src={`${config.itemIconsUrl}/${slug}.png`}
      onError={e => (e.currentTarget.style.visibility = 'hidden')}
    />
  );
}

/** Força do treinador: sempre 5 estrelas, preenchidas até o valor. */
export function Stars({ value }: { value: number }) {
  return (
    <span className="stars-static" aria-label={`Força ${value} de 5`}>
      {[1, 2, 3, 4, 5].map(n => (
        <i key={n} className={n <= value ? 'on' : ''}>★</i>
      ))}
    </span>
  );
}
