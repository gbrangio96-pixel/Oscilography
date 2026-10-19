/* Comparação por identificação e fase do CFG, sem inferência de equivalência. */
(function (root) {
  function compareRecords(a, b) {
    const groups = new Map();
    for (const [side, record] of [['a', a], ['b', b]]) {
      for (const channel of record.channels) {
        const key = JSON.stringify([channel.name, channel.phase]);
        if (!groups.has(key)) groups.set(key, {name: channel.name, phase: channel.phase, a: [], b: []});
        groups.get(key)[side].push(channel);
      }
    }
    return [...groups.values()].map(group => {
      const unique = group.name.trim() && group.a.length === 1 && group.b.length === 1;
      const ambiguous = !group.name.trim() || group.a.length > 1 || group.b.length > 1;
      const left = group.a[0], right = group.b[0];
      const deltas = unique ? left.rises.slice(0, right.rises.length).map((t, i) => right.rises[i] - t) : [];
      const same = unique && left.initial === right.initial && left.final === right.final &&
        left.rises.length === right.rises.length && left.falls.length === right.falls.length &&
        left.rises.every((t, i) => Math.abs(t - right.rises[i]) < 1e-9) &&
        left.falls.every((t, i) => Math.abs(t - right.falls[i]) < 1e-9);
      return {...group, deltas, status: ambiguous ? 'ambiguous' : !group.a.length ? 'only_b' : !group.b.length ? 'only_a' : same ? 'same' : 'different'};
    });
  }
  root.compareRecords = compareRecords;
  if (typeof module !== 'undefined') module.exports = {compareRecords};
})(typeof window !== 'undefined' ? window : globalThis);
