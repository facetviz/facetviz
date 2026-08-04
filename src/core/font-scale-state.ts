/**
 * Shared per-render font-scale context, written once at the top of
 * `FacetViz#render` (theme.ts's `applyTheme`) and read synchronously within
 * that same render by `sanitizeStyle` (utils.ts) -- same "module-level state
 * for the duration of one render" contract `FONTS` itself already relies on.
 *
 * Lives in its own leaf module (no imports) so both `theme.ts` and
 * `utils.ts` can read it without creating a circular import between them.
 */
export const FONT_SCALE_STATE = { scale: 1, scaleExplicit: false };
