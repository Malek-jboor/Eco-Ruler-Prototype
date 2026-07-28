(function initializeMapGenerator(namespace) {
  const {
    waterTerrainId,
    terrainCodes,
    traitAbbreviations,
    createRandom,
    isWaterTerrain,
    normalizeTerrainWeights,
    normalizeClusterStrength,
    normalizeWorldProfile,
    normalizeWorldShape,
    normalizeMapSize,
    profileFor,
    mapSizeFor,
    bandForPosition
  } = namespace.mapCore;
  const { createOrganicLayout } = namespace.mapGeometry;
  const { assignLandMask } = namespace.mapWorldShapes;
  const {
    createInitialTerrainAssignments,
    smoothTerrainAssignments,
    enforceMinimumTerrainCounts
  } = namespace.mapTerrain;
  const { addNaturalTraits } = namespace.mapTraits;
  function summarizeMap(regions) {
    const terrainCounts = {};
    const traitCounts = {};
    namespace.data.terrainTypes.forEach((terrain) => { terrainCounts[terrain.id] = 0; });
    namespace.resources.naturalTraits.forEach((trait) => { traitCounts[trait.id] = 0; });

    regions.forEach((region) => {
      terrainCounts[region.terrainId] += 1;
      region.traits.forEach((traitId) => { traitCounts[traitId] += 1; });
    });

    const waterRegions = regions.filter((region) => region.terrainId === waterTerrainId).length;
    const landRegions = regions.length - waterRegions;

    return {
      totalRegions: regions.length,
      landRegions,
      waterRegions,
      terrainCounts,
      traitCounts,
      traitBearingRegions: regions.filter((region) => region.traits.length > 0).length
    };
  }

  function buildRegionsFromLayouts(layouts, terrainAssignments, traitSets) {
    return layouts.map((layout) => {
      const terrainId = terrainAssignments[layout.index];
      const isWater = isWaterTerrain(terrainId);
      const traits = isWater ? [] : (traitSets[layout.index] || []);
      const band = isWater ? 'water' : bandForPosition(layout.center.y);
      const region = namespace.models.createRegion({
        id: layout.id,
        name: isWater ? `Ocean Province ${String(layout.index + 1).padStart(3, '0')}` : layout.name,
        terrainId,
        traits,
        neighbors: layout.neighbors,
        discovered: true,
        resourceCandidates: isWater ? [] : namespace.resources.getResourceCandidates(terrainId, traits),
        notes: isWater ? 'water province' : `${band} climate band`
      });

      region.index = layout.index;
      region.grid = layout.grid;
      region.center = layout.center;
      region.polygon = layout.polygon;
      region.edgeScore = layout.edgeScore;
      region.isWater = isWater;
      region.terrainCode = terrainCodes[terrainId] || terrainId.slice(0, 3).toUpperCase();
      region.traitCodes = traits.map((traitId) => traitAbbreviations[traitId] || traitId.slice(0, 3));
      return region;
    });
  }

  function buildRiverLines(layouts, riverPaths) {
    return riverPaths.map((path, index) => ({
      id: `river-${String(index + 1).padStart(2, '0')}`,
      regionIds: path.map((regionIndex) => layouts[regionIndex].id),
      points: path.map((regionIndex) => layouts[regionIndex].center)
    }));
  }
  function generateRegionMap(options = {}) {
    const defaults = namespace.data.mapDefaults;
    const mapSize = normalizeMapSize(options.mapSize || defaults.mapSize);
    const size = mapSizeFor(mapSize);
    const width = Math.max(4, Number(options.width || size.width || defaults.width));
    const height = Math.max(4, Number(options.height || size.height || defaults.height));
    const seed = String(options.seed || defaults.seed);
    const worldProfile = normalizeWorldProfile(options.worldProfile || defaults.worldProfile);
    const worldShape = normalizeWorldShape(options.worldShape || defaults.worldShape);
    const clusterStrength = normalizeClusterStrength(options.clusterStrength ?? defaults.clusterStrength);
    const terrainWeights = normalizeTerrainWeights(profileFor(worldProfile).terrainWeights);
    const layout = createOrganicLayout(width, height, seed, worldShape, mapSize);
    const landMask = assignLandMask(layout.layouts, width, height, seed, worldShape, mapSize);
    const random = createRandom(`${seed}:${worldProfile}:${worldShape}:${mapSize}:${clusterStrength}:terrain-layer`);
    const initialTerrainAssignments = createInitialTerrainAssignments(layout.layouts, landMask, terrainWeights, random);
    const smoothedTerrainAssignments = smoothTerrainAssignments(layout.layouts, initialTerrainAssignments, terrainWeights, clusterStrength, random);
    const terrainAssignments = enforceMinimumTerrainCounts(layout.layouts, smoothedTerrainAssignments, terrainWeights, random);
    const naturalLayer = addNaturalTraits(layout.layouts, terrainAssignments, seed, worldProfile, mapSize, worldShape);
    const regions = buildRegionsFromLayouts(layout.layouts, terrainAssignments, naturalLayer.traitSets);
    const capacitySummary = namespace.resourceCapacity.applyToRegions(regions, seed);

    return {
      seed,
      width,
      height,
      mapSize,
      worldProfile,
      worldShape,
      clusterStrength,
      terrainWeights,
      viewBox: layout.viewBox,
      boundary: layout.boundary,
      regions,
      rivers: buildRiverLines(layout.layouts, naturalLayer.riverPaths),
      selectedRegionId: null,
      summary: {
        ...summarizeMap(regions),
        ...capacitySummary
      }
    };
  }

  namespace.mapGenerator = Object.freeze({
    generateRegionMap,
    normalizeTerrainWeights,
    normalizeClusterStrength,
    normalizeWorldProfile,
    normalizeWorldShape,
    normalizeMapSize
  });
})(window.EcoRuler = window.EcoRuler || {});
