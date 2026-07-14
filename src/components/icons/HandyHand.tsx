// L'orbe « bille de verre » de Nova — identité de la marque.
// (Nom de fichier conservé pour ne pas casser les imports existants ;
//  le visuel est désormais l'orbe Nova, plus la main Handy.)
const HandyHand = ({
  width,
  height,
}: {
  width?: number | string;
  height?: number | string;
}) => (
  <svg
    width={width || 64}
    height={height || 64}
    viewBox="0 0 64 64"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <defs>
      <radialGradient id="novaOrb" cx="34%" cy="30%" r="78%">
        <stop offset="0%" stopColor="var(--orb-s0, #FFFFFF)" />
        <stop offset="18%" stopColor="var(--orb-s1, #DFE7FA)" />
        <stop offset="45%" stopColor="var(--orb-s2, #AEBEEC)" />
        <stop offset="72%" stopColor="var(--orb-s3, #93A6E0)" />
        <stop offset="100%" stopColor="var(--orb-s4, #7E92D6)" />
      </radialGradient>
      <radialGradient id="novaOrbHl" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
        <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
      </radialGradient>
    </defs>
    <circle cx="32" cy="32" r="30" fill="url(#novaOrb)" />
    <ellipse
      cx="25"
      cy="19"
      rx="11"
      ry="7"
      fill="url(#novaOrbHl)"
      transform="rotate(-18 25 19)"
    />
  </svg>
);

export default HandyHand;
