/** Human name for a skill key, falling back to a title-cased version of the key. */
export function getSkillNameFromList(
  key: string,
  skillsList: Array<{ key: string; name: string; abilityKey: string }>,
) {
  const found = skillsList.find((s) => s.key === key);
  return found?.name ?? key.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
