/** Return available matches promptly; the complete result can still populate the normal cache. */
export async function collectEarly(jobs, maxWaitMs = 3500, graceMs = 150) {
  const groups = jobs.map(() => []);
  let notify;
  const first = new Promise(resolve => { notify = resolve; });
  const complete = Promise.all(jobs.map((job, index) => Promise.resolve(job).then(rows => {
    groups[index] = Array.isArray(rows) ? rows : [];
    if (groups[index].length) notify();
  }).catch(() => {}))).then(() => groups.flat());
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  let timer;
  const deadline = new Promise(resolve => { timer = setTimeout(resolve, maxWaitMs); });
  await Promise.race([first, complete, deadline]);
  clearTimeout(timer);
  if (groups.some(rows => rows.length)) await Promise.race([complete, wait(graceMs)]);
  return { tracks: groups.flat(), complete };
}
