/** Previous-ish month bucket in YYYY-MM (memo runs on the 1st, for the month just past). */
export function currentPeriod(now = new Date()): string {
  const d = new Date(now.getTime());
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
