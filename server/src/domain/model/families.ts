/**
 * DOMAINE — familles d'objets en orbite et description de leur rôle.
 *
 * Le catalogue public ne contient aucune description : seulement un nom, un
 * numéro et des éléments orbitaux. La quasi-totalité des objets appartient
 * pourtant à une famille identifiable par sa désignation (constellation,
 * programme, série) — et connaître la famille suffit à expliquer à quoi sert
 * l'objet.
 *
 * Les descriptions sont envoyées une seule fois par instantané, sous forme de
 * dictionnaire, et non recopiées sur chacun des 16 000 enregistrements : le
 * catalogue pèserait 3 Mo de plus pour la même information.
 *
 * Les ordres de grandeur cités (altitudes, périodes) sont des valeurs nominales
 * de service, arrondies.
 */

export interface SatelliteFamily {
  readonly id: string;
  /** Nom lisible de la famille. */
  readonly label: string;
  /** À quoi servent ces objets, en français. */
  readonly description: string;
  /** Exploitant ou programme responsable. */
  readonly operator?: string;
  /** Titre de l'article Wikipédia francophone, pour la notice détaillée. */
  readonly wikipedia?: string;
}

export const FAMILIES: Record<string, SatelliteFamily> = {
  /* ------------------------------ stations ------------------------------ */
  iss: {
    id: 'iss',
    label: 'Station spatiale internationale',
    description:
      "Laboratoire habité en permanence depuis 2000, en orbite basse vers 400 km d'altitude avec une inclinaison de 51,6°. Elle sert de plateforme de recherche en microgravité (biologie, physique des fluides, science des matériaux) et de banc d'essai pour les vols habités de longue durée. Elle boucle un tour de Terre en environ 92 minutes, soit 16 levers de Soleil par jour.",
    operator: 'NASA, Roscosmos, ESA, JAXA, CSA',
    wikipedia: 'Station spatiale internationale',
  },
  css: {
    id: 'css',
    label: 'Station spatiale chinoise Tiangong',
    description:
      "Station habitée chinoise assemblée entre 2021 et 2022 autour du module Tianhe, complété par les laboratoires Wentian et Mengtian. Elle occupe une orbite basse voisine de celle de l'ISS et accueille des équipages de trois astronautes pour des séjours de six mois.",
    operator: 'Agence spatiale chinoise (CMSA)',
    wikipedia: 'Station spatiale chinoise',
  },
  cargo: {
    id: 'cargo',
    label: 'Véhicule de ravitaillement',
    description:
      "Cargo automatique ou vaisseau habité assurant la desserte d'une station spatiale : fret, eau, ergols, expériences, et retour ou destruction des déchets. Ces objets ne restent au catalogue que le temps de leur mission, de quelques semaines à quelques mois.",
  },

  /* --------------------------- constellations --------------------------- */
  starlink: {
    id: 'starlink',
    label: 'Starlink',
    description:
      "Constellation d'accès à internet par satellite exploitée par SpaceX, la plus nombreuse jamais déployée. Les satellites opèrent en orbite basse vers 550 km, ce qui réduit fortement la latence par rapport aux relais géostationnaires, au prix d'un très grand nombre d'engins pour couvrir le globe en continu.",
    operator: 'SpaceX',
    wikipedia: 'Starlink',
  },
  oneweb: {
    id: 'oneweb',
    label: 'OneWeb',
    description:
      "Constellation d'accès à internet en orbite basse (environ 1 200 km), conçue pour desservir en priorité les zones mal raccordées, l'aviation et le maritime. Exploitée par Eutelsat OneWeb depuis la fusion des deux opérateurs en 2023.",
    operator: 'Eutelsat OneWeb',
    wikipedia: 'OneWeb',
  },
  kuiper: {
    id: 'kuiper',
    label: 'Projet Kuiper',
    description:
      "Constellation d'accès à internet en orbite basse développée par Amazon, en cours de déploiement. Même principe que ses concurrentes : de nombreux satellites peu élevés pour offrir un débit élevé à faible latence.",
    operator: 'Amazon',
    wikipedia: 'Projet Kuiper',
  },
  iridium: {
    id: 'iridium',
    label: 'Iridium NEXT',
    description:
      "Constellation de téléphonie et de transmission de données par satellite, à 780 km d'altitude sur six plans polaires. Particularité : les satellites communiquent entre eux par liaisons inter-satellites, ce qui permet une couverture réellement mondiale, pôles compris, sans station au sol à portée.",
    operator: 'Iridium Communications',
    wikipedia: 'Iridium (télécommunications)',
  },
  globalstar: {
    id: 'globalstar',
    label: 'Globalstar',
    description:
      "Constellation de téléphonie satellitaire et de données en orbite basse. Contrairement à Iridium, les satellites relaient simplement le signal vers une station au sol visible en même temps que l'utilisateur, ce qui limite la couverture aux régions équipées de passerelles.",
    operator: 'Globalstar',
    wikipedia: 'Globalstar',
  },
  orbcomm: {
    id: 'orbcomm',
    label: 'ORBCOMM',
    description:
      "Constellation dédiée aux communications de machine à machine et à l'internet des objets : suivi de flottes, de conteneurs, de matériel agricole, relevé de capteurs isolés. Les messages sont courts et le débit modeste, ce qui autorise de petits satellites.",
    operator: 'ORBCOMM',
  },
  spire: {
    id: 'spire',
    label: 'Lemur / Spire',
    description:
      "Flotte de nanosatellites (format CubeSat 3U) captant les signaux d'identification des navires et des avions, et sondant l'atmosphère par radio-occultation des signaux GNSS pour alimenter les modèles météorologiques.",
    operator: 'Spire Global',
  },
  planet: {
    id: 'planet',
    label: 'Flock / Planet',
    description:
      "Flotte de nanosatellites d'imagerie optique (« Doves ») assurant une couverture quotidienne des terres émergées à quelques mètres de résolution. Usages : agriculture, suivi de la déforestation, cartographie, veille d'événements.",
    operator: 'Planet Labs',
  },

  /* ---------------------------- navigation ----------------------------- */
  gps: {
    id: 'gps',
    label: 'GPS (NAVSTAR)',
    description:
      "Système de positionnement par satellite américain. Les satellites occupent une orbite moyenne vers 20 200 km et bouclent un tour en 12 heures environ. Chaque engin diffuse en continu l'heure d'une horloge atomique et sa position : un récepteur qui en capte au moins quatre en déduit sa position et l'heure exacte.",
    operator: 'US Space Force',
    wikipedia: 'Global Positioning System',
  },
  galileo: {
    id: 'galileo',
    label: 'Galileo',
    description:
      "Système de navigation par satellite européen, civil et indépendant du GPS, à environ 23 200 km d'altitude. Il fournit un service ouvert gratuit, un service d'authentification et un service public réglementé, ainsi qu'une fonction de relais des balises de détresse.",
    operator: 'Union européenne / ESA',
    wikipedia: 'Galileo (système de positionnement)',
  },
  glonass: {
    id: 'glonass',
    label: 'GLONASS',
    description:
      "Système de navigation par satellite russe, à environ 19 100 km d'altitude. Son inclinaison plus forte que celle du GPS lui donne une bonne visibilité aux hautes latitudes. La plupart des récepteurs modernes combinent GPS, GLONASS, Galileo et BeiDou.",
    operator: 'Roscosmos / Forces spatiales russes',
    wikipedia: 'GLONASS',
  },
  beidou: {
    id: 'beidou',
    label: 'BeiDou',
    description:
      "Système de navigation par satellite chinois, achevé en 2020. Il combine des satellites en orbite moyenne, géostationnaire et géosynchrone inclinée, cette dernière améliorant la couverture de l'Asie et le service de messages courts.",
    operator: 'Chine',
    wikipedia: 'Beidou (système de positionnement)',
  },
  navic: {
    id: 'navic',
    label: 'NavIC / IRNSS',
    description:
      "Système de navigation régional indien couvrant le sous-continent et ses environs, à partir de satellites géostationnaires et géosynchrones inclinés plutôt que d'une constellation mondiale.",
    operator: 'ISRO',
  },
  qzss: {
    id: 'qzss',
    label: 'QZSS (Michibiki)',
    description:
      "Système japonais d'augmentation du GPS. Ses satellites suivent des orbites géosynchrones très inclinées qui les maintiennent longtemps au zénith du Japon, améliorant la réception dans les rues encaissées des grandes villes.",
    operator: 'JAXA / Cabinet Office japonais',
  },

  /* ------------------------------- météo ------------------------------- */
  noaa: {
    id: 'noaa',
    label: 'NOAA (orbite polaire)',
    description:
      "Satellites météorologiques américains en orbite polaire héliosynchrone vers 850 km : ils survolent chaque point du globe à heure solaire fixe, deux fois par jour. Leurs images infrarouge et visible et leurs sondages de température alimentent les modèles de prévision. Leur signal APT/HRPT est réputé chez les radioamateurs.",
    operator: 'NOAA',
    wikipedia: 'National Oceanic and Atmospheric Administration',
  },
  metop: {
    id: 'metop',
    label: 'MetOp',
    description:
      "Satellites météorologiques européens en orbite polaire, volet européen d'un partenariat avec la NOAA : l'Europe assure l'orbite du matin, les États-Unis celle de l'après-midi. Ils embarquent des sondeurs qui comptent parmi les instruments les plus utiles à la prévision numérique.",
    operator: 'EUMETSAT / ESA',
    wikipedia: 'MetOp',
  },
  goes: {
    id: 'goes',
    label: 'GOES',
    description:
      "Satellites météorologiques géostationnaires américains, postés à 35 786 km au-dessus de l'équateur. Immobiles par rapport au sol, ils filment en continu le même disque terrestre — d'où les images animées de cyclones — et surveillent aussi l'activité solaire et les éclairs.",
    operator: 'NOAA / NASA',
    wikipedia: 'Geostationary Operational Environmental Satellite',
  },
  meteosat: {
    id: 'meteosat',
    label: 'Meteosat',
    description:
      "Satellites météorologiques géostationnaires européens couvrant l'Europe, l'Afrique et l'océan Indien. Ce sont eux qui fournissent les images de la couverture nuageuse diffusées dans les bulletins météo européens.",
    operator: 'EUMETSAT',
    wikipedia: 'Meteosat',
  },
  himawari: {
    id: 'himawari',
    label: 'Himawari',
    description:
      "Satellites météorologiques géostationnaires japonais couvrant l'Asie de l'Est et le Pacifique occidental, zone de formation des typhons.",
    operator: 'Agence météorologique japonaise',
  },
  fengyun: {
    id: 'fengyun',
    label: 'Fengyun',
    description:
      "Série météorologique chinoise, déclinée en versions polaires et géostationnaires. Certains satellites Fengyun retirés du service sont à l'origine d'une part importante des débris catalogués en orbite basse, après un essai antisatellite en 2007.",
    operator: 'Chine',
  },
  meteor: {
    id: 'meteor',
    label: 'Meteor / Elektro',
    description:
      "Satellites météorologiques russes, en orbite polaire pour la série Meteor et géostationnaire pour Elektro-L.",
    operator: 'Roscosmos / Roshydromet',
  },
  dmsp: {
    id: 'dmsp',
    label: 'DMSP',
    description:
      "Satellites météorologiques militaires américains en orbite polaire. Leur imageur nocturne, sensible aux lumières artificielles, a longtemps servi à cartographier l'urbanisation et la pollution lumineuse.",
    operator: 'US Space Force',
  },

  /* ----------------------- observation de la Terre ---------------------- */
  sentinel: {
    id: 'sentinel',
    label: 'Sentinel (Copernicus)',
    description:
      "Satellites d'observation de la Terre du programme européen Copernicus, dont les données sont libres et gratuites. Chaque série a sa spécialité : radar toute saison pour Sentinel-1, imagerie optique multispectrale pour Sentinel-2, océan et surfaces terrestres pour Sentinel-3, qualité de l'air pour Sentinel-5P.",
    operator: 'ESA / Union européenne',
    wikipedia: 'Programme Copernicus',
  },
  landsat: {
    id: 'landsat',
    label: 'Landsat',
    description:
      "Plus longue série d'observation continue de la Terre, entamée en 1972. Ses images permettent de comparer l'état d'un territoire sur un demi-siècle : recul des glaciers, étalement urbain, évolution des cultures et des forêts.",
    operator: 'NASA / USGS',
    wikipedia: 'Programme Landsat',
  },
  spot: {
    id: 'spot',
    label: 'SPOT / Pléiades',
    description:
      "Satellites français d'imagerie optique. SPOT assure une couverture large à résolution moyenne, Pléiades fournit des vues à très haute résolution, orientables sur commande pour observer un site précis.",
    operator: 'CNES / Airbus Defence and Space',
    wikipedia: 'Pléiades (satellite)',
  },
  eos: {
    id: 'eos',
    label: 'Terra / Aqua (EOS)',
    description:
      "Grands observatoires du système Terre de la NASA. Terra observe le matin, Aqua l'après-midi ; leurs instruments suivent la végétation, les nuages, les aérosols, les incendies, la température de surface et le cycle de l'eau à l'échelle planétaire.",
    operator: 'NASA',
  },
  sar: {
    id: 'sar',
    label: 'Imagerie radar (SAR)',
    description:
      "Satellites à radar à synthèse d'ouverture : ils éclairent le sol avec leur propre onde radio et voient donc de nuit comme à travers les nuages. Usages : surveillance maritime, suivi des inondations et des glaces, mesure des déformations du sol au millimètre par interférométrie.",
  },
  optical_commercial: {
    id: 'optical_commercial',
    label: 'Imagerie optique commerciale',
    description:
      "Satellites d'observation exploités commercialement, à haute ou très haute résolution, orientables pour photographier un lieu à la demande. Ils alimentent les fonds cartographiques, l'assurance, l'agriculture et la presse.",
  },
  gaofen: {
    id: 'gaofen',
    label: 'Gaofen',
    description:
      "Série chinoise d'observation de la Terre à haute résolution, optique et radar, dédiée à la cartographie, à l'agriculture et à la gestion des catastrophes.",
    operator: 'Chine',
  },

  /* ------------------------------ science ------------------------------ */
  hubble: {
    id: 'hubble',
    label: 'Télescope spatial Hubble',
    description:
      "Télescope optique et ultraviolet de 2,4 m de diamètre en orbite basse depuis 1990, entretenu par cinq missions de navette. Affranchi de la turbulence atmosphérique, il a mesuré l'expansion de l'Univers, observé la formation des galaxies et livré les images les plus célèbres de l'astronomie moderne.",
    operator: 'NASA / ESA',
    wikipedia: 'Hubble (télescope spatial)',
  },
  xray: {
    id: 'xray',
    label: 'Observatoire à haute énergie',
    description:
      "Télescope à rayons X ou gamma. Ces rayonnements sont arrêtés par l'atmosphère et ne peuvent s'observer que depuis l'espace : ils révèlent les trous noirs, les étoiles à neutrons, les restes de supernova et les sursauts gamma.",
  },
  exoplanets: {
    id: 'exoplanets',
    label: 'Recherche d’exoplanètes',
    description:
      "Télescope dédié à la détection et à la caractérisation de planètes hors du Système solaire, généralement par la méthode des transits : la baisse infime de luminosité d'une étoile quand une planète passe devant elle.",
  },
  geodesy: {
    id: 'geodesy',
    label: 'Géodésie et champs terrestres',
    description:
      "Satellites mesurant les champs physiques de la Terre : gravité (donc masse des nappes d'eau et des glaces), champ magnétique, ou forme précise du géoïde. Ils servent de référence à la géodésie et au suivi du changement climatique.",
  },
  altimetry: {
    id: 'altimetry',
    label: 'Altimétrie océanique',
    description:
      "Satellites mesurant la hauteur de la mer au centimètre par radar. Ils fournissent la référence de l'élévation du niveau des océans, suivent les courants, les tourbillons et les épisodes El Niño.",
  },
  magnetosphere: {
    id: 'magnetosphere',
    label: 'Physique de la magnétosphère',
    description:
      "Satellites étudiant l'interaction entre le vent solaire et le champ magnétique terrestre : reconnexion magnétique, ceintures de radiation, aurores et orages géomagnétiques susceptibles de perturber réseaux électriques et satellites.",
  },

  /* --------------------------- télécom civile --------------------------- */
  geo_telecom: {
    id: 'geo_telecom',
    label: 'Télécommunications géostationnaires',
    description:
      "Relais de télécommunications posté à 35 786 km au-dessus de l'équateur. À cette altitude, la période orbitale égale la durée du jour : le satellite paraît immobile, ce qui permet de le viser avec une antenne fixe. C'est le principe de la télévision par satellite et des liaisons de données régionales.",
    wikipedia: 'Satellite de télécommunications',
  },
  mobile_satcom: {
    id: 'mobile_satcom',
    label: 'Communications mobiles par satellite',
    description:
      "Satellites desservant des terminaux mobiles : téléphones satellitaires, navires, avions, secours en zone sinistrée. Leurs grandes antennes compensent la faible puissance des terminaux au sol.",
  },
  amateur: {
    id: 'amateur',
    label: 'Radioamateur',
    description:
      "Satellite construit et exploité par la communauté radioamateur, souvent par des universités. Il embarque un répéteur permettant à deux stations éloignées de dialoguer pendant le passage, et sert de support pédagogique.",
    wikipedia: 'Satellite radioamateur',
  },

  /* --------------------------- militaire, autres ------------------------ */
  military: {
    id: 'military',
    label: 'Militaire ou renseignement',
    description:
      "Satellite militaire ou de renseignement : reconnaissance optique ou radar, écoute électronique, alerte avancée aux tirs de missiles, ou télécommunications sécurisées. Leur mission n'est généralement pas rendue publique ; seules les orbites, suivies par des observateurs, permettent d'en deviner la nature.",
  },
  cosmos: {
    id: 'cosmos',
    label: 'Cosmos',
    description:
      "Désignation générique employée depuis 1962 pour la plupart des satellites soviétiques puis russes, toutes missions confondues : militaires, scientifiques, navigation, essais technologiques. Le nom seul ne dit donc rien de la mission.",
    wikipedia: 'Programme Cosmos',
  },
  tech_demo: {
    id: 'tech_demo',
    label: 'Démonstration technologique',
    description:
      "Satellite servant à qualifier en vol une technologie nouvelle — propulsion, optique, liaison laser, désorbitation, calcul embarqué — avant son emploi sur une mission opérationnelle.",
  },
  cubesat: {
    id: 'cubesat',
    label: 'CubeSat / nanosatellite',
    description:
      "Petit satellite bâti sur un format normalisé de cubes de 10 cm (1U), de 1 à 12U. Sa standardisation a fait chuter les coûts et ouvert l'accès à l'orbite aux universités, aux jeunes entreprises et aux pays sans programme spatial. Missions typiques : observation, radioamateur, capteurs, formation.",
    wikipedia: 'CubeSat',
  },

  /* ------------------------ objets non fonctionnels --------------------- */
  rocket_body: {
    id: 'rocket_body',
    label: 'Étage de lanceur',
    description:
      "Étage supérieur ou structure de lanceur resté en orbite après la mise à poste de sa charge utile. Ce sont les plus gros objets du catalogue et les plus préoccupants pour la sécurité orbitale : la rupture d'un réservoir résiduel peut engendrer des milliers de fragments d'un coup.",
    wikipedia: 'Débris spatial',
  },
  debris: {
    id: 'debris',
    label: 'Débris spatial',
    description:
      "Fragment issu d'une explosion, d'une collision ou de la dégradation d'un engin : morceau de structure, coiffe, boulon, écaille de peinture. À 7 ou 8 km/s, un éclat centimétrique suffit à détruire un satellite. Le catalogue n'en recense qu'une petite partie, celle dont la taille permet un suivi radar.",
    wikipedia: 'Débris spatial',
  },
  unidentified: {
    id: 'unidentified',
    label: 'Objet non identifié',
    description:
      "Objet suivi par les radars de surveillance spatiale mais dont la mission n'est pas publique, ou dont la désignation ne permet pas de le rattacher à un programme connu. Le catalogue public se limite parfois à un numéro et à une orbite : c'est le cas de nombreux objets militaires, de charges secondaires et de fragments non identifiés.",
  },
  calibration: {
    id: 'calibration',
    label: 'Sphère de calibration',
    description:
      "Sphère métallique passive, sans électronique, placée en orbite pour étalonner les radars de surveillance spatiale ou mesurer la densité de la haute atmosphère par la décroissance de son orbite. Certaines volent depuis les années 1960.",
  },
};

/**
 * Règles d'identification, de la plus spécifique à la plus générale : la
 * première correspondance gagne.
 */
export const FAMILY_RULES: { readonly family: string; readonly pattern: RegExp }[] = [
  { family: 'iss', pattern: /\b(ISS|ZARYA|UNITY|NAUKA|ZVEZDA)\b/i },
  { family: 'css', pattern: /\b(CSS|TIANHE|WENTIAN|MENGTIAN)\b/i },
  {
    family: 'cargo',
    pattern: /\b(PROGRESS|CYGNUS|DRAGON|TIANZHOU|SOYUZ-MS|HTV|CREW)\b/i,
  },
  { family: 'starlink', pattern: /STARLINK/i },
  { family: 'oneweb', pattern: /ONEWEB/i },
  { family: 'kuiper', pattern: /KUIPER/i },
  { family: 'iridium', pattern: /IRIDIUM/i },
  { family: 'globalstar', pattern: /GLOBALSTAR/i },
  { family: 'orbcomm', pattern: /ORBCOMM/i },
  { family: 'spire', pattern: /\b(LEMUR|SPIRE)\b/i },
  { family: 'planet', pattern: /\b(FLOCK|DOVE|SKYSAT|PLANETSCOPE)\b/i },

  { family: 'gps', pattern: /\b(NAVSTAR|GPS)\b/i },
  // Attention aux `\b` en fin de motif : « GSAT0\d\b » ne matche pas « GSAT0224 »
  // (la frontière de mot ne peut pas tomber entre deux chiffres). D'où les `\d+`.
  { family: 'galileo', pattern: /\b(GALILEO|GSAT0\d+)\b/i },
  { family: 'glonass', pattern: /GLONASS/i },
  { family: 'beidou', pattern: /BEIDOU/i },
  { family: 'navic', pattern: /\b(NAVIC|IRNSS)\b/i },
  { family: 'qzss', pattern: /\b(QZS|MICHIBIKI)\b/i },

  { family: 'noaa', pattern: /\b(NOAA|SUOMI|NPP|JPSS)\b/i },
  { family: 'metop', pattern: /METOP/i },
  { family: 'goes', pattern: /\bGOES\b/i },
  { family: 'meteosat', pattern: /\b(METEOSAT|MSG-\d+|MTG)\b/i },
  { family: 'himawari', pattern: /HIMAWARI/i },
  { family: 'fengyun', pattern: /\b(FENGYUN|FY-?\d+)\b/i },
  { family: 'meteor', pattern: /\b(METEOR|ELEKTRO)\b/i },
  { family: 'dmsp', pattern: /DMSP/i },

  { family: 'sentinel', pattern: /SENTINEL/i },
  { family: 'landsat', pattern: /LANDSAT/i },
  { family: 'spot', pattern: /\b(SPOT \d+|PLEIADES)\b/i },
  { family: 'eos', pattern: /\b(TERRA|AQUA|AURA)\b/i },
  {
    family: 'sar',
    pattern: /\b(ICEYE|CAPELLA|TERRASAR|TANDEM-X|RADARSAT|SAOCOM|PAZ|COSMO-SKYMED|UMBRA)\b/i,
  },
  { family: 'optical_commercial', pattern: /\b(WORLDVIEW|GEOEYE|IKONOS|KOMPSAT|CBERS|PLEIADES NEO|SUPERVIEW|JILIN)\b/i },
  { family: 'gaofen', pattern: /GAOFEN/i },

  { family: 'hubble', pattern: /\b(HST|HUBBLE)\b/i },
  { family: 'xray', pattern: /\b(CHANDRA|XMM|SWIFT|FERMI|NUSTAR|IXPE|INTEGRAL|SPEKTR-RG|EINSTEIN PROBE)\b/i },
  { family: 'exoplanets', pattern: /\b(TESS|CHEOPS|PLATO|ARIEL|KEPLER SPACE)\b/i },
  { family: 'geodesy', pattern: /\b(GRACE|SWARM|GOCE|CHAMP|LAGEOS|STARLETTE|ETALON)\b/i },
  { family: 'altimetry', pattern: /\b(JASON|SENTINEL-6|SWOT|CRYOSAT|ICESAT)\b/i },
  { family: 'magnetosphere', pattern: /\b(CLUSTER|THEMIS|MMS|VAN ALLEN|ARASE|SOLAR ORBITER)\b/i },

  {
    family: 'amateur',
    pattern: /\b(OSCAR|AO-\d+|SO-\d+|FO-\d+|CAS-\d+|XW-\d+|HO-\d+|LILACSAT|FUNCUBE)\b/i,
  },
  {
    family: 'mobile_satcom',
    pattern: /\b(INMARSAT|THURAYA|ICO|ACES|GARUDA|SKYTERRA|TERRESTAR|VIASAT|JUPITER)\b/i,
  },
  {
    family: 'geo_telecom',
    pattern:
      /\b(INTELSAT|EUTELSAT|SES-\d+|ASTRA|HOTBIRD|TELSTAR|ANIK|NILESAT|ARABSAT|TURKSAT|HISPASAT|AMOS|EXPRESS-A|YAMAL|CHINASAT|APSTAR|MEASAT|THAICOM|JCSAT|SUPERBIRD|OPTUS|ECHOSTAR|DIRECTV|BADR|PAKSAT|KOREASAT|BSAT|GALAXY)\b/i,
  },

  { family: 'calibration', pattern: /\b(CALSPHERE|LCS \d+|SURCAL|TEMPSAT|OV1|RADCAL)\b/i },
  { family: 'cosmos', pattern: /\bCOSMOS \d+/i },
  {
    family: 'military',
    pattern: /\b(USA \d+|YAOGAN|SHIJIAN|SJ-\d+|OFEQ|NROL|MILSTAR|WGS|AEHF|SBIRS|GSSAP|SYRACUSE|SICRAL|CERES|HELIOS|COMSATBW|SKYNET)\b/i,
  },
  { family: 'tech_demo', pattern: /\b(DEMO|TECHNOSAT|PROBA|ELSA-D|OTV|MEV-\d+|LDPE)\b/i },
];
