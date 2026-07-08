/**
 * data/story.ts — the visual-novel content registry.
 *
 * CHARACTERS defines everyone who can speak: display name, name-plate
 * color, which side of the screen their cutout stands on, and the
 * CharPalette their full-body portrait is drawn from (portraits.ts).
 * Wren's palette is the player rig's palette, so the woman in the
 * cutscenes is visibly the same one you play from the top down.
 *
 * SCENES is a map of scene-id -> lines. Levels and boards reference
 * scene ids via their `intro` / `outro` fields (data/levels.ts); the
 * Flow plays each scene at most once per run (never on death/retry).
 *
 * Lines that start with '(' render as inner monologue (dimmed italics).
 */
import { PLAYER_PAL } from '../config';
import type { CharPalette } from '../types';

export interface StoryChar {
  name: string;
  /** name-plate / dialogue-box accent color */
  color: string;
  /** which side of the screen the cutout stands on */
  side: 'left' | 'right';
  pal: CharPalette;
  shades?: boolean;
  coat?: boolean;
}

export interface StoryLine { who: string; text: string }

export const CHARACTERS: Record<string, StoryChar> = {
  /** The player: Voronov courier, one job from freedom. */
  wren: {
    name: 'WREN', color: '#ff2d95', side: 'left',
    pal: PLAYER_PAL,
  },
  /** Voronov handler — the voice that hands Wren her jobs. */
  yuri: {
    name: 'YURI', color: '#00e5ff', side: 'right', shades: true, coat: true,
    pal: { jacket: '#3d4f8a', jdark: '#25305c', hair: '#cfc9bd', skin: '#d8b48c', pants: '#1c2340' },
  },
  /** Kolibri crew lookout — young, loud, unarmed like his crew. */
  roan: {
    name: 'ROAN', color: '#39ff88', side: 'right',
    pal: { jacket: '#2fd6a8', jdark: '#177a5e', hair: '#161a1f', skin: '#c9a27b', pants: '#1a2a26' },
  },
  /** The old man himself. Keeps the ledger. */
  voronov: {
    name: 'VORONOV', color: '#ffd23f', side: 'right', coat: true,
    pal: { jacket: '#b98a2e', jdark: '#6e4e14', hair: '#d8d3c8', skin: '#d0a887', pants: '#241a10' },
  },
};

export const SCENES: Record<string, StoryLine[]> = {

  // ---- LV.01 intro: the phone call ----
  'run-intro': [
    { who: 'yuri', text: 'Wren. One package. Table by the canal, buyer in a grey coat. You hand it over, you walk away clean.' },
    { who: 'wren', text: 'You said "last run" three runs ago, Yuri.' },
    { who: 'yuri', text: 'This one has your ledger page stapled to it. Deliver, and the Voronovs forget your name ever had a number next to it.' },
    { who: 'wren', text: 'The short way to the canal is Kolibri turf now. If their lookouts make me—' },
    { who: 'yuri', text: 'Then don\'t be seen. And Wren — no bodies. A courier who leaves corpses is a courier people remember.' },
  ],

  // ---- LV.01 board 2 intro: made by the lookouts ----
  'run-deeper': [
    { who: 'roan', text: 'Hold up. Pink jacket, moving fast, canal-side. That\'s the Voronov courier.' },
    { who: 'wren', text: 'I\'m just passing through, kid. Nothing in this bag is for you.' },
    { who: 'roan', text: 'Everything crossing our turf is for us. Take her bag — and don\'t scuff the merchandise.' },
    { who: 'wren', text: '(Knuckles, not knives. Leave them breathing. A body war with the Kolibri is the one thing I can\'t afford tonight.)' },
  ],

  // ---- LV.02 intro: the meet went bad ----
  'hideout-intro': [
    { who: 'wren', text: 'The buyer was cold before I got there, Yuri. Two holes, professional. The package was the only thing missing.' },
    { who: 'yuri', text: 'And you were the only one who knew the route. You see how this reads from where the old man sits.' },
    { who: 'wren', text: 'I was set up. Somebody sold the drop before I ever left the district.' },
    { who: 'yuri', text: 'Then come tell the warehouse that. Walk in the front door. If you\'re clean, you\'ll walk back out.' },
    { who: 'wren', text: '(Nobody walks out of that warehouse. Fine. If they want a story, I\'ll write it in the stairwell.)' },
  ],

  // ---- LV.02 board 2 intro: up into the apartments ----
  'hideout-mid': [
    { who: 'wren', text: '(Ground floor, cleared. The stairwell up smells like smoke and cheap speed.)' },
    { who: 'yuri', text: 'You\'re really doing this. The Kolibri floors are next — the stalkers up there are fast. Parry the swing or be somewhere else.' },
    { who: 'wren', text: 'Whose side are you on tonight, Yuri?' },
    { who: 'yuri', text: 'The ledger keeper lives above them. He logged tonight\'s route — and whoever bought a copy. I\'d like to read that page myself.' },
  ],

  // ---- LV.02 board 3 intro: the penthouse ----
  'hideout-top': [
    { who: 'wren', text: 'The keeper talked. The route was sold from the penthouse. The old man signed it himself — my last run was the payment on someone else\'s debt.' },
    { who: 'yuri', text: '...Then there is no version of tonight where you both keep breathing. His heavies wear plate — hit them until they stop.' },
    { who: 'wren', text: 'Forty floors of neon and he\'s out of everyone. When I get up there, the ledger burns.' },
  ],

  // ---- ending: before the win screen ----
  'ending': [
    { who: 'voronov', text: 'The courier. You cost me a warehouse of men tonight, girl.' },
    { who: 'wren', text: 'You cost yourself. You sold my route to cover someone else\'s page. I\'m only here to close the account.' },
    { who: 'voronov', text: 'Ledgers are just paper. There will always be another page with your name on it.' },
    { who: 'wren', text: 'Not this one.' },
    { who: 'wren', text: '(The steel case opens. The page burns blue in the sink. For the first time in three years, nobody owns the name Wren.)' },
  ],
};
