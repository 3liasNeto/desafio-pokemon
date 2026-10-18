import { useEffect, useState } from 'react';
import { config } from '../config';
import { pixPayload } from '../pix';
import { BrandMark } from './Brand';
import { Icon } from './icons';

/** Rodapé: autor/portfólio, doação por Pix e avisos legais. Cada item só aparece se estiver no .env. */
export function Footer() {
  const { authorName, portfolioUrl, pixKey, pixName, pixCity } = config;
  const [pixOpen, setPixOpen] = useState(false);
  const payload = pixKey && pixName && pixCity ? pixPayload(pixKey, pixName, pixCity) : '';

  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-brand">
          <BrandMark className="footer-mark" />
          <div>
            <b>Desafio Pokémon</b>
            <span className="muted">Fan game gratuito e sem fins lucrativos.</span>
          </div>
        </div>
        <div className="footer-links">
          {portfolioUrl && (
            <a className="btn" href={portfolioUrl} target="_blank" rel="noopener noreferrer me">
              <Icon name="users" size={16} /> {authorName ? `Feito por ${authorName}` : 'Portfólio'}
            </a>
          )}
          {!portfolioUrl && authorName && <span className="muted">Feito por {authorName}</span>}
          {pixKey && (
            <button className={`btn pix-btn ${pixOpen ? 'on' : ''}`} onClick={() => setPixOpen(v => !v)} aria-expanded={pixOpen}>
              <PixLogo /> Apoie com Pix
            </button>
          )}
        </div>
      </div>
      {pixOpen && pixKey && <PixPanel pixKey={pixKey} payload={payload} name={pixName} />}
      <p className="footer-legal">
        Pokémon e os nomes relacionados são marcas da Nintendo, Game Freak e The Pokémon Company. Este projeto não é afiliado a
        elas. Sprites do <a href="https://play.pokemonshowdown.com" target="_blank" rel="noopener noreferrer">Pokémon Showdown</a>,
        batalhas com <a href="https://github.com/pkmn/ps" target="_blank" rel="noopener noreferrer">@pkmn/sim</a> e dano calculado
        com <a href="https://github.com/smogon/damage-calc" target="_blank" rel="noopener noreferrer">@smogon/calc</a>.
      </p>
    </footer>
  );
}

function PixPanel({ pixKey, payload, name }: { pixKey: string; payload: string; name: string }) {
  const [copied, setCopied] = useState('');
  const [qr, setQr] = useState('');

  // o gerador de QR só é baixado quando alguém abre o painel
  useEffect(() => {
    if (!payload) return;
    let alive = true;
    void import('qrcode-generator').then(({ default: qrcode }) => {
      const code = qrcode(0, 'M');
      code.addData(payload);
      code.make();
      if (alive) setQr(code.createDataURL(6, 2));
    });
    return () => {
      alive = false;
    };
  }, [payload]);

  const copy = async (what: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(''), 1600);
    } catch {
      setCopied('');
    }
  };

  return (
    <section className="panel pix-panel" aria-label="Doação por Pix">
      {qr && <img className="pix-qr" src={qr} alt="QR Code do Pix para doação" width={180} height={180} />}
      <div className="pix-info">
        <b>Gostou do jogo? Qualquer valor ajuda a manter o site no ar.</b>
        {name && <span className="muted">Recebedor: {name}</span>}
        <div className="pix-row">
          <span className="pix-label">Chave</span>
          <code>{pixKey}</code>
          <button className="btn sm" onClick={() => copy('chave', pixKey)}>
            <Icon name={copied === 'chave' ? 'check' : 'copy'} size={14} /> {copied === 'chave' ? 'Copiada' : 'Copiar'}
          </button>
        </div>
        {payload && (
          <button className="btn primary" onClick={() => copy('payload', payload)}>
            <Icon name={copied === 'payload' ? 'check' : 'copy'} size={16} /> {copied === 'payload' ? 'Copiado!' : 'Copiar Pix copia e cola'}
          </button>
        )}
        <span className="muted small">
          {payload ? 'No app do banco: Pix → Ler QR Code ou Pix copia e cola. Você escolhe o valor.' : 'No app do banco: Pix → Transferir → cole a chave.'}
        </span>
      </div>
    </section>
  );
}

function PixLogo() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="icon">
      <path fill="#32bcad" d="M5.3 5.7a3 3 0 0 1 2.1.9l3.1 3.1a.7.7 0 0 0 1 0l3.1-3.1a3 3 0 0 1 2.1-.9h.4l-3.9-3.9a3.1 3.1 0 0 0-4.4 0L4.9 5.7h.4Zm11.4 12.6a3 3 0 0 1-2.1-.9l-3.1-3.1a.7.7 0 0 0-1 0l-3.1 3.1a3 3 0 0 1-2.1.9h-.4l3.9 3.9a3.1 3.1 0 0 0 4.4 0l3.9-3.9h-.4Zm2.1-11.4-2.3-.1h-.1a2 2 0 0 0-1.4.6l-3.1 3.1a1.7 1.7 0 0 1-2.4 0L6.4 7.4A2 2 0 0 0 5 6.8l-1.8.1-2.3 2.3a3.1 3.1 0 0 0 0 4.4l2.3 2.3 1.8.1a2 2 0 0 0 1.4-.6l3.1-3.1a1.7 1.7 0 0 1 2.4 0l3.1 3.1a2 2 0 0 0 1.4.6h.1l2.3-.1 2.3-2.3a3.1 3.1 0 0 0 0-4.4l-2.3-2.3Z" />
    </svg>
  );
}
