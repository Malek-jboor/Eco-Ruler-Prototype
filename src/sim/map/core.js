(function initializeMapCore(namespace) {
  const mapViewBox = { width: 1120, height: 760 };
  const waterTerrainId = 'ocean';

  const profileSettings = {
    temperate: {
      terrainWeights: { mountains: 18, hills: 10, plains: 36.5, forests: 10, desert: 14, swamps: 11.5 },
      riverEveryLandRegions: 72,
      minimumRivers: 2,
      riverLength: { min: 6, max: 12 },
      lakeRatio: 0.018,
      oasisChance: 0.08
    },
    arid: {
      terrainWeights: { mountains: 18, hills: 18, plains: 17, forests: 12, desert: 30.5, swamps: 4.5 },
      riverEveryLandRegions: 96,
      minimumRivers: 1,
      riverLength: { min: 4, max: 8 },
      lakeRatio: 0.008,
      oasisChance: 0.16
    },
    humid: {
      terrainWeights: { mountains: 18, hills: 10, plains: 24, forests: 20, desert: 12, swamps: 16 },
      riverEveryLandRegions: 58,
      minimumRivers: 3,
      riverLength: { min: 7, max: 13 },
      lakeRatio: 0.028,
      oasisChance: 0.03
    },
    cold: {
      terrainWeights: { mountains: 32, hills: 20, plains: 15.5, forests: 15.5, desert: 12, swamps: 5 },
      riverEveryLandRegions: 82,
      minimumRivers: 2,
      riverLength: { min: 6, max: 11 },
      lakeRatio: 0.014,
      oasisChance: 0.02
    }
  };

  const terrainBandMultipliers = {
    north: { mountains: 2.2, hills: 1.45, plains: 0.85, forests: 0.92, desert: 0.42, swamps: 0.5 },
    center: { mountains: 0.58, hills: 0.96, plains: 1.32, forests: 1.42, desert: 0.58, swamps: 1.18 },
    south: { mountains: 0.45, hills: 0.86, plains: 0.98, forests: 0.42, desert: 2.05, swamps: 0.34 }
  };

  const terrainCompatibility = {
    mountains: { mountains: 1, hills: 0.82, forests: 0.34, plains: 0.25, desert: 0.18, swamps: 0.08, ocean: 0.05 },
    hills: { mountains: 0.82, hills: 1, forests: 0.58, plains: 0.62, desert: 0.45, swamps: 0.22, ocean: 0.1 },
    plains: { mountains: 0.25, hills: 0.62, forests: 0.64, plains: 1, desert: 0.58, swamps: 0.44, ocean: 0.18 },
    forests: { mountains: 0.34, hills: 0.58, forests: 1, plains: 0.64, desert: 0.18, swamps: 0.66, ocean: 0.16 },
    desert: { mountains: 0.18, hills: 0.45, forests: 0.18, plains: 0.58, desert: 1, swamps: 0.05, ocean: 0.12 },
    swamps: { mountains: 0.08, hills: 0.22, forests: 0.66, plains: 0.44, desert: 0.05, swamps: 1, ocean: 0.24 }
  };

  const terrainCodes = {
    mountains: 'MNT',
    hills: 'HIL',
    plains: 'PLN',
    forests: 'FOR',
    desert: 'DES',
    swamps: 'SWP',
    ocean: 'OCN'
  };

  const traitAbbreviations = {
    river: 'Riv',
    lake: 'Lak',
    coast: 'Sea',
    oasis: 'Oas',
    'high-fertility': 'Fer',
    'forest-density': 'Den',
    'scattered-trees': 'Trs',
    'mineral-vein': 'Min',
    'precious-vein': 'Prc',
    'gem-vein': 'Gem',
    volcanic: 'Vol',
    'oyster-bed': 'Oys',
    'god-bless': 'God'
  };

  const shapeSizeScale = { small: 1, medium: 1.25, large: 1.45 };
  const riverShapeLengthScale = { pangea: 1.12, continental: 1, islands: 0.72 };

  function hashSeed(seed) {
    const text = String(seed || 'eco-ruler');
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function createRandom(seed) {
    let value = hashSeed(seed);
    return function random() {
      value += 0x6D2B79F5;
      let result = value;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function landTerrainIds() {
    return namespace.data.landTerrainIds || namespace.data.terrainTypes.filter((terrain) => terrain.id !== waterTerrainId).map((terrain) => terrain.id);
  }

  function isWaterTerrain(terrainId) {
    return terrainId === waterTerrainId;
  }

  function isLandTerrain(terrainId) {
    return !isWaterTerrain(terrainId);
  }

  function clampPercent(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return 0;
    }
    const clampedValue = Math.max(0, Math.min(100, numericValue));
    return Math.round(clampedValue * 100) / 100;
  }

  function normalizeTerrainWeights(weights = {}) {
    const normalized = {};
    landTerrainIds().forEach((terrainId) => {
      normalized[terrainId] = clampPercent(weights[terrainId]);
    });

    const total = Object.values(normalized).reduce((sum, value) => sum + value, 0);
    if (total > 0) {
      return normalized;
    }

    landTerrainIds().forEach((terrainId) => {
      normalized[terrainId] = 1;
    });
    return normalized;
  }

  function normalizeClusterStrength(value) {
    return clampPercent(value);
  }

  function normalizeWorldProfile(value) {
    const fallback = namespace.data.mapDefaults.worldProfile || 'temperate';
    const profileId = String(value || fallback);
    return profileSettings[profileId] ? profileId : fallback;
  }

  function normalizeWorldShape(value) {
    const fallback = namespace.data.mapDefaults.worldShape || 'pangea';
    const shapeId = String(value || fallback);
    return namespace.data.worldShapes.some((shape) => shape.id === shapeId) ? shapeId : fallback;
  }

  function normalizeMapSize(value) {
    const fallback = namespace.data.mapDefaults.mapSize || 'small';
    const sizeId = String(value || fallback);
    return namespace.data.mapSizes.some((size) => size.id === sizeId) ? sizeId : fallback;
  }

  function profileFor(profileId) {
    return profileSettings[normalizeWorldProfile(profileId)];
  }

  function mapSizeFor(mapSize) {
    const sizeId = normalizeMapSize(mapSize);
    return namespace.data.mapSizes.find((size) => size.id === sizeId) || namespace.data.mapSizes[0];
  }

  function bandForPosition(y) {
    const ratio = y / mapViewBox.height;
    if (ratio < 0.34) return 'north';
    if (ratio < 0.67) return 'center';
    return 'south';
  }

  function regionIdFor(index) {
    return `region-${String(index + 1).padStart(4, '0')}`;
  }

  function weightedPick(options, random) {
    const total = options.reduce((sum, option) => sum + Math.max(0, option.weight), 0);
    if (total <= 0) {
      return options[0]?.value ?? options[0]?.terrainId;
    }

    let roll = random() * total;
    for (const option of options) {
      roll -= Math.max(0, option.weight);
      if (roll <= 0) {
        return option.value ?? option.terrainId;
      }
    }
    const last = options[options.length - 1];
    return last.value ?? last.terrainId;
  }

  namespace.mapCore = Object.freeze({
    hashSeed,
    createRandom,
    landTerrainIds,
    isWaterTerrain,
    isLandTerrain,
    clampPercent,
    normalizeTerrainWeights,
    normalizeClusterStrength,
    normalizeWorldProfile,
    normalizeWorldShape,
    normalizeMapSize,
    profileFor,
    mapSizeFor,
    bandForPosition,
    regionIdFor,
    weightedPick,
    mapViewBox,
    waterTerrainId,
    terrainBandMultipliers,
    terrainCompatibility,
    terrainCodes,
    traitAbbreviations,
    shapeSizeScale,
    riverShapeLengthScale
  });
})(window.EcoRuler = window.EcoRuler || {});
