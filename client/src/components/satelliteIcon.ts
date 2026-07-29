/**
 * Icône de satellite utilisée comme marqueur sur le globe.
 *
 * Dessinée en blanc sur fond transparent : Cesium multiplie la texture par la
 * couleur du marqueur, ce qui permet de la teinter selon la catégorie de l'objet
 * avec une seule image (donc un seul appel de rendu pour toute la collection).
 *
 * Elle est fournie sous forme de data-URI plutôt que de fichier : pas de requête
 * réseau, pas d'asset à copier au build, et le rendu est disponible dès la
 * première image.
 */

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <g fill="#ffffff">
    <!-- corps central -->
    <rect x="27" y="24" width="10" height="16" rx="2"/>
    <!-- mâts des panneaux -->
    <rect x="21" y="30.5" width="6" height="3"/>
    <rect x="37" y="30.5" width="6" height="3"/>
    <!-- panneaux solaires -->
    <rect x="6" y="22" width="15" height="20" rx="1.5"/>
    <rect x="43" y="22" width="15" height="20" rx="1.5"/>
    <!-- antenne parabolique et son mât -->
    <rect x="30.5" y="15" width="3" height="9"/>
    <ellipse cx="32" cy="12" rx="7" ry="4"/>
  </g>
  <!-- séparations des cellules photovoltaïques, en négatif -->
  <g stroke="#000000" stroke-opacity="0.35" stroke-width="1">
    <line x1="6" y1="32" x2="21" y2="32"/>
    <line x1="43" y1="32" x2="58" y2="32"/>
    <line x1="13.5" y1="22" x2="13.5" y2="42"/>
    <line x1="50.5" y1="22" x2="50.5" y2="42"/>
  </g>
</svg>`;

/**
 * Data-URI prêt à être passé à `billboard.image`.
 * Encodage par pourcentage plutôt que base64 : `btoa` refuse tout caractère
 * hors Latin-1, ce qui rendrait l'icône dépendante des accents des commentaires.
 */
export const SATELLITE_ICON = `data:image/svg+xml,${encodeURIComponent(SVG)}`;
