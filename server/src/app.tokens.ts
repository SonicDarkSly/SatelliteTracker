/**
 * Tokens d'injection Nest pour les ports du domaine
 * (les interfaces TypeScript n'existant pas au runtime).
 */
export const TLE_SOURCES = Symbol('TLE_SOURCES');
export const METADATA_SOURCE = Symbol('METADATA_SOURCE');
export const CATALOG_CACHE_PORT = Symbol('CATALOG_CACHE_PORT');
