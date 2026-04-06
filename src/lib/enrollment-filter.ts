/**
 * Filter enrollments by user selection.
 *
 * If the user has any enrollment with userSelected=true, return only those.
 * Otherwise return all enrollments (backwards compat for legacy users).
 */
export function filterByUserSelection<
  T extends { userSelected: boolean | null },
>(enrollments: T[]): T[] {
  const hasSelections = enrollments.some((e) => e.userSelected === true);
  if (!hasSelections) return enrollments;
  return enrollments.filter((e) => e.userSelected === true);
}
