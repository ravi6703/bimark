import { createContext, useContext } from "react";

/**
 * Current brand's display name (multi-brand support) — so platform previews
 * (DraftCard -> PlatformPreview) show the actual selected brand instead of
 * always rendering "Board Infinity" regardless of which workspace is active.
 */
const BrandNameContext = createContext<string>("Board Infinity");

export const BrandNameProvider = BrandNameContext.Provider;

export function useBrandName(): string {
  return useContext(BrandNameContext);
}
