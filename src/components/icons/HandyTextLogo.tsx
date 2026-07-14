// Verrou de marque Nova : l'orbe « bille de verre » suivi du mot-symbole
// « Nova » dans la typo système Apple. (Nom de fichier conservé pour ne pas
// casser les imports existants.)
const HandyTextLogo = ({
  width,
  height,
  className,
}: {
  width?: number;
  height?: number;
  className?: string;
}) => {
  return (
    <svg
      width={width}
      height={height}
      className={className}
      viewBox="0 0 320 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Nova"
    >
      <defs>
        <radialGradient id="novaWmOrb" cx="34%" cy="30%" r="78%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="18%" stopColor="#DFE7FA" />
          <stop offset="45%" stopColor="#AEBEEC" />
          <stop offset="72%" stopColor="#93A6E0" />
          <stop offset="100%" stopColor="#7E92D6" />
        </radialGradient>
        <radialGradient id="novaWmHl" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="48" cy="48" r="34" fill="url(#novaWmOrb)" />
      <ellipse
        cx="39"
        cy="33"
        rx="12.5"
        ry="8"
        fill="url(#novaWmHl)"
        transform="rotate(-18 39 33)"
      />
      <text
        x="98"
        y="64"
        fill="currentColor"
        fontFamily='-apple-system, "SF Pro Display", "Segoe UI", Inter, system-ui, sans-serif'
        fontSize="58"
        fontWeight="600"
        letterSpacing="-2"
      >
        Nova
      </text>
    </svg>
  );
};

export default HandyTextLogo;
