import houseImg from '../assets/images/house.png';
import mountainPeakImg from '../assets/images/mountain-peak.png';
import rockFormationImg from '../assets/images/rock_formation.png';
import treeImg from '../assets/images/tree.png';

export interface ObstacleSprites {
  house: HTMLImageElement;
  mountainPeak: HTMLImageElement;
  rockFormation: HTMLImageElement;
  tree: HTMLImageElement;
}

const spriteUrls = {
  house: houseImg,
  mountainPeak: mountainPeakImg,
  rockFormation: rockFormationImg,
  tree: treeImg,
};

let loadedSprites: ObstacleSprites | null = null;
let loadingPromise: Promise<ObstacleSprites> | null = null;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function loadObstacleSprites(): Promise<ObstacleSprites> {
  if (loadedSprites) return loadedSprites;
  if (loadingPromise) return loadingPromise;

  const promise = Promise.all([
    loadImage(spriteUrls.house),
    loadImage(spriteUrls.mountainPeak),
    loadImage(spriteUrls.rockFormation),
    loadImage(spriteUrls.tree),
  ]).then(([house, mountainPeak, rockFormation, tree]) => {
    const sprites: ObstacleSprites = { house, mountainPeak, rockFormation, tree };
    loadedSprites = sprites;
    loadingPromise = null;
    return sprites;
  });

  loadingPromise = promise;
  return promise;
}

export function getObstacleSprites(): ObstacleSprites | null {
  return loadedSprites;
}

export async function preloadObstacleSprites(): Promise<void> {
  await loadObstacleSprites();
}

