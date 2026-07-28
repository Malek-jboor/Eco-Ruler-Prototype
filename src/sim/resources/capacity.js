(function initializeResourceCapacity(namespace) {
  const AVERAGE_LAND_PROVINCE_AREA_KM2 = 5500;
  const BASE_RESOURCE_CAPACITY = 55;
  const MINIMUM_RESOURCE_CAPACITY = 40;
  const MINIMUM_COMBINED_NATURAL_POTENTIAL = 5;

  const terrainFactors = Object.freeze({
    plains: 1.2,
    forests: 1,
    desert: 1,
    hills: 0.9,
    mountains: 0.75,
    swamps: 0.7
  });

  const waterCapacityPoints = Object.freeze({
    coast: 24,
    river: 12,
    lake: 20
  });

  const abundanceBands = Object.freeze([
    Object.freeze({ id: 'very-rare', label: 'Very Rare', factor: 0.15 }),
    Object.freeze({ id: 'limited', label: 'Limited', factor: 0.3 }),
    Object.freeze({ id: 'common', label: 'Common', factor: 0.5 }),
    Object.freeze({ id: 'abundant', label: 'Abundant', factor: 0.75 }),
    Object.freeze({ id: 'rich', label: 'Rich', factor: 1 })
  ]);

  const richAbundanceByTerrain = Object.freeze({
    forests: Object.freeze(new Set(['wood', 'deer', 'foxes'])),
    desert: Object.freeze(new Set(['sand', 'spices']))
  });

  const resourceCapacityProfiles = Object.freeze({
    wheat: Object.freeze({ family: 'Crop Farm', capacityType: 'land', pointsPerLevel: 5 }),
    vegetables: Object.freeze({ family: 'Crop Farm', capacityType: 'land', pointsPerLevel: 5 }),
    fruit: Object.freeze({ family: 'Crop Farm', capacityType: 'land', pointsPerLevel: 5 }),
    cotton: Object.freeze({ family: 'Crop Farm', capacityType: 'land', pointsPerLevel: 5 }),
    herbs: Object.freeze({ family: 'Crop Farm', capacityType: 'land', pointsPerLevel: 5 }),
    spices: Object.freeze({ family: 'Crop Farm', capacityType: 'land', pointsPerLevel: 5 }),
    honey: Object.freeze({ family: 'Apiary', capacityType: 'land', pointsPerLevel: 3 }),
    cattle: Object.freeze({ family: 'Animal Pasture', capacityType: 'land', pointsPerLevel: 8 }),
    sheep: Object.freeze({ family: 'Animal Pasture', capacityType: 'land', pointsPerLevel: 8 }),
    horses: Object.freeze({ family: 'Animal Pasture', capacityType: 'land', pointsPerLevel: 8 }),
    deer: Object.freeze({ family: 'Hunting/Trapping', capacityType: 'land', pointsPerLevel: 6 }),
    foxes: Object.freeze({ family: 'Hunting/Trapping', capacityType: 'land', pointsPerLevel: 6 }),
    wood: Object.freeze({ family: 'Woodcutters', capacityType: 'land', pointsPerLevel: 7 }),
    iron: Object.freeze({ family: 'Mine', capacityType: 'land', pointsPerLevel: 4 }),
    copper: Object.freeze({ family: 'Mine', capacityType: 'land', pointsPerLevel: 4 }),
    tin: Object.freeze({ family: 'Mine', capacityType: 'land', pointsPerLevel: 4 }),
    coal: Object.freeze({ family: 'Mine', capacityType: 'land', pointsPerLevel: 4 }),
    sulfur: Object.freeze({ family: 'Mine', capacityType: 'land', pointsPerLevel: 4 }),
    gold: Object.freeze({ family: 'Mine', capacityType: 'land', pointsPerLevel: 4 }),
    silver: Object.freeze({ family: 'Mine', capacityType: 'land', pointsPerLevel: 4 }),
    diamonds: Object.freeze({ family: 'Mine', capacityType: 'land', pointsPerLevel: 4 }),
    stone: Object.freeze({ family: 'Quarry', capacityType: 'land', pointsPerLevel: 5 }),
    marble: Object.freeze({ family: 'Quarry', capacityType: 'land', pointsPerLevel: 5 }),
    clay: Object.freeze({ family: 'Clay/Sand Pit', capacityType: 'land', pointsPerLevel: 4 }),
    sand: Object.freeze({ family: 'Clay/Sand Pit', capacityType: 'land', pointsPerLevel: 4 }),
    salt: Object.freeze({ family: 'Saltworks', capacityType: 'land', pointsPerLevel: 4 }),
    fish: Object.freeze({ family: 'Fishery', capacityType: 'water', pointsPerLevel: 4 }),
    pearls: Object.freeze({ family: 'Pearl Site', capacityType: 'water', pointsPerLevel: 4 })
  });

  const saltPotentialByTerrain = Object.freeze({
    desert: 4,
    plains: 3,
    swamps: 3,
    forests: 1
  });

  function roundTo(value, digits = 2) {
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
  }

  function polygonArea(points) {
    if (!Array.isArray(points) || points.length < 3) return 0;
    let doubleArea = 0;
    for (let index = 0; index < points.length; index += 1) {
      const current = points[index];
      const next = points[(index + 1) % points.length];
      doubleArea += (current.x * next.y) - (next.x * current.y);
    }
    return Math.abs(doubleArea) / 2;
  }

  function hashUnit(value) {
    const text = String(value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967296;
  }

  function abundanceFor(seed, region, resourceId) {
    if (richAbundanceByTerrain[region.terrainId]?.has(resourceId)) {
      return abundanceBands[abundanceBands.length - 1];
    }

    const relevantTraits = region.traits.filter((traitId) => traitId !== 'god-bless').sort().join(',');
    const key = `${seed}:${region.id}:${region.terrainId}:${relevantTraits}:${resourceId}:abundance`;
    const index = Math.min(abundanceBands.length - 1, Math.floor(hashUnit(key) * abundanceBands.length));
    return abundanceBands[index];
  }

  function waterCapacityFor(traits) {
    return traits.reduce((total, traitId) => total + (waterCapacityPoints[traitId] || 0), 0);
  }

  function resourceCapacityFor(areaKm2, averageAreaKm2, terrainId) {
    const terrainFactor = terrainFactors[terrainId] || 1;
    const calculated = BASE_RESOURCE_CAPACITY * (areaKm2 / Math.max(1, averageAreaKm2)) * terrainFactor;
    return Math.max(MINIMUM_RESOURCE_CAPACITY, Math.round(calculated));
  }

  function enrichCandidate(candidate, region, seed) {
    const profile = resourceCapacityProfiles[candidate.resourceId];
    if (!profile) {
      return {
        ...candidate,
        capacityFamily: 'Unclassified',
        capacityType: 'land',
        capacityPerLevel: 0,
        abundanceId: null,
        abundanceLabel: 'Unavailable',
        abundanceFactor: 0,
        calculatedNaturalPotential: 0,
        generatedMinimumBonus: 0,
        naturalPotential: 0
      };
    }

    const applicableCapacity = profile.capacityType === 'water'
      ? region.waterCapacity
      : region.resourceCapacity;

    if (!candidate.available) {
      return {
        ...candidate,
        capacityFamily: profile.family,
        capacityType: profile.capacityType,
        capacityPerLevel: profile.pointsPerLevel,
        applicableCapacity,
        abundanceId: null,
        abundanceLabel: 'Unavailable',
        abundanceFactor: 0,
        calculatedNaturalPotential: 0,
        generatedMinimumBonus: 0,
        naturalPotential: 0
      };
    }

    if (candidate.resourceId === 'salt') {
      const fixedPotential = saltPotentialByTerrain[region.terrainId] || 0;
      return {
        ...candidate,
        capacityFamily: profile.family,
        capacityType: profile.capacityType,
        capacityPerLevel: profile.pointsPerLevel,
        applicableCapacity,
        abundanceId: 'fixed-baseline',
        abundanceLabel: 'Fixed Baseline',
        abundanceFactor: null,
        calculatedNaturalPotential: fixedPotential,
        generatedMinimumBonus: 0,
        naturalPotential: fixedPotential
      };
    }

    const abundance = abundanceFor(seed, region, candidate.resourceId);
    const calculatedNaturalPotential = Math.floor(
      (applicableCapacity / profile.pointsPerLevel) * abundance.factor
    );

    return {
      ...candidate,
      capacityFamily: profile.family,
      capacityType: profile.capacityType,
      capacityPerLevel: profile.pointsPerLevel,
      applicableCapacity,
      abundanceId: abundance.id,
      abundanceLabel: abundance.label,
      abundanceFactor: abundance.factor,
      calculatedNaturalPotential,
      generatedMinimumBonus: 0,
      naturalPotential: calculatedNaturalPotential
    };
  }

  function applyCombinedMinimum(region, seed) {
    const eligible = region.resourceCandidates.filter((candidate) => candidate.available);
    const currentTotal = eligible.reduce((total, candidate) => total + candidate.naturalPotential, 0);
    let missing = Math.max(0, MINIMUM_COMBINED_NATURAL_POTENTIAL - currentTotal);
    if (!missing) return;

    const protectedResources = new Set(['fish', 'pearls', 'salt']);
    const adjustable = eligible
      .filter((candidate) => !protectedResources.has(candidate.resourceId) && candidate.capacityType === 'land')
      .sort((first, second) => {
        const firstKey = hashUnit(`${seed}:${region.id}:${first.resourceId}:minimum`);
        const secondKey = hashUnit(`${seed}:${region.id}:${second.resourceId}:minimum`);
        return secondKey - firstKey || first.resourceId.localeCompare(second.resourceId);
      });

    if (!adjustable.length) return;
    let cursor = 0;
    while (missing > 0) {
      const candidate = adjustable[cursor % adjustable.length];
      const physicalMaximum = Math.floor(region.resourceCapacity / candidate.capacityPerLevel);
      if (candidate.naturalPotential < physicalMaximum) {
        candidate.naturalPotential += 1;
        candidate.generatedMinimumBonus += 1;
        missing -= 1;
      }
      cursor += 1;
      if (cursor > adjustable.length * MINIMUM_COMBINED_NATURAL_POTENTIAL * 2) break;
    }
  }

  function applyToRegions(regions, seed) {
    const landRegions = regions.filter((region) => !region.isWater);
    const rawAreas = landRegions.map((region) => polygonArea(region.polygon));
    const totalRawLandArea = rawAreas.reduce((total, area) => total + area, 0);
    const averageRawLandArea = totalRawLandArea / Math.max(1, landRegions.length);

    regions.forEach((region) => {
      region.polygonArea = polygonArea(region.polygon);
      if (region.isWater) {
        region.areaKm2 = 0;
        region.resourceCapacity = 0;
        region.resourceCapacityUsed = 0;
        region.waterCapacity = 0;
        region.waterCapacityUsed = 0;
        region.combinedNaturalPotential = 0;
        return;
      }

      region.areaKm2 = roundTo((region.polygonArea / averageRawLandArea) * AVERAGE_LAND_PROVINCE_AREA_KM2, 2);
      region.resourceCapacity = resourceCapacityFor(
        region.areaKm2,
        AVERAGE_LAND_PROVINCE_AREA_KM2,
        region.terrainId
      );
      region.baseResourceCapacity = region.resourceCapacity;
      region.resourceCapacityUsed = 0;
      region.waterCapacity = waterCapacityFor(region.traits);
      region.waterCapacityUsed = 0;
      region.resourceCandidates = region.resourceCandidates.map((candidate) => enrichCandidate(candidate, region, seed));
      applyCombinedMinimum(region, seed);
      region.combinedNaturalPotential = region.resourceCandidates
        .filter((candidate) => candidate.available)
        .reduce((total, candidate) => total + candidate.naturalPotential, 0);
    });

    const totalLandAreaKm2 = roundTo(landRegions.reduce((total, region) => total + region.areaKm2, 0), 2);
    return {
      averageLandProvinceAreaKm2: AVERAGE_LAND_PROVINCE_AREA_KM2,
      totalLandAreaKm2,
      averageRawLandPolygonArea: roundTo(averageRawLandArea, 4),
      minimumResourceCapacity: MINIMUM_RESOURCE_CAPACITY
    };
  }

  namespace.resourceCapacity = Object.freeze({
    AVERAGE_LAND_PROVINCE_AREA_KM2,
    BASE_RESOURCE_CAPACITY,
    MINIMUM_RESOURCE_CAPACITY,
    MINIMUM_COMBINED_NATURAL_POTENTIAL,
    terrainFactors,
    waterCapacityPoints,
    abundanceBands,
    richAbundanceByTerrain,
    resourceCapacityProfiles,
    saltPotentialByTerrain,
    polygonArea,
    hashUnit,
    abundanceFor,
    waterCapacityFor,
    resourceCapacityFor,
    enrichCandidate,
    applyCombinedMinimum,
    applyToRegions
  });
})(window.EcoRuler = window.EcoRuler || {});
