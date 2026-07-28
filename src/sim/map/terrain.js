(function initializeMapTerrain(namespace) {
  const {
    waterTerrainId,
    terrainBandMultipliers,
    terrainCompatibility,
    landTerrainIds,
    isWaterTerrain,
    isLandTerrain,
    normalizeClusterStrength,
    bandForPosition,
    weightedPick
  } = namespace.mapCore;
  function baseWeightFor(terrainId, layout, terrainWeights) {
    const band = bandForPosition(layout.center.y);
    const bandMultiplier = terrainBandMultipliers[band][terrainId] || 1;
    return Math.max(0, (terrainWeights[terrainId] || 0) * bandMultiplier);
  }

  function terrainOptionsFor(layout, terrainWeights, random) {
    return landTerrainIds().map((terrainId) => ({
      terrainId,
      weight: baseWeightFor(terrainId, layout, terrainWeights) * (0.92 + random() * 0.16)
    }));
  }

  function createInitialTerrainAssignments(layouts, landMask, terrainWeights, random) {
    return layouts.map((layout) => {
      if (!landMask[layout.index]) {
        return waterTerrainId;
      }
      return weightedPick(terrainOptionsFor(layout, terrainWeights, random), random);
    });
  }

  function neighborAffinityFor(terrainId, layout, layoutsById, terrainAssignments) {
    if (!layout.neighbors.length) return 0;

    const score = layout.neighbors.reduce((sum, neighborId) => {
      const neighbor = layoutsById[neighborId];
      const neighborTerrain = terrainAssignments[neighbor.index];
      return sum + (terrainCompatibility[terrainId][neighborTerrain] ?? 0.12);
    }, 0);

    return score / layout.neighbors.length;
  }

  function scoreTerrainChoice(terrainId, layout, layoutsById, terrainAssignments, terrainWeights, clusterRatio) {
    const baseWeight = baseWeightFor(terrainId, layout, terrainWeights);
    if (baseWeight <= 0) return 0;

    const distributionRatio = 1 - clusterRatio;
    const ids = landTerrainIds();
    const averageBaseWeight = ids.reduce((sum, id) => sum + baseWeightFor(id, layout, terrainWeights), 0) / ids.length;
    const neighborAffinity = neighborAffinityFor(terrainId, layout, layoutsById, terrainAssignments);
    const profileBias = Math.sqrt(baseWeight / Math.max(1, averageBaseWeight));
    const clusterWeight = neighborAffinity * Math.max(1, averageBaseWeight) * ids.length * profileBias;

    return (baseWeight * distributionRatio) + (clusterWeight * clusterRatio);
  }

  function smoothTerrainAssignments(layouts, terrainAssignments, terrainWeights, clusterStrength, random) {
    const clusterRatio = normalizeClusterStrength(clusterStrength) / 100;
    if (clusterRatio <= 0) return terrainAssignments;

    const layoutsById = Object.fromEntries(layouts.map((layout) => [layout.id, layout]));
    const passes = clusterRatio >= 0.72 ? 5 : 3;
    let currentAssignments = [...terrainAssignments];

    for (let pass = 0; pass < passes; pass += 1) {
      const nextAssignments = [...currentAssignments];
      layouts.forEach((layout) => {
        if (isWaterTerrain(currentAssignments[layout.index])) return;
        const options = landTerrainIds().map((terrainId) => ({
          terrainId,
          weight: scoreTerrainChoice(terrainId, layout, layoutsById, currentAssignments, terrainWeights, clusterRatio)
        }));
        nextAssignments[layout.index] = weightedPick(options, random);
      });
      currentAssignments = nextAssignments;
    }

    if (clusterRatio < 0.45) return currentAssignments;

    return currentAssignments.map((terrainId, index) => {
      if (isWaterTerrain(terrainId)) return terrainId;
      const layout = layouts[index];
      const sameNeighborCount = layout.neighbors.reduce((count, neighborId) => {
        const neighbor = layoutsById[neighborId];
        return count + (currentAssignments[neighbor.index] === terrainId ? 1 : 0);
      }, 0);

      if (sameNeighborCount > 0) return terrainId;

      const options = landTerrainIds().map((id) => ({
        terrainId: id,
        weight: scoreTerrainChoice(id, layout, layoutsById, currentAssignments, terrainWeights, Math.min(1, clusterRatio + 0.18))
      }));
      return weightedPick(options, random);
    });
  }

  function minimumTerrainCountFor(terrainAssignments) {
    const landCount = terrainAssignments.filter(isLandTerrain).length;
    return Math.min(3, Math.floor(landCount / Math.max(1, landTerrainIds().length)));
  }

  function terrainAssignmentCounts(terrainAssignments) {
    const counts = {};
    landTerrainIds().forEach((terrainId) => { counts[terrainId] = 0; });
    terrainAssignments.forEach((terrainId) => {
      if (counts[terrainId] !== undefined) {
        counts[terrainId] += 1;
      }
    });
    return counts;
  }

  function enforceMinimumTerrainCounts(layouts, terrainAssignments, terrainWeights, random) {
    const minimumCount = minimumTerrainCountFor(terrainAssignments);
    if (minimumCount <= 0) return terrainAssignments;

    const assignments = [...terrainAssignments];
    const terrainIds = landTerrainIds();
    const layoutsById = Object.fromEntries(layouts.map((layout) => [layout.id, layout]));
    const landIndexes = layouts
      .filter((layout) => isLandTerrain(assignments[layout.index]))
      .map((layout) => layout.index);
    const counts = terrainAssignmentCounts(assignments);
    let safety = terrainIds.length * minimumCount * 3;

    while (safety > 0) {
      safety -= 1;
      const terrainId = terrainIds.find((id) => (counts[id] || 0) < minimumCount);
      if (!terrainId) break;

      let donorIndexes = landIndexes.filter((index) => assignments[index] !== terrainId && (counts[assignments[index]] || 0) > minimumCount);
      if (!donorIndexes.length) {
        donorIndexes = landIndexes.filter((index) => assignments[index] !== terrainId);
      }
      if (!donorIndexes.length) break;

      const candidates = donorIndexes.map((index) => {
        const layout = layouts[index];
        const donorPressure = Math.max(0, (counts[assignments[index]] || 0) - minimumCount) * 4;
        return {
          value: index,
          weight: scoreTerrainChoice(terrainId, layout, layoutsById, assignments, terrainWeights, 0.68) + donorPressure + random() * 0.45
        };
      });
      const selectedIndex = weightedPick(candidates, random);
      const previousTerrain = assignments[selectedIndex];
      assignments[selectedIndex] = terrainId;
      counts[previousTerrain] = Math.max(0, (counts[previousTerrain] || 0) - 1);
      counts[terrainId] = (counts[terrainId] || 0) + 1;
    }

    return assignments;
  }

  namespace.mapTerrain = Object.freeze({
    baseWeightFor,
    terrainOptionsFor,
    createInitialTerrainAssignments,
    neighborAffinityFor,
    scoreTerrainChoice,
    smoothTerrainAssignments,
    minimumTerrainCountFor,
    terrainAssignmentCounts,
    enforceMinimumTerrainCounts
  });
})(window.EcoRuler = window.EcoRuler || {});
