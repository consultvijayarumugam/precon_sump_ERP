// Sizing the login scene: it's drawn on the web's 400 x 160 canvas and scaled to fit.

export const SCENE_W = 400;
export const SCENE_H = 160;

/** Scale to the available width (never above 1.6x on tablets), and the height that gives. */
export function fitScene(width: number, maxScale = 1.6): { scale: number; height: number } {
  const scale = Math.max(0, Math.min(width / SCENE_W, maxScale));
  return { scale, height: Math.round(SCENE_H * scale) };
}

/**
 * Where to place the 400 x 160 canvas inside a box of the given size so that,
 * scaled about its centre (React Native's transform origin), it fills the box
 * from the top-left.
 */
export function canvasOffset(boxWidth: number, boxHeight: number): { left: number; top: number } {
  return { left: (boxWidth - SCENE_W) / 2, top: (boxHeight - SCENE_H) / 2 };
}
