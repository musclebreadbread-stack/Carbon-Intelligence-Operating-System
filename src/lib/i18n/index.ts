/**
 * Public i18n API.
 *
 * Re-exports the locale types, constants, dictionaries, and lookup utilities.
 */

export { DEFAULT_LOCALE, INTL_LOCALE, LOCALE_COOKIE, LOCALES, parseLocale } from "./locales";
export type { Locale } from "./locales";
export type { Dictionary, DictionaryKey } from "./dictionaries/ko";
export { default as ko } from "./dictionaries/ko";
export { default as en } from "./dictionaries/en";
export { getDictionary, getDictionarySync, getLocale, t } from "./server";
