import skier1Head from '../assets/characters/skier1/separated/skier1_head.png';
import skier1Torso from '../assets/characters/skier1/separated/skier1_torso.png';
import skier1Legs from '../assets/characters/skier1/separated/skier1_legs.png';
import skier1Skis from '../assets/characters/skier1/separated/skier1_skis.png';

import skier2Head from '../assets/characters/skier2/separated/skier2_head.png';
import skier2Torso from '../assets/characters/skier2/separated/skier2_torso.png';
import skier2Legs from '../assets/characters/skier2/separated/skier2_legs.png';
import skier2Skis from '../assets/characters/skier2/separated/skier2_skis.png';

import skier3Head from '../assets/characters/skier3/separated/skier3_head.png';
import skier3Torso from '../assets/characters/skier3/separated/skier3_torso.png';
import skier3Legs from '../assets/characters/skier3/separated/skier3_legs.png';
import skier3Skis from '../assets/characters/skier3/separated/skier3_skis.png';

import skier4Head from '../assets/characters/skier4/separated/skier4_head.png';
import skier4Torso from '../assets/characters/skier4/separated/skier4_torso.png';
import skier4Legs from '../assets/characters/skier4/separated/skier4_legs.png';
import skier4Skis from '../assets/characters/skier4/separated/skier4_skis.png';

export interface SkierSprites {
  head: HTMLImageElement;
  torso: HTMLImageElement;
  legs: HTMLImageElement;
  skis: HTMLImageElement;
}

export type SkierCharacter = 1 | 2 | 3 | 4;

const spriteUrls: Record<SkierCharacter, { head: string; torso: string; legs: string; skis: string }> = {
  1: { head: skier1Head, torso: skier1Torso, legs: skier1Legs, skis: skier1Skis },
  2: { head: skier2Head, torso: skier2Torso, legs: skier2Legs, skis: skier2Skis },
  3: { head: skier3Head, torso: skier3Torso, legs: skier3Legs, skis: skier3Skis },
  4: { head: skier4Head, torso: skier4Torso, legs: skier4Legs, skis: skier4Skis },
};

export function getSkierSpriteUrls(character: SkierCharacter = 1): { head: string; torso: string; legs: string; skis: string } {
  return spriteUrls[character];
}

const loadedSprites: Map<SkierCharacter, SkierSprites> = new Map();
const loadingPromises: Map<SkierCharacter, Promise<SkierSprites>> = new Map();

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function loadSkierSprites(character: SkierCharacter): Promise<SkierSprites> {
  // Return cached sprites if available
  const cached = loadedSprites.get(character);
  if (cached) return cached;

  // Return existing loading promise if in progress
  const existing = loadingPromises.get(character);
  if (existing) return existing;

  // Start loading
  const urls = spriteUrls[character];
  const promise = Promise.all([
    loadImage(urls.head),
    loadImage(urls.torso),
    loadImage(urls.legs),
    loadImage(urls.skis),
  ]).then(([head, torso, legs, skis]) => {
    const sprites: SkierSprites = { head, torso, legs, skis };
    loadedSprites.set(character, sprites);
    loadingPromises.delete(character);
    return sprites;
  });

  loadingPromises.set(character, promise);
  return promise;
}

export function getSkierSprites(character: SkierCharacter): SkierSprites | null {
  return loadedSprites.get(character) ?? null;
}

// Preload all skier sprites
export async function preloadAllSprites(): Promise<void> {
  await Promise.all([
    loadSkierSprites(1),
    loadSkierSprites(2),
    loadSkierSprites(3),
    loadSkierSprites(4),
  ]);
}

// Get a character number based on player index (for multiplayer variety)
export function getCharacterForPlayer(playerIndex: number): SkierCharacter {
  return ((playerIndex % 4) + 1) as SkierCharacter;
}
