/* Comparação por identificação e fase do CFG, sem inferência de equivalência. */
(function (root) {
  const activations = c => c.activations || c.rises;
  const initialActive = c => c.initial_active ?? Boolean(c.initial);
  const activeSamples = c => c.asserted_samples ?? c.active_samples;
  function compareRecords(a, b) {
    const groups = new Map();
    for (const [side, record] of [['a', a], ['b', b]]) {
      for (const channel of record.channels) {
        const cl = channel.classification;
        const semantic = cl?.canonical && ['confirmed','manual'].includes(cl.status);
        const functionKey=channel.ansi_functions?.length?channel.ansi_functions.map(f=>f.code).sort().join('/'):(cl?.function||'');
        const key = JSON.stringify(semantic ? ['meaning',cl.canonical,cl.category,functionKey,channel.phase] : ['name',channel.name,channel.phase]);
        if (!groups.has(key)) groups.set(key, {name: semantic ? cl.canonical : channel.name, phase: channel.phase, basis: semantic ? 'Equivalência confirmada em perfil' : 'Nome e fase originais', a: [], b: []});
        groups.get(key)[side].push(channel);
      }
    }
    return [...groups.values()].map(group => {
      const ambiguous = !group.name.trim() || group.a.length > 1 || group.b.length > 1 || [...group.a,...group.b].some(c=>c.classification?.status==='conflict');
      const activatedA = group.a.some(c => activations(c).length > 0);
      const activatedB = group.b.some(c => activations(c).length > 0);
      const status = ambiguous ? 'ambiguous' : !group.a.length ? 'missing_a' : !group.b.length ? 'missing_b' :
        activatedA && activatedB ? 'both' : activatedA ? 'only_a' : activatedB ? 'only_b' : 'neither';
      return {...group, activatedA, activatedB, status};
    });
  }
  root.channelActivations = activations;
  root.channelInitialActive = initialActive;
  root.channelActiveSamples = activeSamples;
  root.compareRecords = compareRecords;
  if (typeof module !== 'undefined') module.exports = {compareRecords, channelActivations:activations, channelInitialActive:initialActive};
})(typeof window !== 'undefined' ? window : globalThis);
