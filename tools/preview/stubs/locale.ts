/**
 * Stub for @/utils/locale
 *
 * The real locale utility imports from @tanstack/react-start
 * which requires SSR infrastructure. For the preview tool,
 * we provide minimal stubs.
 */

export type Locale = "en-US"

export function isLocale(_locale: string): _locale is Locale {
	return true
}

export function isRTL(_locale: string): boolean {
	return false
}

export const getLocale = () => "en-US"

export const loadLocale = async (_locale: string) => {
	// no-op for preview
}

export const localeMap = {} as Record<string, unknown>
