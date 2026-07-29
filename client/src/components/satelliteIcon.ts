/**
 * Marqueur en forme de satellite, dessiné sur un canvas puis exporté en PNG.
 *
 * Pourquoi pas un SVG en data-URI, qui serait plus court à écrire : un SVG sans
 * attributs `width`/`height` explicites n'a pas de dimensions intrinsèques, et
 * son chargement comme image est alors inégal selon les moteurs de rendu —
 * WebKit refuse purement et simplement. Un PNG produit par canvas se charge
 * partout de la même façon.
 *
 * L'image est dessinée en blanc sur fond transparent : Cesium multiplie la
 * texture par la couleur du marqueur, ce qui permet de teinter chaque objet selon
 * sa catégorie avec une seule texture — donc un seul appel de rendu pour toute la
 * collection.
 *
 * Le résultat est une chaîne constante : Cesium s'en sert de clé d'atlas, et une
 * clé unique garantit une seule entrée pour les 16 000 marqueurs. Passer
 * directement un canvas ferait générer un identifiant aléatoire par marqueur.
 */

/** Côté de la texture, en pixels. Puissance de 2, confortable pour l'atlas. */
const SIZE = 64;

/**
 * Décalage vertical de recentrage.
 *
 * Le dessin s'étend de y ≈ 6,5 (haut de l'antenne) à y = 43 (bas des panneaux),
 * soit un centre à 24,75 alors que le canvas a le sien à 32. Comme le marqueur
 * est ancré en son centre, laisser le dessin tel quel décalerait visuellement
 * chaque satellite d'environ 7 pixels vers le haut par rapport à sa position
 * réelle — un faux décalage, après tout le mal qu'on s'est donné à supprimer les
 * vrais.
 */
const CENTERING_OFFSET_Y = 7.25;

function drawSatellite(ctx: CanvasRenderingContext2D): void {
  ctx.translate(0, CENTERING_OFFSET_Y);
  ctx.fillStyle = '#ffffff';

  // Corps central.
  roundedRect(ctx, 27, 23, 10, 18, 2);
  ctx.fill();

  // Mâts reliant les panneaux au corps.
  ctx.fillRect(21, 30.5, 6, 3);
  ctx.fillRect(37, 30.5, 6, 3);

  // Panneaux solaires.
  roundedRect(ctx, 5, 21, 16, 22, 1.5);
  ctx.fill();
  roundedRect(ctx, 43, 21, 16, 22, 1.5);
  ctx.fill();

  // Mât et antenne parabolique.
  ctx.fillRect(30.5, 14, 3, 9);
  ctx.beginPath();
  ctx.ellipse(32, 11, 7.5, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Séparation des cellules photovoltaïques : quelques traits sombres qui
  // rendent les panneaux lisibles même à petite taille.
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(5, 32);
  ctx.lineTo(21, 32);
  ctx.moveTo(43, 32);
  ctx.lineTo(59, 32);
  ctx.moveTo(13, 21);
  ctx.lineTo(13, 43);
  ctx.moveTo(51, 21);
  ctx.lineTo(51, 43);
  ctx.stroke();
}

/** Rectangle à coins arrondis (`roundRect` n'est pas partout disponible). */
function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function buildIcon(): string {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;

  const ctx = canvas.getContext('2d');
  // Contexte 2D indisponible (cas très marginal) : on retombe sur un marqueur
  // vide, la collection de points restant de toute façon disponible.
  if (!ctx) return '';

  drawSatellite(ctx);
  return canvas.toDataURL('image/png');
}

/** Image du marqueur, prête à être passée à `billboard.image`. */
export const SATELLITE_ICON = buildIcon();
