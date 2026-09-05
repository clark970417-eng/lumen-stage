/** The scene format supports 1–100%; keep watt controls inside that range. */
export const minimumWatts = (ratedWatts: number) => Math.ceil(ratedWatts / 100)
export const wattsToPercent = (watts: number, ratedWatts: number) =>
  Math.min(100, Math.max(1, watts / ratedWatts * 100))
