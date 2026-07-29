/**
 * Marqueurs en forme de satellite, dessinés sur canvas puis exportés en PNG.
 *
 * Plusieurs silhouettes plutôt qu'une seule : un étage de lanceur, une station
 * spatiale et un CubeSat n'ont rien de commun, et la forme du marqueur porte donc
 * une information utile. Le choix se fait d'après la famille calculée par le
 * serveur, avec repli sur les catégories.
 *
 * Pourquoi pas des SVG en data-URI, plus courts à écrire : un SVG sans attributs
 * `width`/`height` explicites n'a pas de dimensions intrinsèques et son
 * chargement comme image est inégal selon les moteurs — WebKit le refuse. Un PNG
 * produit par canvas se charge partout de la même façon.
 *
 * Chaque image est dessinée en blanc sur fond transparent : Cesium multiplie la
 * texture par la couleur du marqueur, ce qui permet de teinter selon la catégorie
 * sans dupliquer les textures. Les images sont des chaînes constantes, dont
 * Cesium se sert de clé d'atlas : une douzaine d'entrées pour 16 000 marqueurs.
 */
import type { SatelliteRecord } from '../types';

/** Silhouettes disponibles. */
export type IconShape =
  | 'iss'
  | 'station'
  | 'capsule'
  | 'flat'
  | 'nav'
  | 'dish'
  | 'observer'
  | 'telescope'
  | 'cube'
  | 'booster'
  | 'debris'
  | 'sphere'
  | 'default';

/** Côté de la texture, en pixels. */
const SIZE = 64;
const C = SIZE / 2;

/* ------------------------------------------------------------------ */
/* Primitives de dessin                                                */
/* ------------------------------------------------------------------ */

/** Rectangle à coins arrondis (`roundRect` n'est pas partout disponible). */
function rr(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 1.5,
): void {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

/** Panneau solaire : rectangle plein avec ses séparations de cellules. */
function panel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  rr(ctx, x, y, w, h, 1);
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.42)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + h / 2);
  ctx.lineTo(x + w, y + h / 2);
  if (w > 10) {
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w / 2, y + h);
  }
  ctx.stroke();
  ctx.restore();
}

/** Parabole vue de trois quarts. */
function dish(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number): void {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, rx * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
}

/* ------------------------------------------------------------------ */
/* Silhouettes                                                         */
/* ------------------------------------------------------------------ */

/**
 * Station spatiale internationale : longue poutre intégrée portant quatre paires
 * de panneaux solaires, radiateurs perpendiculaires, grappe de modules
 * pressurisés au centre. C'est la silhouette la plus reconnaissable du ciel, et
 * l'objet le plus visible à l'œil nu — elle mérite son propre marqueur.
 */
function drawIss(ctx: CanvasRenderingContext2D): void {
  ctx.fillRect(3, C - 1.5, 58, 3); // poutre principale (treillis intégré)

  // Quatre paires de panneaux solaires, les externes plus grandes.
  panel(ctx, 3, C - 14, 12, 11);
  panel(ctx, 3, C + 3, 12, 11);
  panel(ctx, 16, C - 12, 10, 9);
  panel(ctx, 16, C + 3, 10, 9);
  panel(ctx, 38, C - 12, 10, 9);
  panel(ctx, 38, C + 3, 10, 9);
  panel(ctx, 49, C - 14, 12, 11);
  panel(ctx, 49, C + 3, 12, 11);

  // Radiateurs thermiques, perpendiculaires aux panneaux.
  ctx.fillRect(C - 14, C - 6, 3, 12);
  ctx.fillRect(C + 11, C - 6, 3, 12);

  // Modules pressurisés : segment russe et américain, plus un module latéral.
  rr(ctx, C - 4, C - 11, 8, 24, 2.5);
  rr(ctx, C - 9, C - 3, 18, 7, 2);
}

/**
 * Station chinoise Tiangong : architecture en T, module central Tianhe et deux
 * laboratoires latéraux, une paire de panneaux chacun.
 */
function drawStation(ctx: CanvasRenderingContext2D): void {
  rr(ctx, C - 4, C - 14, 8, 30, 3); // module central
  rr(ctx, C - 16, C - 6, 32, 9, 3); // laboratoires latéraux
  panel(ctx, 4, C - 16, 13, 9);
  panel(ctx, 4, C + 6, 13, 9);
  panel(ctx, 47, C - 16, 13, 9);
  panel(ctx, 47, C + 6, 13, 9);
  ctx.fillRect(17, C - 12, 2, 7); // mâts des panneaux
  ctx.fillRect(45, C - 12, 2, 7);
  ctx.fillRect(17, C + 5, 2, 7);
  ctx.fillRect(45, C + 5, 2, 7);
}

/** Vaisseau de ravitaillement : nez conique, corps cylindrique, deux panneaux. */
function drawCapsule(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(C, 12);
  ctx.lineTo(C + 7, 24);
  ctx.lineTo(C - 7, 24);
  ctx.closePath();
  ctx.fill();
  rr(ctx, C - 7, 24, 14, 20, 2);
  panel(ctx, 8, C - 3, 14, 7);
  panel(ctx, 42, C - 3, 14, 7);
}

/** Satellite de constellation : corps plat et une seule aile (Starlink). */
function drawFlat(ctx: CanvasRenderingContext2D): void {
  rr(ctx, 18, C + 2, 28, 8, 2); // corps plat
  panel(ctx, 14, C - 18, 36, 16); // grande aile unique
  ctx.fillRect(C - 1, C - 2, 2, 4); // charnière
}

/** Satellite de navigation : corps cubique, deux panneaux, antennes vers la Terre. */
function drawNav(ctx: CanvasRenderingContext2D): void {
  rr(ctx, C - 8, C - 9, 16, 16, 2);
  panel(ctx, 4, C - 6, 18, 10);
  panel(ctx, 42, C - 6, 18, 10);
  // Grappe d'antennes hélicoïdales sous le satellite.
  for (const dx of [-4.5, 0, 4.5]) {
    ctx.fillRect(C + dx - 1, C + 7, 2, 8);
  }
  ctx.fillRect(C - 6, C + 14, 12, 2);
}

/** Relais géostationnaire : grande parabole et longs panneaux. */
function drawDish(ctx: CanvasRenderingContext2D): void {
  rr(ctx, C - 7, C - 4, 14, 16, 2);
  dish(ctx, C, C - 11, 10);
  ctx.fillRect(C - 1, C - 9, 2, 6);
  panel(ctx, 4, C + 1, 18, 9);
  panel(ctx, 42, C + 1, 18, 9);
}

/** Observation de la Terre : un long panneau, un instrument pointé vers le bas. */
function drawObserver(ctx: CanvasRenderingContext2D): void {
  rr(ctx, C - 6, C - 12, 12, 22, 2);
  panel(ctx, C + 7, C - 14, 22, 11); // panneau déployé d'un seul côté
  ctx.fillRect(C + 5, C - 9, 3, 2);
  // Instrument optique.
  ctx.beginPath();
  ctx.moveTo(C - 4, C + 10);
  ctx.lineTo(C + 4, C + 10);
  ctx.lineTo(C + 6, C + 17);
  ctx.lineTo(C - 6, C + 17);
  ctx.closePath();
  ctx.fill();
}

/** Télescope spatial : tube et pare-lumière (Hubble et consorts). */
function drawTelescope(ctx: CanvasRenderingContext2D): void {
  rr(ctx, C - 8, C - 16, 16, 30, 4); // tube
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.42)';
  ctx.lineWidth = 1.4;
  ctx.beginPath(); // ouverture
  ctx.moveTo(C - 7, C - 12);
  ctx.lineTo(C + 7, C - 12);
  ctx.stroke();
  ctx.restore();
  panel(ctx, C - 24, C - 8, 15, 14);
  panel(ctx, C + 9, C - 8, 15, 14);
}

/** CubeSat : petit cube et deux ailettes. */
function drawCube(ctx: CanvasRenderingContext2D): void {
  rr(ctx, C - 7, C - 7, 14, 14, 1.5);
  panel(ctx, C - 19, C - 4, 11, 8);
  panel(ctx, C + 8, C - 4, 11, 8);
  ctx.fillRect(C - 1, C - 15, 2, 8); // antenne fouet
}

/** Étage de lanceur : cylindre allongé et tuyère. */
function drawBooster(ctx: CanvasRenderingContext2D): void {
  rr(ctx, C - 6, 12, 12, 32, 3);
  ctx.beginPath(); // tuyère
  ctx.moveTo(C - 5, 44);
  ctx.lineTo(C + 5, 44);
  ctx.lineTo(C + 8, 52);
  ctx.lineTo(C - 8, 52);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.42)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(C - 5, 24);
  ctx.lineTo(C + 5, 24);
  ctx.moveTo(C - 5, 34);
  ctx.lineTo(C + 5, 34);
  ctx.stroke();
  ctx.restore();
}

/** Débris : fragment de forme irrégulière. */
function drawDebris(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(C - 10, C - 4);
  ctx.lineTo(C - 2, C - 12);
  ctx.lineTo(C + 8, C - 8);
  ctx.lineTo(C + 11, C + 3);
  ctx.lineTo(C + 2, C + 11);
  ctx.lineTo(C - 7, C + 7);
  ctx.closePath();
  ctx.fill();
}

/** Sphère de calibration : objet passif parfaitement sphérique. */
function drawSphere(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.arc(C, C, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(C, C, 11, 4, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Silhouette générique : corps, deux panneaux, une antenne. */
function drawDefault(ctx: CanvasRenderingContext2D): void {
  rr(ctx, C - 5, C - 6, 10, 18, 2);
  ctx.fillRect(C - 11, C + 0.5, 6, 3);
  ctx.fillRect(C + 5, C + 0.5, 6, 3);
  panel(ctx, C - 27, C - 9, 16, 22);
  panel(ctx, C + 11, C - 9, 16, 22);
  ctx.fillRect(C - 1.5, C - 15, 3, 9);
  dish(ctx, C, C - 17, 7.5);
}

const PAINTERS: Record<IconShape, (ctx: CanvasRenderingContext2D) => void> = {
  iss: drawIss,
  station: drawStation,
  capsule: drawCapsule,
  flat: drawFlat,
  nav: drawNav,
  dish: drawDish,
  observer: drawObserver,
  telescope: drawTelescope,
  cube: drawCube,
  booster: drawBooster,
  debris: drawDebris,
  sphere: drawSphere,
  default: drawDefault,
};

/* ------------------------------------------------------------------ */
/* Fabrication des textures                                            */
/* ------------------------------------------------------------------ */

/**
 * Rectangle englobant les pixels non transparents, ou `undefined` si vide.
 * Sert à recentrer automatiquement le dessin.
 */
function opaqueBounds(
  ctx: CanvasRenderingContext2D,
): { minX: number; minY: number; maxX: number; maxY: number } | undefined {
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
  let minX = SIZE;
  let minY = SIZE;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (data[(y * SIZE + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? undefined : { minX, minY, maxX, maxY };
}

/** Emprise visée par les silhouettes, sur les 64 px du cadre. */
const TARGET_EXTENT = 56;

/**
 * Fabrique la texture d'une silhouette : dessin, puis recentrage et mise à
 * l'échelle mesurés sur le résultat.
 *
 * Les deux corrections sont automatiques, et pas ajustées à la main, pour deux
 * raisons distinctes :
 *
 * — Le **recentrage** : un marqueur est ancré en son centre, donc un dessin
 *   décalé dans son cadre déplace visuellement le satellite par rapport à sa
 *   position réelle. Le calcul a rattrapé un décalage de 11 px sur la silhouette
 *   d'observation, dont le panneau ne s'étend que d'un côté.
 *
 * — La **mise à l'échelle** : les silhouettes n'occupent pas naturellement la
 *   même part de leur cadre — 52 px pour une station, 21 px pour un débris. Sans
 *   normalisation, un débris serait deux fois plus petit qu'une station à réglage
 *   de taille identique, alors que la taille du marqueur est une préférence
 *   d'affichage et non une échelle physique.
 */
function render(shape: IconShape): string {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;

  const ctx = canvas.getContext('2d');
  // Contexte 2D indisponible (cas très marginal) : marqueur vide, la collection
  // de points restant de toute façon disponible.
  if (!ctx) return '';

  ctx.fillStyle = '#ffffff';
  PAINTERS[shape](ctx);

  const bounds = opaqueBounds(ctx);
  if (bounds) {
    const width = bounds.maxX - bounds.minX + 1;
    const height = bounds.maxY - bounds.minY + 1;
    const scale = TARGET_EXTENT / Math.max(width, height);
    const cx = (bounds.minX + bounds.maxX + 1) / 2;
    const cy = (bounds.minY + bounds.maxY + 1) / 2;

    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.save();
    ctx.translate(C, C);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
    ctx.fillStyle = '#ffffff';
    PAINTERS[shape](ctx);
    ctx.restore();
  }

  return canvas.toDataURL('image/png');
}

/** Libellés FR des silhouettes, pour la légende. */
export const SHAPE_LABELS: Record<IconShape, string> = {
  iss: 'Station spatiale internationale',
  station: 'Station spatiale chinoise',
  capsule: 'Vaisseau de ravitaillement',
  flat: 'Constellation en orbite basse',
  nav: 'Navigation par satellite',
  dish: 'Télécommunications',
  observer: 'Observation de la Terre, météo',
  telescope: 'Télescope, observatoire',
  cube: 'CubeSat, nanosatellite',
  booster: 'Étage de lanceur',
  debris: 'Débris',
  sphere: 'Sphère de calibration',
  default: 'Autre ou non identifié',
};

/** Textures indexées par silhouette, construites une seule fois. */
export const SATELLITE_ICONS: Record<IconShape, string> = Object.fromEntries(
  (Object.keys(PAINTERS) as IconShape[]).map((shape) => [shape, render(shape)]),
) as Record<IconShape, string>;

/* ------------------------------------------------------------------ */
/* Association famille -> silhouette                                   */
/* ------------------------------------------------------------------ */

const SHAPE_BY_FAMILY: Record<string, IconShape> = {
  iss: 'iss',
  css: 'station',
  cargo: 'capsule',

  starlink: 'flat',
  oneweb: 'flat',
  kuiper: 'flat',
  iridium: 'flat',
  globalstar: 'flat',
  orbcomm: 'flat',

  gps: 'nav',
  galileo: 'nav',
  glonass: 'nav',
  beidou: 'nav',
  navic: 'nav',
  qzss: 'nav',

  geo_telecom: 'dish',
  mobile_satcom: 'dish',
  meteosat: 'dish',
  goes: 'dish',
  himawari: 'dish',

  noaa: 'observer',
  metop: 'observer',
  meteor: 'observer',
  fengyun: 'observer',
  dmsp: 'observer',
  sentinel: 'observer',
  landsat: 'observer',
  spot: 'observer',
  eos: 'observer',
  sar: 'observer',
  optical_commercial: 'observer',
  gaofen: 'observer',
  altimetry: 'observer',
  geodesy: 'observer',

  hubble: 'telescope',
  xray: 'telescope',
  exoplanets: 'telescope',
  magnetosphere: 'telescope',

  cubesat: 'cube',
  spire: 'cube',
  planet: 'cube',
  amateur: 'cube',
  tech_demo: 'cube',

  rocket_body: 'booster',
  debris: 'debris',
  calibration: 'sphere',
};

/**
 * Silhouette la plus représentative d'un objet.
 * La famille est prioritaire ; à défaut, on se rabat sur les catégories, puis sur
 * la nature de l'objet, et enfin sur une silhouette générique.
 */
export function shapeForSatellite(satellite: SatelliteRecord): IconShape {
  const byFamily = satellite.family ? SHAPE_BY_FAMILY[satellite.family] : undefined;
  if (byFamily) return byFamily;

  if (satellite.objectType === 'R/B') return 'booster';
  if (satellite.objectType === 'DEB') return 'debris';

  const categories = satellite.categories;
  if (categories.includes('rocket-body')) return 'booster';
  if (categories.includes('debris')) return 'debris';
  if (categories.includes('stations')) return 'station';
  if (categories.includes('cubesat')) return 'cube';
  if (categories.includes('navigation')) return 'nav';
  if (categories.includes('weather') || categories.includes('earth-observation')) {
    return 'observer';
  }
  if (categories.includes('science')) return 'telescope';
  if (categories.includes('communications')) return 'dish';

  return 'default';
}
