(function initializeSettlementHierarchy(namespace) {
  const MAX_CONTROL_ZONE_DISTANCE = 3;

  function regionById(state, regionId) {
    return (state.map.regions || []).find((region) => region.id === regionId) || null;
  }

  function provinceDistance(state, fromRegionId, toRegionId, maximum = Infinity) {
    if (!fromRegionId || !toRegionId) return Infinity;
    if (fromRegionId === toRegionId) return 0;
    const visited = new Set([fromRegionId]);
    let frontier = [fromRegionId];
    let distance = 0;
    while (frontier.length && distance < maximum) {
      distance += 1;
      const next = [];
      frontier.forEach((regionId) => {
        const region = regionById(state, regionId);
        (region ? region.neighbors : []).forEach((neighborId) => {
          if (visited.has(neighborId)) return;
          if (neighborId === toRegionId) next.found = true;
          visited.add(neighborId);
          next.push(neighborId);
        });
      });
      if (next.found) return distance;
      frontier = next;
    }
    return Infinity;
  }

  function capital(state) {
    const id = state.player.capitalSettlementId || state.player.capitalId;
    return (state.player.cities || []).find((city) => city.id === id || city.isCapital) || null;
  }

  function isTownCenter(settlement) {
    return Boolean(settlement && settlement.settlementKind !== 'village'
      && ['town', 'city', 'metropolis'].includes(settlement.settlementTier || settlement.level));
  }

  function parentTown(state, village) {
    return (state.player.cities || []).find((city) => city.id === village.parentTownId && isTownCenter(city)) || null;
  }

  function candidateParentTowns(state, regionId) {
    return (state.player.cities || []).filter(isTownCenter).map((town) => ({
      town,
      distance: provinceDistance(state, town.regionId, regionId, MAX_CONTROL_ZONE_DISTANCE)
    })).filter((entry) => Number.isFinite(entry.distance) && entry.distance <= MAX_CONTROL_ZONE_DISTANCE);
  }

  function validateSettlement(state, settlement) {
    const realmCapital = capital(state);
    if (settlement.isCapital) {
      return settlement.id === (realmCapital && realmCapital.id)
        ? { valid: true }
        : { valid: false, reason: 'Only one State Capital may exist.' };
    }
    if (settlement.settlementKind === 'village' || settlement.settlementIdentity === 'village') {
      const parent = parentTown(state, settlement);
      if (!parent) return { valid: false, reason: 'A Village requires one fixed parent Town.' };
      const distance = provinceDistance(state, parent.regionId, settlement.regionId, MAX_CONTROL_ZONE_DISTANCE);
      return distance <= MAX_CONTROL_ZONE_DISTANCE
        ? { valid: true, parentTown: parent, distance }
        : { valid: false, reason: 'The parent Town is outside the three-province Control Zone.', distance };
    }
    return realmCapital && settlement.capitalId === realmCapital.id && settlement.parentTownId == null
      ? { valid: true, capital: realmCapital }
      : { valid: false, reason: 'Every secondary Town or City must report directly to the State Capital.' };
  }

  function branchForTown(state, townId) {
    const town = (state.player.cities || []).find((city) => city.id === townId && isTownCenter(city)) || null;
    if (!town) return null;
    return {
      town,
      villages: (state.player.cities || []).filter((city) => (
        (city.settlementKind === 'village' || city.settlementIdentity === 'village')
        && city.parentTownId === town.id
      ))
    };
  }

  function hierarchySummary(state) {
    const realmCapital = capital(state);
    return {
      capital: realmCapital,
      branches: (state.player.cities || []).filter(isTownCenter)
        .filter((town) => !town.isCapital)
        .map((town) => branchForTown(state, town.id)),
      capitalVillages: realmCapital ? branchForTown(state, realmCapital.id).villages : []
    };
  }

  namespace.settlementHierarchy = Object.freeze({
    MAX_CONTROL_ZONE_DISTANCE,
    regionById,
    provinceDistance,
    capital,
    isTownCenter,
    parentTown,
    candidateParentTowns,
    validateSettlement,
    branchForTown,
    hierarchySummary
  });
})(window.EcoRuler = window.EcoRuler || {});