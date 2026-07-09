/**
 * data/levels.ts — the campaign: LEVELS, each a run of BOARDS.
 *
 * A LEVEL is a named chapter with one briefing screen and optional story
 * scenes (data/story.ts): `intro` plays before the briefing, `outro`
 * after the last board (used for the final level's ending). A BOARD is
 * one playable ASCII map; its own `intro` scene plays the first time the
 * board is entered in a run (never on death/retry). Boards within a level
 * chain seamlessly; finishing a level shows the clear screen.
 *
 * MAP LEGEND
 *   #   wall
 *   .   floor
 *   ' ' VOID — outside the level (shaped boards): solid but undrawn, the
 *       neon void backdrop shows through. Rows may be RAGGED — short rows
 *       are padded with void on the right, so boards can be long, L-shaped
 *       or otherwise non-rectangular.
 *   +   DOOR — starts closed, blocks sight and movement; walk into it to
 *       push it open, or dash / melee it to KICK it open (staggers anyone
 *       within KICK_RADIUS on the other side)
 *   P   player start (exactly one)          X   exit (exactly one)
 *   t   thug    g   goon    n   stalker   u   gunner    h   heavy
 *   1   bat     2   knife   3   pistol    4   shotgun (weapon pickups)
 *
 * Per-board fields: name, two neon accent colors, two floor checker
 * colors, music bass root (Hz), and optionally `objective: 'reach'`
 * (exit open from the start; zero kills pays GHOST_BONUS) with a `goal`
 * line for the HUD.
 */
import type { LevelDef } from '../types';

export const LEVELS: LevelDef[] = [

  // ================= LV.01 — THE LAST RUN =================
  {
    name: 'LV.01 — THE LAST RUN',
    intro: 'run-intro',
    briefing: [
      'One last package. One clean handoff at the canal, and the <span class="pink">Voronovs</span> tear your page out of the ledger.',
      'The short way to the meet cuts through <span class="cyan">Kolibri turf</span>. Their lookouts don\'t carry guns &mdash; just fists, and phones to call in yours.',
      'Stay out of their sightlines. <span class="pink">Leave no bodies</span> &mdash; a punch floors a man without killing him, and ghosts get paid extra.',
    ],
    clearCopy: 'The meet is a dead man at a canal table. The package is gone, and every camera in the district watched a pink jacket arrive.<br><span class="pink">The Voronovs are already calling.</span>',
    boards: [

      // ---- board 1: the alleys ----
      {
        name: 'BACK ALLEYS',
        objective: 'reach',
        goal: 'REACH THE CANAL — NO BODIES = BONUS',
        accent: '#2fd6a8', accent2: '#ff8a3d',
        floorA: '#101318', floorB: '#0b0e12',
        musicRoot: 41,
        map: [
          '##################################',
          '#...............................X#',
          '#..####..####..####..####..####..#',
          '#..####+#####..####..####..####..#',
          '#..####..####..####..####..####..#',
          '#........####....t...............#',
          '#..####..####..####..####..####..#',
          '#..####..####..####t.####..####..#',
          '#..####..####..####..####..####..#',
          '#.t............####..............#',
          '#..####..####..####..####..####..#',
          '#..####..####..####..####+#####..#',
          '#..####..####..####..####..####..#',
          '#..####................t.........#',
          '#..####..####..####..####..####..#',
          '#t.####..####..####..####..####..#',
          '#..####..####..####..####..####..#',
          '#...........................t....#',
          '#..####..####..####..####..####..#',
          '#..####+#####..####..####..####..#',
          '#P...............................#',
          '##################################',
        ],
      },

      // ---- board 2: the underpass ----
      {
        name: 'THE UNDERPASS',
        objective: 'reach',
        goal: 'GET TO THE MEET — NO BODIES = BONUS',
        intro: 'run-deeper',
        accent: '#00e5ff', accent2: '#ff2d95',
        floorA: '#0d1016', floorB: '#090b10',
        musicRoot: 45,
        map: [
          '####################################',
          '#P.................................#',
          '#..####..####t.####..####..####....#',
          '#..####+#####..####..####..####....#',
          '#..####..####..####..####..####....#',
          '#........g...........####..........#',
          '#..####..####..####t.####..####....#',
          '#..####..####..####..####..####....#',
          '#..####..####..####..####+#####....#',
          '#...##...##...##...##...##....n....#',
          '#.t.##...##...##...##...##.........#',
          '#..####..####..####..####..####....#',
          '#..####..####1.####..####..####....#',
          '#..####..####..####+#####..####....#',
          '#..####..####..####..####..####....#',
          // shaped board: the meet is a dock jutting out into the void
          '#........####....g.................######',
          '#..####..####..####..####..####.t.......#',
          '#..####..####..####..####..####........X#',
          '#..................................######',
          '####################################',
        ],
      },
    ],
  },

  // ================= LV.02 — GANG HIDEOUT =================
  {
    name: 'LV.02 — GANG HIDEOUT',
    intro: 'hideout-intro',
    outro: 'ending',
    briefing: [
      'The drop went bad and the buyer went cold. The <span class="pink">Voronovs</span> think you talked, and their invitation to come "explain" smells like a grave.',
      'Their hideout is three floors of muscle: the warehouse, the <span class="cyan">Kolibri apartments</span>, and the penthouse where the old man keeps your debt in a steel case.',
      'Grab anything that kills. You die in one hit. <span class="pink">So do most of them.</span>',
    ],
    boards: [

      // ---- board 1: the warehouse ----
      {
        name: 'THE WAREHOUSE',
        accent: '#ff2d95', accent2: '#00e5ff',
        floorA: '#120722', floorB: '#0e0519',
        musicRoot: 55,
        map: [
          '######################################',
          '#........#..................#........#',
          '#........#..................#........#',
          '#..P.....+..#...............#........#',
          '#........#.....#####+####...+...u....#',
          '#....1...#.....#........#...#........#',
          '#........#.....#........#...#........#',
          '####+#####.....+....g...#...#........#',
          '#...........g..#..2.....+...#........#',
          '#..............#........#...####+#####',
          '#..............####+#####............#',
          '######+######........................#',
          '##..........#........................#',
          '##..........#..................#.n...#',
          '##...g..3...+..######+#####..........#',
          '##..........#..#..........#..........#',
          '##..........#..#..........#.......#..#',
          '###+#########..#...g......#..........#',
          '#..............+..........#..........#',
          '#..............#.......u..+...#......#',
          '#............#.#..........#..........#',
          '#..............#..........#...g......#',
          '#..............############........X.#',
          '######################################',
        ],
      },

      // ---- board 2: the apartments ----
      {
        name: 'KOLIBRI APARTMENTS',
        intro: 'hideout-mid',
        accent: '#a855f7', accent2: '#39ff88',
        floorA: '#150726', floorB: '#0f051c',
        musicRoot: 49,
        map: [
          '##################################',
          '#.............#########..#########',
          '#.P...........#.......#..#......##',
          '#..#..........#.2.....#..#......##',
          '#.............+.......#..#..n...##',
          '#.............#.....g.#..+......##',
          '#####+#####...#.......#..#......##',
          '##........#...####+####..#......##',
          '##.1......#..............####+####',
          '##.....g..+...........u..........#',
          '##........#...#####+####.........#',
          '##........#...#........#..###+####',
          '###########...#........#..#.....##',
          '##........#...+...3....+..#.....##',
          '##........#...#......n.#..#..u..##',
          '##...n....#...#........#..+.....##',
          '##........+...##########..#.....##',
          '##......u.#...............#...h.##',
          '##........#...............########',
          '######+####.#....u......#........#',
          '#................................#',
          '#...####+#######+########+####...#',
          '#................................#',
          '#.....2.....g..............n.....#',
          '#..............................X.#',
          '##################################',
        ],
      },

      // ---- board 3: the penthouse ----
      {
        name: 'THE PENTHOUSE',
        intro: 'hideout-top',
        accent: '#ffd23f', accent2: '#ff2d3b',
        floorA: '#170a1c', floorB: '#100616',
        musicRoot: 62,
        map: [
          '########################################',
          '#......................................#',
          '#......................................#',
          '#..........#.................#.........#',
          '##########....................##########',
          '##.......#...#######+#######..#.....n.##',
          '##.......#...#.............#..#..u....##',
          '##..3....+...#.u.........g.#..+.......##',
          '##.......#...#...###+###...#..#....4..##',
          '##.....g.#...#...#.....#...#..#.......##',
          '##.......#...#...#.....#...#..#.......##',
          '#####+####...+...+..X..#...+..####+#####',
          '#............#..h#.....+...#...h.......#',
          '#............#...#..h..#n..#...........#',
          '#####+####...#...#######...#..####+#####',
          '##.......#...#.g...........#..#.......##',
          '##.n.....#...#..........2u.#..#.....u.##',
          '##.......#...#.............#..#.......##',
          '##.......+...######+#+######..+.......##',
          '##...1...#....................#..g....##',
          '##.......#.#.................##.......##',
          '##########....................##########',
          '#..P...................................#',
          '########################################',
        ],
      },
    ],
  },
];
