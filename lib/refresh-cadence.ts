/** Shared refresh intervals for useSignal polling (milliseconds). */

export const REFRESH_HOT  = 5 * 60 * 1000;   // 5 min — gen/load, flows, capture, revenue
export const REFRESH_WARM = 15 * 60 * 1000;   // 15 min — wind, solar, demand, S2, S4
export const REFRESH_COOL = 60 * 60 * 1000;   // 60 min — gas, carbon
