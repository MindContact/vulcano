// The levels, drawn as text. One character per 16x16 tile:
//
//   #  rock              =  crust (one-way: land on it from above)
//   C  crumbling rock    ~  lava              ^  obsidian spikes
//   G  geyser vent       |  invisible stop for moving platforms
//   o  crystal           K  checkpoint        E  exit        P  start
//   s  magma slug        v  ash bat           f  fire bubble (sits in lava)
//   M  platform moving sideways               N  platform moving up and down
//   B  the magma golem: its arena is the 20 columns from 9 left of it, and
//      the level's exits stay shut until it falls
//
// Horizontal levels are built from 16-column segments, bottom-aligned, so
// each piece can be drawn and counted on its own.

import { TILE, parseMap } from '../../lib/motorino/src/index.js';

export { TILE };
export const T = {
  EMPTY: 0, ROCK: 1, CRUST: 2, CRUMBLE: 3, LAVA: 4, SPIKES: 5, VENT: 6, STOP: 7,
};

const TILE_CHARS = { '#': T.ROCK, '=': T.CRUST, C: T.CRUMBLE, '~': T.LAVA, f: T.LAVA, '^': T.SPIKES, G: T.VENT, '|': T.STOP };
const SPAWN_CHARS = { o: 'gem', K: 'checkpoint', E: 'exit', P: 'start', s: 'slug', v: 'bat', f: 'bubble', M: 'mover', N: 'lift', B: 'boss' };

// The legend for motorino's parseMap: a fire bubble is lava with a spawn.
const LEGEND = { ' ': {} };
for (const [c, tile] of Object.entries(TILE_CHARS)) LEGEND[c] = { tile };
for (const [c, spawn] of Object.entries(SPAWN_CHARS)) LEGEND[c] = { ...LEGEND[c], spawn };

// A segment: rows given bottom-aligned to `height`, the missing top filled
// with `fill`.
function seg(height, rows, fill = ' ') {
  const w = rows[0].length;
  rows.forEach((r, i) => {
    if (r.length !== w) throw new Error(`segment row ${i} is ${r.length} wide, expected ${w}: "${r}"`);
  });
  return [...Array(height - rows.length).fill(fill.repeat(w)), ...rows];
}

function join(...segments) {
  return segments[0].map((_, y) => segments.map((s) => s[y]).join(''));
}

// A cave roof: the top `rows` rows become rock wherever they are empty.
function roof(rows, depth) {
  return rows.map((r, y) => (y < depth ? r.replace(/ /g, '#') : r));
}

const H = 15;
const GROUND = '################';

// --- 1: Le pendici -------------------------------------------------------------

const level1 = join(
  seg(H, [
    '          o o   ',
    '         ====   ',
    '                ',
    '  P             ',
    GROUND, GROUND, GROUND,
  ]),
  seg(H, [
    '     o     o    ',
    '                ',
    '####   ###  ####',
    '####~~~###~~####',
    '####~~~###~~####',
  ]),
  seg(H, [
    '           o    ',
    '         #####  ',
    '      ###       ',
    '   s            ',
    GROUND, GROUND, GROUND,
  ]),
  seg(H, [
    '    o    o      ',
    '                ',
    ' K              ',
    '###  CCC  CCC ##',
    '###~~~~~~~~~~~##',
    '###~~~~~~~~~~~##',
  ]),
  seg(H, [
    '   o   o   o    ',
    '                ',
    '                ',
    '###  ##  ##  ###',
    '###~f##f~##~f###',
    '###~~##~~##~~###',
  ]),
  seg(H, [
    '        o       ',
    '      =====     ',
    '                ',
    '                ',
    '  ===       v   ',
    '                ',
    '                ',
    GROUND, GROUND, GROUND,
  ]),
  seg(H, [
    '    o     o     ',
    '                ',
    '        s       ',
    '####G#####G#####',
    GROUND, GROUND,
  ]),
  seg(H, [
    '   o o o        ',
    '  =======       ',
    '            E   ',
    GROUND, GROUND, GROUND,
  ]),
);

// --- 2: Camere di magma ----------------------------------------------------------

const level2 = roof(join(
  seg(H, [
    '            o   ',
    '           ===  ',
    '  P             ',
    GROUND, GROUND, GROUND,
  ]),
  seg(H, [
    '   o    o    o  ',
    '                ',
    '                ',
    '#M             #',
    '#~~~~~~~~~~~~~~#',
    '#~~~~~~~~~~~~~~#',
  ]),
  seg(H, [
    '       o     o  ',
    '                ',
    '                ',
    '   CCC   CCC    ',
    '#~~~~~~f~~~~~f~#',
    '#~~~~~~~~~~~~~~#',
    '#~~~~~~~~~~~~~~#',
  ]),
  seg(H, [
    '################',
    '################',
    '   o    o    o  ',
    '                ',
    ' K              ',
    '#####G####G#####',
    GROUND, GROUND,
  ], '#'),
  seg(H, [
    '      o         ',
    '    |           ',
    '         #######',
    '         #######',
    '       v #######',
    '         #######',
    '         #######',
    '    N    #######',
    '##  |    #######',
    '##~~~~~~~#######',
    '##~~~~~~~#######',
  ]),
  seg(H, [
    '    o   o   o   ',
    '###CCCCCCCCC####',
    '###         ####',
    '###         ####',
    '###         ####',
    '###         ####',
    '###         ####',
    '###^^^^^^^^^####',
    GROUND, GROUND,
  ]),
  seg(H, [
    '            o   ',
    '####            ',
    '####            ',
    '####            ',
    '####            ',
    '####            ',
    '####   s     E  ',
    GROUND, GROUND, GROUND,
  ]),
), 2);

// --- 3: Il condotto (vertical, rising lava) --------------------------------------

const level3 = [
  '##################',
  '                  ',
  '  o     E     o   ',
  '    ##########    ',
  '                  ',
  '                  ',
  '===            ===',
  '                  ',
  '         v        ',
  '     ========     ',
  '                  ',
  '        o         ',
  'CCC            CCC',
  '                  ',
  '                  ',
  '   ======  ====   ',
  '                  ',
  '  K               ',
  '#####         ====',
  '                  ',
  '        s         ',
  '      ########    ',
  '                  ',
  '                  ',
  '====          ====',
  '                  ',
  '      o    o      ',
  '     ===   ===    ',
  '                  ',
  '                  ',
  'CC    CCCCCC    CC',
  '                  ',
  '  o            o  ',
  '  ===        ===  ',
  '                  ',
  '        K         ',
  '      ######      ',
  '                  ',
  '                  ',
  '  ===        ===  ',
  '            v     ',
  '                  ',
  '    ======        ',
  '                  ',
  '              o   ',
  '           ====== ',
  '                  ',
  '                  ',
  '  =====      CCC  ',
  '                  ',
  '        o         ',
  '      ======      ',
  '                  ',
  '                  ',
  '  ====      ====  ',
  '                  ',
  '                  ',
  '       =====      ',
  '                  ',
  '  P               ',
  '##################',
  '##################',
].map((r) => {
  if (r.length !== 18) throw new Error(`level 3 row is ${r.length} wide: "${r}"`);
  return `#${r}#`;
});

// --- 4: Il cratere -----------------------------------------------------------------

const level4 = join(
  seg(H, [
    '     o  o  o    ',
    '                ',
    '  P             ',
    GROUND, GROUND, GROUND,
  ]),
  seg(H, [
    '            o   ',
    '           #####',
    '      o         ',
    '     ####       ',
    '                ',
    '##G#############',
    GROUND, GROUND,
  ]),
  seg(H, [
    '   o   o   o    ',
    '                ',
    '                ',
    '##M           ##',
    '##~~~f~~~~f~~~##',
    '##~~~~~~~~~~~~##',
  ]),
  seg(H, [
    '       v        ',
    '                ',
    '    o    o      ',
    '                ',
    '   CCC   CCC    ',
    '##            ##',
    '##^^^^^^^^^^^^##',
    GROUND,
  ]),
  seg(H, [
    '   o    o    o  ',
    '                ',
    ' K   s     s    ',
    '#######^^#######',
    GROUND, GROUND,
  ]),
  seg(H, [
    '         o  o   ',
    '    |           ',
    '         #######',
    '         #######',
    '         #######',
    '         #######',
    '         #######',
    '         #######',
    '    N    #######',
    '##  |    #######',
    '##^^^^^^^#######',
    GROUND,
  ]),
  seg(H, [
    '    o     o     ',
    '                ',
    '                ',
    '####G#####G#####',
    GROUND, GROUND, GROUND, GROUND, GROUND, GROUND, GROUND, GROUND, GROUND,
  ]),
  seg(H, [
    '####            ',
    '####            ',
    '####=====       ',
    '####            ',
    '####         o  ',
    '####            ',
    '####   K        ',
    '####~~####~~####',
    '####~~####~~####',
    '####~~####~~####',
  ]),
  // The golem's arena: exactly one screen wide and the last of the map, so
  // the camera, clamped to the edge, holds the whole fight in view. The
  // crust ledges are out of reach of the shockwaves.
  seg(H, [
    '                    ',
    '   ===      ===     ',
    '                    ',
    '         B        E ',
    '####################',
    '####################',
    '####################',
  ]),
);

// --- 5: La colata (lava chasing from the left) ------------------------------------
// The eruption after the golem: a downhill run with the flow behind. Every
// obstacle can be taken at a run; nothing asks the player to stand and wait.

const level5 = join(
  seg(H, [
    '  o  o  o       ',
    '                ',
    'P               ',
    GROUND, GROUND, GROUND, GROUND, GROUND,
  ]),
  seg(H, [
    '                ',
    '     o     o    ',
    '                ',
    '###CCCC###      ',
    '###~~~~###      ',
    '###~~~~#####    ',
    '###~~~~#########',
    GROUND,
  ]),
  seg(H, [
    '                ',
    '      o o       ',
    '                ',
    '      ===       ',
    '   o       o    ',
    '                ',
    '##G#####^^^##G##',
    GROUND,
  ]),
  seg(H, [
    '        v       ',
    '                ',
    '     o   o   o  ',
    '                ',
    '##   #   #   ###',
    '##~f~#~~~#~f~###',
    '##~~~#~~~#~~~###',
    GROUND,
  ]),
  seg(H, [
    '                ',
    '   o    o    o  ',
    '                ',
    ' K   s     s    ',
    GROUND, GROUND, GROUND, GROUND,
  ]),
  seg(H, [
    '                ',
    '                ',
    '      o     o   ',
    '##   CCC   CCC  ',
    '##              ',
    '##^^^^^^^^^^^^^^',
    GROUND, GROUND,
  ]),
  seg(H, [
    '                ',
    '      o     o   ',
    '                ',
    '###             ',
    '###   K         ',
    '#####G######G###',
    GROUND, GROUND,
  ]),
  seg(H, [
    '        v       ',
    '   ===     o    ',
    '   o            ',
    '                ',
    '             E  ',
    GROUND, GROUND, GROUND,
  ]),
);

export const LEVELS = [
  { name: { it: 'Le pendici', en: 'The slopes' }, bg: 'sky', music: 'magma', rows: level1, par: 90 },
  { name: { it: 'Camere di magma', en: 'Magma chambers' }, bg: 'cave', music: 'magma', rows: level2, par: 120 },
  { name: { it: 'Il condotto', en: 'The vent' }, bg: 'cave', music: 'fuga', rows: level3, par: 100, rise: { delay: 300, speed: 0.13 } },
  { name: { it: 'Il cratere', en: 'The crater' }, bg: 'sky', music: 'fuga', rows: level4, par: 150 },
  { name: { it: 'La colata', en: 'The lava flow' }, bg: 'sky', music: 'fuga', rows: level5, par: 80, chase: { delay: 300, speed: 0.5 } },
];

// Rows may be ragged: short ones are padded with empty space.
export function parseLevel(def) {
  const w = Math.max(...def.rows.map((r) => r.length));
  const { h, tiles, spawns: all } = parseMap(def.rows.map((r) => r.padEnd(w, ' ')), LEGEND);
  const starts = all.filter((s) => s.kind === 'start');
  if (starts.length > 1) throw new Error('two starts');
  if (!starts.length) throw new Error('no start');
  const spawns = all.filter((s) => s.kind !== 'start');
  if (!spawns.some((s) => s.kind === 'exit')) throw new Error('no exit');
  const gemCount = spawns.filter((s) => s.kind === 'gem').length;
  return { def, w, h, tiles, spawns, start: { x: starts[0].x, y: starts[0].y }, gemCount };
}
