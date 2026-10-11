// Tes projets : un poster est créé par projet (5 emplacements au mur).
// Remplace les textes, ajoute un lien, et optionnellement une image
// (ex. image: 'images/mon-projet.jpg') qui remplacera le poster généré.
export const OWNER = {
  name: 'Bryam',
  role: 'Développeur web',
  about: "Bienvenue dans ma chambre virtuelle. Clique sur les posters pour découvrir mes projets, ou sur l'ordinateur pour en savoir plus sur moi.",
  links: [
    { label: 'GitHub', url: 'https://github.com/Bryamx26' },
    { label: 'TikTok', url: 'https://www.tiktok.com/@bryamx26' },
  ],
};

export const PROJECTS = [
  {
    title: 'Projet 1',
    subtitle: 'Site vitrine',
    color: '#e76f51',
    description: 'Décris ici ton projet : le problème, ce que tu as construit et ce que tu as appris.',
    tags: ['HTML', 'CSS', 'JavaScript'],
    url: '',
    image: '',
  },
  {
    title: 'Projet 2',
    subtitle: 'Application web',
    color: '#2a9d8f',
    description: 'Décris ici ton projet.',
    tags: ['React', 'API'],
    url: '',
    image: '',
  },
  {
    title: 'Projet 3',
    subtitle: 'Jeu / 3D',
    color: '#e9c46a',
    description: 'Décris ici ton projet.',
    tags: ['Three.js'],
    url: '',
    image: '',
  },
  {
    title: 'Projet 4',
    subtitle: 'Back-end',
    color: '#457b9d',
    description: 'Décris ici ton projet.',
    tags: ['Node.js', 'SQL'],
    url: '',
    image: '',
  },
  {
    title: 'Projet 5',
    subtitle: 'Design',
    color: '#9b5de5',
    description: 'Décris ici ton projet.',
    tags: ['Figma'],
    url: '',
    image: '',
  },
];

// Le homelab (étagère murale) : clique dessus pour zoomer et ouvrir cette fiche.
export const HOMELAB = {
  title: 'Mon homelab',
  subtitle: '2 × Raspberry Pi 5 (8 Go) · switch 5 ports · CPL',
  color: '#30d158',
  description: "Deux Raspberry Pi 5 8 Go reliés à un switch Gigabit 5 ports, lui-même raccordé au réseau de la maison par un adaptateur CPL branché au mur.",
  hardware: [
    'Raspberry Pi 5 8 Go (×2) avec ventilateur actif',
    'Switch Gigabit 5 ports',
    'Adaptateur CPL (courant porteur) branché sur la prise murale',
  ],
  services: ['Docker', 'Ajoute ici tes services (Pi-hole, Home Assistant, k3s…)'],
  url: '',
};

// La guitare ouvre ce lien au clic.
export const TIKTOK = 'https://www.tiktok.com/@bryamx26';
