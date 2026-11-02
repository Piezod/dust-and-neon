export const CAMERA_CONFIG = Object.freeze({
  desktopHeight: 34,
  desktopMinimumWidth: 45,
  mobileHeight: 18.5,
  mobileMinimumWidth: 30,
  mobilePixelRatio: 1.25,
  bossHeightMultiplier: 1.25,
  bossFocusWeight: 0.45,
  bossMaximumFocusOffset: 6,
})

export function isTouchDevice(): boolean {
  return window.matchMedia('(pointer: coarse)').matches
    || navigator.maxTouchPoints > 0 && Math.min(window.innerWidth, window.innerHeight) <= 600
}

export function getCameraViewHeight(width: number, height: number, mobile: boolean, zoom: number): number {
  const aspect = Math.max(1, width) / Math.max(1, height)
  return mobile
    ? Math.max(CAMERA_CONFIG.mobileHeight, CAMERA_CONFIG.mobileMinimumWidth / aspect) / zoom
    : Math.max(CAMERA_CONFIG.desktopHeight, CAMERA_CONFIG.desktopMinimumWidth / aspect)
}