(function initializeMapGenerator(namespace) {
  const terrainBandMultipliers = {
    north: {
      mountains: 2.2,
      hills: 1.45,
      plains: 0.85,
      forests: 0.9,
      desert: 0.45,
      swamps: 0.55
    },
    center: {
      mountains: 0.55,
      hills: 0.95,
      plains: 1.3,
      forests: 1.45,
      desert: 0.6,
      swamps: 1.25
    },
    south: {
      mountains: 0.45,
      hills: 0.85,
      plains: 1.0,
      forests: 0.42,
      desert: 2.1,
      swamps: 0.35
    }
  };

  const terrainCodes = {
    mountains: 'MNT',
    hills: 'HIL',
    plains: 'PLN',
    forests: 'FOR',
    desert: 'DES',
    swamps: 'SWP'
  };

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

  function clampWeight(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round(numericValue)));
  }

  function normalizeTerrainWeights(weights = {}) {
    const normalized = {};
    namespace.data.terrainTypes.forEach((terrain) => {
      normalized[terrain.id] = clampWeight(weights[terrain.id]);
    });

    const total = Object.values(normalized).reduce((sum, value) => sum + value, 0);
    if (total > 0) {
      return normalized;
    }

    namespace.data.terrainTypes.forEach((terrain) => {
      normalized[terrain.id] = 1;
    });
    return normalized;
  }

  function bandForRow(row, height) {
    const yRatio = height <= 1 ? 0 : row / (height - 1);
    if (yRatio < 0.34) {
      return 'north';
    }
    if (yRatio < 0.67) {
      return 'center';
    }
    return 'south';
  }

  function regionIdFor(x, y) {
    return `region-${String((y * 100) + x + 1).padStart(4, '0')}`;
  }

  function neighborsFor(x, y, width, height) {
    const neighbors = [];
    if (y > 0) neighbors.push(regionIdFor(x, y - 1));
    if (x < width - 1) neighbors.push(regionIdFor(x + 1, y));
    if (y < height - 1) neighbors.push(regionIdFor(x, y + 1));
    if (x > 0) neighbors.push(regionIdFor(x - 1, y));
    return neighbors;
  }

  function pickWeightedTerrain(options, random) {
    const total = options.reduce((sum, option) => sum + option.weight, 0);
    let roll = random() * total;
    for (const option of options) {
      roll -= option.weight;
      if (roll <= 0) {
        return option.terrainId;
      }
    }
    return options[options.length - 1].terrainId;
  }

  function summarizeTerrain(regions) {
    const terrainCounts = {};
    namespace.data.terrainTypes.forEach((terrain) => {
      terrainCounts[terrain.id] = 0;
    });

    regions.forEach((region) => {
      terrainCounts[region.terrainId] += 1;
    });

    return {
      totalRegions: regions.length,
      terrainCounts
    };
  }

  function generateRegionMap(options = {}) {
    const defaults = namespace.data.mapDefaults;
    const width = Math.max(4, Number(options.width || defaults.width));
    const height = Math.max(4, Number(options.height || defaults.height));
    const seed = String(options.seed || defaults.seed);
    const terrainWeights = normalizeTerrainWeights(options.terrainWeights || defaults.terrainWeights);
    const random = createRandom(seed);
    const regions = [];
    const grid = [];

    for (let y = 0; y < height; y += 1) {
      const row = [];
      const band = bandForRow(y, height);

      for (let x = 0; x < width; x += 1) {
        const northTerrain = y > 0 ? grid[y - 1][x].terrainId : null;
        const westTerrain = x > 0 ? row[x - 1].terrainId : null;
        const weightedOptions = namespace.data.terrainTypes.map((terrain) => {
          const bandMultiplier = terrainBandMultipliers[band][terrain.id] || 1;
          let weight = terrainWeights[terrain.id] * bandMultiplier;

          if (northTerrain === terrain.id) {
            weight *= 1.55;
          }
          if (westTerrain === terrain.id) {
            weight *= 1.35;
          }

          weight *= 0.9 + random() * 0.2;
          return { terrainId: terrain.id, weight };
        });

        const terrainId = pickWeightedTerrain(weightedOptions, random);
        const region = namespace.models.createRegion({
          id: regionIdFor(x, y),
          name: `Region ${x + 1}-${y + 1}`,
          terrainId,
          neighbors: neighborsFor(x, y, width, height),
          discovered: true,
          notes: `${band} climate band`
        });

        region.grid = { x, y };
        region.terrainCode = terrainCodes[terrainId] || terrainId.slice(0, 3).toUpperCase();
        regions.push(region);
        row.push(region);
      }

      grid.push(row);
    }

    return {
      seed,
      width,
      height,
      terrainWeights,
      regions,
      selectedRegionId: null,
      summary: summarizeTerrain(regions)
    };
  }

  namespace.mapGenerator = Object.freeze({
    generateRegionMap,
    normalizeTerrainWeights
  });
})(window.EcoRuler = window.EcoRuler || {});

