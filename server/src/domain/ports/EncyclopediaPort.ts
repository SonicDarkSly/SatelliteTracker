/** Notice encyclopédique d'un sujet. */
export interface EncyclopediaEntry {
  readonly title: string;
  /** Résumé en texte brut, quelques phrases. */
  readonly extract: string;
  /** Lien vers l'article complet. */
  readonly url: string;
  /** Attribution et licence, à afficher avec le texte. */
  readonly attribution: string;
}

/**
 * PORT — source de notices encyclopédiques.
 * Utilisée pour compléter la description interne d'une famille par un article de
 * référence, à la demande (quand l'utilisateur sélectionne un objet).
 */
export interface EncyclopediaPort {
  lookup(title: string): Promise<EncyclopediaEntry | undefined>;
}
