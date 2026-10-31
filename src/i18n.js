// On-screen text in Italian and English, served by motorino's i18n. The
// font has capitals only, so the strings are written in capitals; accents
// other than the Italian ones fold to the base letter.
//
// A string is either text or a function of the values it shows.

import { createI18n } from '../lib/motorino/src/index.js';

const STRINGS = {
  it: {
    tagline: 'IL PAVIMENTO È LAVA. DAVVERO.',
    play: 'GIOCA',
    level: 'LIVELLO',
    difficulty: 'DIFFICOLTÀ',
    difficulties: {
      easy: { name: 'FACILE', desc: 'PER I PIÙ PICCOLI: PIÙ VITE, LAVA E NEMICI LENTI.' },
      normal: { name: 'NORMALE', desc: 'COME È STATO PENSATO IL GIOCO.' },
      hard: { name: 'DIFFICILE', desc: 'MENO VITE, LAVA E NEMICI PIÙ VELOCI.' },
    },
    options: 'OPZIONI',
    credits: 'CREDITI',
    creditRows: [
      ['UN GIOCO DI', 'ROBERTO LUTTINO - MINDCONTACT'],
      ['MOTORE 2D', 'MOTORINO'],
      ['MUSICA ED EFFETTI', 'SIDICIO, UN SID DEL C64 EMULATO'],
      ['UN GRAZIE SPECIALE', 'AL COMMODORE 64'],
    ],
    creditsThanks: 'A CHI SALTA SUL DIVANO PER NON TOCCARE TERRA',
    backHint: 'INVIO / ESC PER TORNARE',
    fullscreen: 'SCHERMO INTERO',
    on: 'SÌ',
    off: 'NO',
    back: 'INDIETRO',
    language: 'LINGUA',
    languageName: 'ITALIANO',
    character: 'PERSONAGGIO',
    characters: { explorer: 'ESPLORATORE', robot: 'ROBOTTINO', spider: 'RAGNO', hedgehog: 'RICCIO' },
    chip: 'CHIP SID',
    music: 'MUSICA',
    sfx: 'EFFETTI',
    record: (n) => `RECORD ${n}`,
    keysHint: 'FRECCE/WASD MUOVI  SPAZIO/Z SALTA  P PAUSA  M MUTO',
    startHint: 'PREMI UN TASTO PER ACCENDERE IL SID',
    extraLife: '+1 VITA',
    muted: 'MUTO',
    levelCard: (n) => `LIVELLO ${n}`,
    lavaRises: 'LA LAVA SALE! ARRAMPICATI!',
    lavaChases: 'IL VULCANO ERUTTA! CORRI!',
    lives: (n) => `VITE ${n}`,
    pause: 'PAUSA',
    resume: 'RIPRENDI',
    toMenu: 'TORNA AL MENU',
    levelClear: 'LIVELLO COMPLETATO!',
    crystals: 'CRISTALLI',
    time: 'TEMPO',
    timeBonus: 'BONUS TEMPO',
    allCrystals: 'TUTTI I CRISTALLI',
    points: (n) => `PUNTI ${n}`,
    continueHint: 'INVIO / SALTO PER CONTINUARE',
    retryHint: 'INVIO: RIPROVA IL LIVELLO',
    menuHint: 'ESC: MENU',
    bossName: 'GOLEM DI MAGMA',
    bossDown: (n) => `GOLEM SCONFITTO! +${n}`,
    win1: 'SEI SCAMPATO',
    win2: 'AL VULCANO!',
    winHint: 'INVIO PER IL MENU',
  },
  en: {
    tagline: 'THE FLOOR IS LAVA. FOR REAL.',
    play: 'PLAY',
    level: 'LEVEL',
    difficulty: 'DIFFICULTY',
    difficulties: {
      easy: { name: 'EASY', desc: 'FOR KIDS: MORE LIVES, SLOWER LAVA AND ENEMIES.' },
      normal: { name: 'NORMAL', desc: 'THE GAME AS IT WAS MEANT TO BE.' },
      hard: { name: 'HARD', desc: 'FEWER LIVES, FASTER LAVA AND ENEMIES.' },
    },
    options: 'OPTIONS',
    credits: 'CREDITS',
    creditRows: [
      ['A GAME BY', 'ROBERTO LUTTINO - MINDCONTACT'],
      ['2D ENGINE', 'MOTORINO'],
      ['MUSIC AND EFFECTS', 'SIDICIO, AN EMULATED C64 SID'],
      ['SPECIAL THANKS', 'TO THE COMMODORE 64'],
    ],
    creditsThanks: 'TO ALL WHO HOP ON THE SOFA TO DODGE THE FLOOR',
    backHint: 'ENTER / ESC TO GO BACK',
    fullscreen: 'FULL SCREEN',
    on: 'ON',
    off: 'OFF',
    back: 'BACK',
    language: 'LANGUAGE',
    languageName: 'ENGLISH',
    character: 'CHARACTER',
    characters: { explorer: 'EXPLORER', robot: 'ROBOT', spider: 'SPIDER', hedgehog: 'HEDGEHOG' },
    chip: 'SID CHIP',
    music: 'MUSIC',
    sfx: 'EFFECTS',
    record: (n) => `HIGH SCORE ${n}`,
    keysHint: 'ARROWS/WASD MOVE  SPACE/Z JUMP  P PAUSE  M MUTE',
    startHint: 'PRESS A KEY TO POWER UP THE SID',
    extraLife: '+1 LIFE',
    muted: 'MUTE',
    levelCard: (n) => `LEVEL ${n}`,
    lavaRises: 'THE LAVA IS RISING! CLIMB!',
    lavaChases: 'THE VOLCANO ERUPTS! RUN!',
    lives: (n) => `LIVES ${n}`,
    pause: 'PAUSED',
    resume: 'RESUME',
    toMenu: 'BACK TO MENU',
    levelClear: 'LEVEL CLEAR!',
    crystals: 'CRYSTALS',
    time: 'TIME',
    timeBonus: 'TIME BONUS',
    allCrystals: 'ALL CRYSTALS',
    points: (n) => `SCORE ${n}`,
    continueHint: 'ENTER / JUMP TO CONTINUE',
    retryHint: 'ENTER: RETRY THE LEVEL',
    menuHint: 'ESC: MENU',
    bossName: 'MAGMA GOLEM',
    bossDown: (n) => `GOLEM DEFEATED! +${n}`,
    win1: 'YOU ESCAPED',
    win2: 'THE VOLCANO!',
    winHint: 'ENTER FOR THE MENU',
  },
};

const i18n = createI18n(STRINGS);

export const LANGUAGES = i18n.languages;

// A first visit gets Italian on an Italian browser, English anywhere else
// (motorino's own default would fall back to Italian, the first language).
export function defaultLanguage() {
  return (navigator.language || '').toLowerCase().startsWith('it') ? 'it' : 'en';
}

export const strings = (lang) => i18n.strings(lang);
