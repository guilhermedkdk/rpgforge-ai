const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when the string is a UUID (used to branch id-vs-slug lookups). */
export const isUuid = (value: string): boolean => UUID_REGEX.test(value);
