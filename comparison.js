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
      const ambiguous = !group.name.trim() || group.a.length > 1 || group.b.length > 1;
      const activatedA = group.a.some(c => c.rises.length > 0);
      const activatedB = group.b.some(c => c.rises.length > 0);
      const status = ambiguous ? 'ambiguous' : !group.a.length ? 'missing_a' : !group.b.length ? 'missing_b' :
        activatedA && activatedB ? 'both' : activatedA ? 'only_a' : activatedB ? 'only_b' : 'neither';
      return {...group, activatedA, activatedB, status};
    });
  }
  root.compareRecords = compareRecords;
  if (typeof module !== 'undefined') module.exports = {compareRecords};
})(typeof window !== 'undefined' ? window : globalThis);
