/**
 * data/levels.ts — the floors, as plain ASCII maps.
 *
 * To add a floor, append an object to LEVELS — briefing screen, floor
 * counter and progression pick it up automatically.
 *
 * MAP LEGEND
 *   #   wall
 *   .   floor
 *   +   DOOR — starts closed, blocks sight and movement; walk into it to
 *       push it open, or dash / melee it to KICK it open (staggers anyone
 *       within KICK_RADIUS on the other side)
 *   P   player start (exactly one)          X   exit (exactly one)
 *   g   goon    n   stalker   u   gunner    h   heavy   (enemies.ts)
 *   1   bat     2   knife     3   pistol    4   shotgun (weapon pickups)
 *
 * Per-level fields: name, briefing paragraphs (inline <span class="pink">
 * / <span class="cyan"> allowed), two neon accent colors, two floor
 * checker colors, and the music's bass root frequency in Hz.
 */
import type { LevelDef } from '../types';

export const LEVELS: LevelDef[] = [

  // ---------------- CH.01 ----------------
  {
    name: 'CH.01 — THE WAREHOUSE',
    briefing: [
      'You owed the <span class="pink">Voronovs</span> money you never borrowed. So you ran their packages &mdash; quiet, fast, no questions asked.',
      'Tonight the drop went bad. They think you talked. The only way out of this warehouse is <span class="cyan">through every one of them.</span>',
      'Grab anything that kills. You die in one hit. <span class="pink">So do most of them.</span>',
    ],
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

  // ---------------- CH.02 ----------------
  {
    name: 'CH.02 — NEON APARTMENTS',
    briefing: [
      'Word travels fast in the district. The crew that runs the <span class="cyan">Kolibri apartments</span> got the call before you got off the bus.',
      'Tight halls. Thin walls. The <span class="pink">stalkers</span> in there are fast &mdash; when one winds up a swing, <span class="cyan">parry it</span> or be somewhere else.',
      'The Voronovs\' ledger keeper lives on the top floor. He knows whose name is next to yours.',
    ],
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

  // ---------------- CH.03 ----------------
  {
    name: 'CH.03 — THE PENTHOUSE',
    briefing: [
      'The ledger gave you an address you already knew: the <span class="pink">Voronov penthouse</span>, forty floors above the neon.',
      'The old man keeps your debt in a steel case at the center of the hall. His <span class="pink">heavies</span> wear plate &mdash; hit them until they stop, and stay off the shotguns\' line.',
      'Burn the ledger and it\'s over. <span class="cyan">Walk in. Walk out. Owe nothing.</span>',
    ],
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
];
