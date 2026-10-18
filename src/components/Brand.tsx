import { publicAsset } from '../config';

/** A mesma insígnia em todos os pontos de contato da marca. */
export function BrandMark({ className = '' }: { className?: string }) {
  return <img className={`brand-mark ${className}`} src={publicAsset('brand-mark.svg')} width="128" height="144" alt="" aria-hidden="true" />;
}

export function Brand() {
  return (
    <span className="brand-lockup">
      <BrandMark />
      <span className="brand-wordmark"><span>DESAFIO</span><strong>Pokémon<span className="brand-dot">.</span></strong></span>
    </span>
  );
}
