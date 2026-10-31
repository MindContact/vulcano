// The three difficulties. One table read by both sides: the shell takes the
// lives and the crystals per extra life, the World the rest. Normal is the
// game as tuned in playtests; the others scale it around that.
//
// What changes is pressure and forgiveness, never the jump: its height and
// length are what the levels are built around, so easy widens the coyote
// time and the jump buffer instead (a late or early press still jumps).
//
//   lava       speed of rising and chasing lava, × the level's own
//   lavaDelay  updates of calm before it starts, × the level's own
//   enemies    walking and flying speed of slugs and bats
//   bossHp     stomps the golem takes
//   boss       speed of the golem's walk and of its shockwaves; its stun
//              lasts that much less

export const DIFFICULTY_IDS = ['easy', 'normal', 'hard'];

export const DIFFICULTIES = {
  easy: {
    lives: 9, gemsPerLife: 20,
    lava: 0.6, lavaDelay: 2, enemies: 0.6, bossHp: 2, boss: 0.7,
    tuning: { coyote: 10, jumpBuffer: 12 },
  },
  normal: {
    lives: 5, gemsPerLife: 30,
    lava: 1, lavaDelay: 1, enemies: 1, bossHp: 3, boss: 1,
    tuning: {},
  },
  hard: {
    lives: 3, gemsPerLife: 50,
    lava: 1.3, lavaDelay: 0.6, enemies: 1.3, bossHp: 4, boss: 1.2,
    tuning: {},
  },
};
