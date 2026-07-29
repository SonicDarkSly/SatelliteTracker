/**
 * DOMAINE — catégorisation d'un objet en orbite d'après son nom de catalogue.
 *
 * Le catalogue public ne fournit pas de champ « mission » : la désignation est
 * la seule information disponible. Les règles ci-dessous sont ordonnées de la
 * plus spécifique à la plus générale ; un objet peut porter plusieurs
 * catégories (ex. un CubeSat scientifique).
 */
import type { CategoryId, OrbitRegime } from '../model/types.js';

interface Rule {
  readonly category: CategoryId;
  readonly pattern: RegExp;
}

const RULES: Rule[] = [
  { category: 'stations', pattern: /\b(ISS|ZARYA|CSS|TIANHE|WENTIAN|MENGTIAN|PROGRESS|CREW DRAGON|CYGNUS|SOYUZ|TIANZHOU)\b/i },
  { category: 'starlink', pattern: /STARLINK/i },
  { category: 'oneweb', pattern: /ONEWEB/i },
  { category: 'iridium', pattern: /IRIDIUM/i },
  { category: 'navigation', pattern: /\b(NAVSTAR|GPS|GALILEO|GSAT0|COSMOS 2(4|5)\d{2}|GLONASS|BEIDOU|NAVIC|IRNSS|QZS)\b/i },
  { category: 'weather', pattern: /\b(NOAA|METOP|METEOR|GOES|METEOSAT|HIMAWARI|FENGYUN|DMSP|ELEKTRO|INSAT|SUOMI|JPSS)\b/i },
  { category: 'earth-observation', pattern: /\b(SENTINEL|LANDSAT|SPOT|PLEIADES|TERRA|AQUA|WORLDVIEW|SKYSAT|PLANET|FLOCK|DOVE|ICEYE|CAPELLA|GAOFEN|KOMPSAT|CBERS|RADARSAT|TERRASAR|TANDEM-X|PAZ|SAOCOM)\b/i },
  { category: 'science', pattern: /\b(HUBBLE|HST|CHANDRA|XMM|SWIFT|FERMI|TESS|CHEOPS|GAIA|JWST|SOLAR|IXPE|NUSTAR|GRACE|SWARM|CLUSTER|THEMIS|MMS|CALIPSO|CLOUDSAT|ICESAT|JASON|AEOLUS|EARTHCARE)\b/i },
  { category: 'communications', pattern: /\b(INTELSAT|EUTELSAT|SES|ASTRA|HOTBIRD|VIASAT|INMARSAT|THURAYA|GLOBALSTAR|ORBCOMM|TELSTAR|ANIK|NILESAT|ARABSAT|TURKSAT|HISPASAT|AMOS|EXPRESS-A|YAMAL|CHINASAT|APSTAR|MEASAT|THAICOM|JCSAT|SUPERBIRD|OPTUS|SKY MUSTER|ECHOSTAR|DIRECTV|SPACEWAY|WILDBLUE|O3B|KUIPER|SES-\d)\b/i },
  { category: 'military', pattern: /\b(USA \d+|COSMOS \d+|YAOGAN|SHIJIAN|SJ-\d|OFEQ|RORSAT|NROL|MILSTAR|WGS|AEHF|SBIRS|GSSAP|KEYHOLE|LACROSSE|TOPAZ|MENTOR|TRUMPET|ORION)\b/i },
  { category: 'cubesat', pattern: /\b(CUBESAT|\d+U CUBESAT|LEMUR|SPIRE|KEPLER|SWARM-|TYVAK|FOSSASAT|SPACEBEE|UNISAT|ELFIN|QUBESAT|POLARSAT|BIRDS|SPROUT|CANX|AENEAS|OPS-SAT|NANOSAT|PICOSAT)\b/i },
  { category: 'rocket-body', pattern: /\bR\/B\b|ROCKET BODY|\bAKM\b|\bPKM\b|CENTAUR|BREEZE|BRIZ|FREGAT|ARIANE.*DEB|H-2A R\/B/i },
  { category: 'debris', pattern: /\bDEB\b|DEBRIS|FRAGMENT|SHROUD|COVER|PLATE|ADAPTER|WESTFORD NEEDLE/i },
];

/**
 * @param name désignation du catalogue (ligne 0 du TLE)
 * @param regime régime orbital calculé — sert de repli pour les objets non identifiés
 */
export function classifySatellite(name: string, regime: OrbitRegime): CategoryId[] {
  const found = new Set<CategoryId>();

  for (const rule of RULES) {
    if (rule.pattern.test(name)) found.add(rule.category);
  }

  // Un débris ou un étage n'est pas une charge utile : on retire les catégories
  // de mission qui auraient pu être déduites du nom de la mission d'origine.
  if (found.has('debris') || found.has('rocket-body')) {
    for (const c of [...found]) {
      if (c !== 'debris' && c !== 'rocket-body') found.delete(c);
    }
  }

  // Un satellite géostationnaire non identifié est presque toujours un relais télécom.
  if (found.size === 0 && regime === 'GEO') found.add('communications');
  if (found.size === 0) found.add('other');

  return [...found];
}
