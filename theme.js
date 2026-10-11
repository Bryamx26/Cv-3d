// Couleurs de la chambre. Change ACTIVE pour passer d'un thème à l'autre,
// ou modifie directement les couleurs ci-dessous.
//
// materials : couleurs par matériau des modèles Kenney (wood, metal, carpet…), pour tous les modèles.
// models    : couleurs propres à un modèle (prioritaires), ex. le tissu du lit ≠ celui de la chaise.
// neon      : bandes LED lumineuses (null = pas de néon).

const gaming = {
  background: '#07060d',
  walls: { back: '#1b1830', left: '#221d3a' },
  trim: '#2a2545',
  floor: { tones: ['#2a2433', '#2e2738', '#262030', '#322b3e'], line: 'rgba(0,0,0,.35)' },
  posterFrame: '#0d0c14',
  shelf: '#2b2b35',
  materials: {
    wood: '#2b2b35',
    woodDark: '#1d1d25',
    metal: '#4a4e5c',
    metalDark: '#121218',
    metalMedium: '#1c1c26',
    lamp: '#b57edc',
  },
  models: {
    bedDouble: { carpet: '#5a189a', carpetWhite: '#2f2b45', metal: '#1c1c26' },
    chairDesk: { carpet: '#9d4edd', metalMedium: '#15151c' },
    rugRectangle: { carpet: '#15132a', carpetDarker: '#00e5ff' },
    speakerSmall: { wood: '#15151c' },
  },
  neon: {
    back: '#00e5ff',   // en haut du mur du fond
    left: '#ff2bd6',   // en haut du mur de gauche
    desk: '#00e5ff',   // derrière le bureau
    bed: '#9d4edd',    // sous le lit
  },
  lights: {
    sky: '#9a8cff', ground: '#1a1430', ambient: 1.3,
    sun: '#c9c2ff', sunIntensity: 1.4,
    lamp: '#c77dff', lampIntensity: 1.2,
    screen: '#00e5ff',
  },
  bloom: { strength: 0.7, radius: 0.4, threshold: 0.85 },
  // Panneau d'infos (fiches projets)
  ui: { panel: '#16131f', ink: '#ece9ff', muted: '#a39dbd', tag: '#2a2440', btn: '#7b2cbf', btnInk: '#ffffff', tooltip: '#7b2cbf' },
};

const classique = {
  background: '#1d1b26',
  walls: { back: '#f1e6d6', left: '#e6d6c2' },
  trim: '#ffffff',
  floor: { tones: ['#b98a5e', '#b3845a', '#c09265', '#ad7f55'], line: 'rgba(0,0,0,.18)' },
  posterFrame: '#2b2733',
  shelf: '#c69c72',
  materials: {},
  models: {},
  neon: null,
  lights: {
    sky: '#fff4e6', ground: '#3a3550', ambient: 1.4,
    sun: '#ffffff', sunIntensity: 2.2,
    lamp: '#ffb36b', lampIntensity: 2.5,
    screen: '#7b8cff',
  },
  bloom: null,
  ui: { panel: '#fffaf2', ink: '#2b2733', muted: '#6b6475', tag: '#efe7da', btn: '#2b2733', btnInk: '#ffffff', tooltip: '#2b2733' },
};

export const THEMES = { gaming, classique };
export const ACTIVE = 'gaming';
export const THEME = THEMES[ACTIVE];
