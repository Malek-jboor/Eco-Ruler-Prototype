(function initializeMapGenerator(namespace) {
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
    'mineral-vein': 'Min',
    'precious-vein': 'Prc',
    'gem-vein': 'Gem',
    volcanic: 'Vol',
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

  function rectangleBoundary() {
    return [
      { x: 0, y: 0 },
      { x: mapViewBox.width, y: 0 },
      { x: mapViewBox.width, y: mapViewBox.height },
      { x: 0, y: mapViewBox.height }
    ];
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function createSitePoints(width, height, seed, random) {
    const points = [];
    const cellWidth = mapViewBox.width / width;
    const cellHeight = mapViewBox.height / height;
    const jitterX = cellWidth * 0.72;
    const jitterY = cellHeight * 0.68;
    const marginX = cellWidth * 0.22;
    const marginY = cellHeight * 0.22;
    const rowOffsets = Array.from({ length: height }, () => (random() - 0.5) * cellWidth * 0.42);
    const columnOffsets = Array.from({ length: width }, () => (random() - 0.5) * cellHeight * 0.32);

    for (let row = 0; row < height; row += 1) {
      const rowWave = Math.sin((row / Math.max(1, height - 1)) * Math.PI * 2.3) * cellWidth * 0.12;
      const rowStagger = row % 2 === 0 ? -cellWidth * 0.16 : cellWidth * 0.18;

      for (let column = 0; column < width; column += 1) {
        const isEdge = row === 0 || column === 0 || row === height - 1 || column === width - 1;
        const columnWave = Math.cos((column / Math.max(1, width - 1)) * Math.PI * 2.1) * cellHeight * 0.1;
        const edgeDamping = isEdge ? 0.42 : 1;
        const baseX = (column + 0.5) * cellWidth;
        const baseY = (row + 0.5) * cellHeight;
        const x = baseX + ((random() - 0.5) * jitterX + rowOffsets[row] + rowWave + rowStagger) * edgeDamping;
        const y = baseY + ((random() - 0.5) * jitterY + columnOffsets[column] + columnWave) * edgeDamping;

        points.push({
          id: regionIdFor(points.length),
          row,
          column,
          isEdge,
          x: clamp(x, marginX, mapViewBox.width - marginX),
          y: clamp(y, marginY, mapViewBox.height - marginY)
        });
      }
    }

    return points;
  }

  function clipPolygonByBisector(polygon, site, other) {
    if (polygon.length === 0) return polygon;

    const a = 2 * (other.x - site.x);
    const b = 2 * (other.y - site.y);
    const c = (other.x * other.x) + (other.y * other.y) - (site.x * site.x) - (site.y * site.y);
    const clipped = [];

    function valueFor(point) {
      return (a * point.x) + (b * point.y) - c;
    }

    for (let index = 0; index < polygon.length; index += 1) {
      const current = polygon[index];
      const previous = polygon[(index + polygon.length - 1) % polygon.length];
      const currentValue = valueFor(current);
      const previousValue = valueFor(previous);
      const currentInside = currentValue <= 0.0001;
      const previousInside = previousValue <= 0.0001;

      if (currentInside !== previousInside) {
        const ratio = previousValue / (previousValue - currentValue);
        clipped.push({
          x: previous.x + (current.x - previous.x) * ratio,
          y: previous.y + (current.y - previous.y) * ratio
        });
      }

      if (currentInside) {
        clipped.push(current);
      }
    }

    return clipped;
  }

  function fallbackPolygon(site) {
    const radius = 16;
    return [
      { x: site.x, y: site.y - radius },
      { x: site.x + radius, y: site.y },
      { x: site.x, y: site.y + radius },
      { x: site.x - radius, y: site.y }
    ];
  }

  function roundPoint(point) {
    return { x: Math.round(point.x * 10) / 10, y: Math.round(point.y * 10) / 10 };
  }

  function edgeScoreForPoint(point) {
    const xRatio = point.x / mapViewBox.width;
    const yRatio = point.y / mapViewBox.height;
    return 1 - Math.min(xRatio, yRatio, 1 - xRatio, 1 - yRatio);
  }

  function vertexKey(point) {
    return `${Math.round(point.x * 10) / 10},${Math.round(point.y * 10) / 10}`;
  }

  function pairKey(firstId, secondId) {
    return firstId < secondId ? `${firstId}|${secondId}` : `${secondId}|${firstId}`;
  }

  function distanceSquared(first, second) {
    const dx = first.center.x - second.center.x;
    const dy = first.center.y - second.center.y;
    return (dx * dx) + (dy * dy);
  }

  function addNeighbor(first, second) {
    first.neighborSet.add(second.id);
    second.neighborSet.add(first.id);
  }

  function buildNeighbors(layouts) {
    const vertices = new Map();
    layouts.forEach((layout) => {
      layout.neighborSet = new Set();
      layout.polygon.forEach((point) => {
        const key = vertexKey(point);
        const owners = vertices.get(key) || [];
        owners.push(layout.id);
        vertices.set(key, owners);
      });
    });

    const pairCounts = new Map();
    vertices.forEach((owners) => {
      const uniqueOwners = Array.from(new Set(owners));
      for (let firstIndex = 0; firstIndex < uniqueOwners.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < uniqueOwners.length; secondIndex += 1) {
          const key = pairKey(uniqueOwners[firstIndex], uniqueOwners[secondIndex]);
          pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
        }
      }
    });

    const layoutById = Object.fromEntries(layouts.map((layout) => [layout.id, layout]));
    pairCounts.forEach((count, key) => {
      if (count < 2) return;
      const [firstId, secondId] = key.split('|');
      addNeighbor(layoutById[firstId], layoutById[secondId]);
    });

    layouts.forEach((layout) => {
      const nearest = layouts
        .filter((candidate) => candidate.id !== layout.id)
        .sort((first, second) => distanceSquared(layout, first) - distanceSquared(layout, second));

      let index = 0;
      while (layout.neighborSet.size < 3 && nearest[index]) {
        addNeighbor(layout, nearest[index]);
        index += 1;
      }
    });

    layouts.forEach((layout) => {
      layout.neighbors = Array.from(layout.neighborSet).sort((firstId, secondId) => {
        return distanceSquared(layout, layoutById[firstId]) - distanceSquared(layout, layoutById[secondId]);
      });
      delete layout.neighborSet;
    });
  }

  function createOrganicLayout(width, height, seed, worldShape, mapSize) {
    const random = createRandom(`${seed}:${worldShape}:${mapSize}:organic-layout`);
    const boundary = rectangleBoundary();
    const sites = createSitePoints(width, height, seed, random);
    const layouts = sites.map((site, index) => {
      let polygon = boundary.map((point) => ({ ...point }));
      sites.forEach((other, otherIndex) => {
        if (index !== otherIndex && polygon.length > 0) {
          polygon = clipPolygonByBisector(polygon, site, other);
        }
      });

      if (polygon.length < 3) {
        polygon = fallbackPolygon(site);
      }

      return {
        id: site.id,
        index,
        name: `Region ${String(index + 1).padStart(3, '0')}`,
        grid: { x: site.column, y: site.row },
        isMapEdge: site.isEdge,
        center: roundPoint({ x: site.x, y: site.y }),
        polygon: polygon.map(roundPoint),
        edgeScore: edgeScoreForPoint(site),
        neighbors: []
      };
    });

    buildNeighbors(layouts);

    return { viewBox: { ...mapViewBox }, boundary: boundary.map(roundPoint), layouts };
  }

  function blobScore(layout, blob, width, height) {
    const xRatio = (layout.grid.x + 0.5) / width;
    const yRatio = (layout.grid.y + 0.5) / height;
    const dx = (xRatio - blob.cx) / blob.rx;
    const dy = (yRatio - blob.cy) / blob.ry;
    return 1 - Math.sqrt((dx * dx) + (dy * dy));
  }

  function randomBetween(random, min, max) {
    return min + random() * (max - min);
  }

  function varyBlob(blob, random, options = {}) {
    const jitter = options.jitter ?? 0.02;
    const radiusJitter = options.radiusJitter ?? 0.16;
    const minX = options.minX ?? 0.06;
    const maxX = options.maxX ?? 0.94;
    const minY = options.minY ?? 0.08;
    const maxY = options.maxY ?? 0.92;

    return {
      cx: clamp(blob.cx + (random() - 0.5) * jitter, minX, maxX),
      cy: clamp(blob.cy + (random() - 0.5) * jitter, minY, maxY),
      rx: blob.rx * (1 - radiusJitter / 2 + random() * radiusJitter),
      ry: blob.ry * (1 - radiusJitter / 2 + random() * radiusJitter)
    };
  }

  function createIslandBlobs(mapSize, random) {
    const presets = {
      small: {
        jitter: 0.035,
        major: [
          { cx: 0.2, cy: 0.23, rx: 0.16, ry: 0.18 },
          { cx: 0.73, cy: 0.23, rx: 0.125, ry: 0.15 },
          { cx: 0.35, cy: 0.72, rx: 0.13, ry: 0.16 },
          { cx: 0.78, cy: 0.7, rx: 0.095, ry: 0.12 },
          { cx: 0.52, cy: 0.46, rx: 0.075, ry: 0.095 }
        ],
        minor: [
          { cx: 0.11, cy: 0.47, rx: 0.034, ry: 0.048 },
          { cx: 0.21, cy: 0.57, rx: 0.028, ry: 0.04 },
          { cx: 0.42, cy: 0.31, rx: 0.032, ry: 0.044 },
          { cx: 0.6, cy: 0.3, rx: 0.03, ry: 0.042 },
          { cx: 0.64, cy: 0.84, rx: 0.03, ry: 0.04 },
          { cx: 0.89, cy: 0.42, rx: 0.032, ry: 0.046 },
          { cx: 0.88, cy: 0.82, rx: 0.026, ry: 0.038 },
          { cx: 0.48, cy: 0.86, rx: 0.026, ry: 0.038 },
          { cx: 0.08, cy: 0.78, rx: 0.026, ry: 0.038 },
          { cx: 0.9, cy: 0.14, rx: 0.024, ry: 0.036 }
        ]
      },
      medium: {
        jitter: 0.04,
        major: [
          { cx: 0.17, cy: 0.22, rx: 0.125, ry: 0.15 },
          { cx: 0.45, cy: 0.18, rx: 0.09, ry: 0.118 },
          { cx: 0.78, cy: 0.27, rx: 0.115, ry: 0.14 },
          { cx: 0.27, cy: 0.55, rx: 0.1, ry: 0.125 },
          { cx: 0.63, cy: 0.52, rx: 0.12, ry: 0.145 },
          { cx: 0.42, cy: 0.82, rx: 0.095, ry: 0.118 },
          { cx: 0.82, cy: 0.76, rx: 0.08, ry: 0.1 }
        ],
        minor: [
          { cx: 0.08, cy: 0.46, rx: 0.028, ry: 0.04 },
          { cx: 0.13, cy: 0.74, rx: 0.026, ry: 0.038 },
          { cx: 0.24, cy: 0.34, rx: 0.03, ry: 0.042 },
          { cx: 0.35, cy: 0.34, rx: 0.026, ry: 0.038 },
          { cx: 0.5, cy: 0.36, rx: 0.03, ry: 0.042 },
          { cx: 0.55, cy: 0.72, rx: 0.028, ry: 0.04 },
          { cx: 0.68, cy: 0.86, rx: 0.026, ry: 0.038 },
          { cx: 0.86, cy: 0.48, rx: 0.028, ry: 0.04 },
          { cx: 0.91, cy: 0.62, rx: 0.024, ry: 0.036 },
          { cx: 0.9, cy: 0.16, rx: 0.024, ry: 0.036 },
          { cx: 0.29, cy: 0.88, rx: 0.024, ry: 0.036 },
          { cx: 0.72, cy: 0.14, rx: 0.024, ry: 0.036 }
        ]
      },
      large: {
        jitter: 0.045,
        major: [
          { cx: 0.15, cy: 0.22, rx: 0.1, ry: 0.12 },
          { cx: 0.39, cy: 0.16, rx: 0.08, ry: 0.1 },
          { cx: 0.72, cy: 0.24, rx: 0.105, ry: 0.125 },
          { cx: 0.28, cy: 0.45, rx: 0.085, ry: 0.105 },
          { cx: 0.56, cy: 0.39, rx: 0.11, ry: 0.13 },
          { cx: 0.85, cy: 0.52, rx: 0.078, ry: 0.096 },
          { cx: 0.14, cy: 0.73, rx: 0.085, ry: 0.105 },
          { cx: 0.39, cy: 0.82, rx: 0.09, ry: 0.108 },
          { cx: 0.69, cy: 0.7, rx: 0.095, ry: 0.115 },
          { cx: 0.88, cy: 0.8, rx: 0.064, ry: 0.08 }
        ],
        minor: [
          { cx: 0.07, cy: 0.42, rx: 0.022, ry: 0.034 },
          { cx: 0.12, cy: 0.56, rx: 0.024, ry: 0.036 },
          { cx: 0.22, cy: 0.28, rx: 0.026, ry: 0.038 },
          { cx: 0.29, cy: 0.25, rx: 0.024, ry: 0.036 },
          { cx: 0.31, cy: 0.67, rx: 0.026, ry: 0.038 },
          { cx: 0.48, cy: 0.28, rx: 0.024, ry: 0.036 },
          { cx: 0.5, cy: 0.62, rx: 0.026, ry: 0.038 },
          { cx: 0.6, cy: 0.84, rx: 0.024, ry: 0.036 },
          { cx: 0.66, cy: 0.15, rx: 0.024, ry: 0.036 },
          { cx: 0.76, cy: 0.42, rx: 0.026, ry: 0.038 },
          { cx: 0.78, cy: 0.9, rx: 0.022, ry: 0.032 },
          { cx: 0.91, cy: 0.35, rx: 0.024, ry: 0.036 },
          { cx: 0.92, cy: 0.66, rx: 0.022, ry: 0.034 },
          { cx: 0.22, cy: 0.88, rx: 0.022, ry: 0.034 },
          { cx: 0.43, cy: 0.91, rx: 0.022, ry: 0.032 },
          { cx: 0.93, cy: 0.18, rx: 0.02, ry: 0.03 }
        ]
      }
    };

    const config = presets[mapSize] || presets.small;
    const major = config.major.map((blob, index) => {
      const primaryScale = index === 0 ? randomBetween(random, 1.06, 1.26) : randomBetween(random, 0.78, 1.18);
      const secondaryScale = randomBetween(random, 0.82, 1.2);
      return varyBlob({ ...blob, rx: blob.rx * primaryScale, ry: blob.ry * secondaryScale }, random, {
        jitter: config.jitter,
        radiusJitter: 0.12
      });
    });

    const minor = config.minor.map((blob) => varyBlob(blob, random, {
      jitter: config.jitter * 1.35,
      radiusJitter: 0.42,
      minX: 0.05,
      maxX: 0.95,
      minY: 0.07,
      maxY: 0.93
    }));

    return [...major, ...minor];
  }

  function createContinentalIslandBlobs(mapSize, random) {
    const presets = {
      small: [
        { cx: 0.12, cy: 0.27, rx: 0.034, ry: 0.046 },
        { cx: 0.17, cy: 0.72, rx: 0.028, ry: 0.04 },
        { cx: 0.35, cy: 0.13, rx: 0.058, ry: 0.07 },
        { cx: 0.45, cy: 0.86, rx: 0.05, ry: 0.064 },
        { cx: 0.56, cy: 0.13, rx: 0.044, ry: 0.058 },
        { cx: 0.65, cy: 0.87, rx: 0.06, ry: 0.072 },
        { cx: 0.84, cy: 0.25, rx: 0.032, ry: 0.044 },
        { cx: 0.88, cy: 0.7, rx: 0.03, ry: 0.042 },
        { cx: 0.49, cy: 0.24, rx: 0.022, ry: 0.034 },
        { cx: 0.51, cy: 0.73, rx: 0.022, ry: 0.034 }
      ],
      medium: [
        { cx: 0.1, cy: 0.24, rx: 0.03, ry: 0.044 },
        { cx: 0.13, cy: 0.74, rx: 0.026, ry: 0.038 },
        { cx: 0.31, cy: 0.12, rx: 0.058, ry: 0.07 },
        { cx: 0.42, cy: 0.88, rx: 0.052, ry: 0.064 },
        { cx: 0.54, cy: 0.12, rx: 0.045, ry: 0.058 },
        { cx: 0.66, cy: 0.88, rx: 0.058, ry: 0.07 },
        { cx: 0.85, cy: 0.3, rx: 0.03, ry: 0.044 },
        { cx: 0.9, cy: 0.7, rx: 0.026, ry: 0.038 },
        { cx: 0.47, cy: 0.24, rx: 0.022, ry: 0.034 },
        { cx: 0.52, cy: 0.76, rx: 0.024, ry: 0.036 },
        { cx: 0.24, cy: 0.9, rx: 0.022, ry: 0.032 },
        { cx: 0.76, cy: 0.1, rx: 0.022, ry: 0.032 }
      ],
      large: [
        { cx: 0.08, cy: 0.22, rx: 0.026, ry: 0.04 },
        { cx: 0.11, cy: 0.76, rx: 0.024, ry: 0.036 },
        { cx: 0.27, cy: 0.1, rx: 0.06, ry: 0.074 },
        { cx: 0.36, cy: 0.91, rx: 0.056, ry: 0.068 },
        { cx: 0.47, cy: 0.11, rx: 0.045, ry: 0.058 },
        { cx: 0.58, cy: 0.9, rx: 0.052, ry: 0.064 },
        { cx: 0.71, cy: 0.1, rx: 0.058, ry: 0.07 },
        { cx: 0.82, cy: 0.88, rx: 0.05, ry: 0.062 },
        { cx: 0.91, cy: 0.28, rx: 0.026, ry: 0.038 },
        { cx: 0.92, cy: 0.72, rx: 0.024, ry: 0.036 },
        { cx: 0.46, cy: 0.28, rx: 0.022, ry: 0.034 },
        { cx: 0.54, cy: 0.74, rx: 0.022, ry: 0.034 },
        { cx: 0.18, cy: 0.91, rx: 0.02, ry: 0.03 },
        { cx: 0.88, cy: 0.1, rx: 0.02, ry: 0.03 }
      ]
    };

    return (presets[mapSize] || presets.small).map((blob) => varyBlob(blob, random, {
      jitter: 0.045,
      radiusJitter: 0.38,
      minX: 0.04,
      maxX: 0.96,
      minY: 0.06,
      maxY: 0.94
    }));
  }

  function createContinentLobes(mainBlob, side, count, random) {
    const xBounds = side === 'left' ? { min: 0.08, max: 0.43 } : { min: 0.57, max: 0.92 };
    return Array.from({ length: count }, () => ({
      cx: clamp(mainBlob.cx + randomBetween(random, -mainBlob.rx * 0.55, mainBlob.rx * 0.55), xBounds.min, xBounds.max),
      cy: clamp(mainBlob.cy + randomBetween(random, -mainBlob.ry * 0.75, mainBlob.ry * 0.75), 0.14, 0.86),
      rx: mainBlob.rx * randomBetween(random, 0.22, 0.44),
      ry: mainBlob.ry * randomBetween(random, 0.2, 0.42)
    }));
  }

  function createContinentalMainBlobs(mapSize, random) {
    const profile = {
      small: {
        large: { rx: [0.315, 0.37], ry: [0.42, 0.5] },
        minor: { rx: [0.15, 0.195], ry: [0.23, 0.305] },
        largeLobes: 3,
        minorLobes: 1
      },
      medium: {
        large: { rx: [0.305, 0.36], ry: [0.41, 0.49] },
        minor: { rx: [0.13, 0.18], ry: [0.2, 0.285] },
        largeLobes: 4,
        minorLobes: 1
      },
      large: {
        large: { rx: [0.3, 0.365], ry: [0.4, 0.49] },
        minor: { rx: [0.13, 0.185], ry: [0.2, 0.29] },
        largeLobes: 5,
        minorLobes: 2
      }
    }[mapSize] || {
      large: { rx: [0.305, 0.36], ry: [0.4, 0.49] },
      minor: { rx: [0.13, 0.18], ry: [0.2, 0.285] },
      largeLobes: 4,
      minorLobes: 1
    };

    const leftIsLarge = random() < 0.5;
    const leftSize = leftIsLarge ? profile.large : profile.minor;
    const rightSize = leftIsLarge ? profile.minor : profile.large;
    const left = {
      cx: randomBetween(random, 0.2, 0.29),
      cy: randomBetween(random, 0.36, 0.64),
      rx: randomBetween(random, leftSize.rx[0], leftSize.rx[1]),
      ry: randomBetween(random, leftSize.ry[0], leftSize.ry[1])
    };
    const right = {
      cx: randomBetween(random, 0.71, 0.8),
      cy: randomBetween(random, 0.34, 0.66),
      rx: randomBetween(random, rightSize.rx[0], rightSize.rx[1]),
      ry: randomBetween(random, rightSize.ry[0], rightSize.ry[1])
    };

    return [
      left,
      ...createContinentLobes(left, 'left', leftIsLarge ? profile.largeLobes : profile.minorLobes, random),
      right,
      ...createContinentLobes(right, 'right', leftIsLarge ? profile.minorLobes : profile.largeLobes, random)
    ];
  }

  function createWorldBlobs(worldShape, mapSize, random) {
    if (worldShape === 'pangea') {
      return [
        { cx: 0.5, cy: 0.51, rx: 0.47, ry: 0.39 },
        { cx: 0.43, cy: 0.37, rx: 0.25, ry: 0.2 },
        { cx: 0.61, cy: 0.63, rx: 0.26, ry: 0.21 }
      ];
    }

    if (worldShape === 'continental') {
      return [
        ...createContinentalMainBlobs(mapSize, random),
        ...createContinentalIslandBlobs(mapSize, random)
      ];
    }

    return createIslandBlobs(mapSize, random);
  }
  function connectedLandComponents(layouts, landMask) {
    const layoutsById = Object.fromEntries(layouts.map((layout) => [layout.id, layout]));
    const visited = new Set();
    const components = [];

    layouts.forEach((layout) => {
      if (!landMask[layout.index] || visited.has(layout.index)) return;
      const queue = [layout];
      const component = [];
      visited.add(layout.index);

      while (queue.length) {
        const current = queue.shift();
        component.push(current.index);
        current.neighbors.forEach((neighborId) => {
          const neighbor = layoutsById[neighborId];
          if (!neighbor || !landMask[neighbor.index] || visited.has(neighbor.index)) return;
          visited.add(neighbor.index);
          queue.push(neighbor);
        });
      }

      components.push(component);
    });

    return components.sort((first, second) => second.length - first.length);
  }

  function keepLargestLandComponents(layouts, landMask, componentLimit) {
    const components = connectedLandComponents(layouts, landMask);
    if (components.length <= componentLimit) return landMask;

    const keptIndexes = new Set(components.slice(0, componentLimit).flat());
    return landMask.map((isLand, index) => isLand && keptIndexes.has(index));
  }

  function refineLandMask(layouts, landMask, worldShape, mapSize) {
    if (worldShape === 'pangea') {
      return keepLargestLandComponents(layouts, landMask, 1);
    }

    if (worldShape === 'continental') {
      const componentLimit = { small: 12, medium: 18, large: 24 }[mapSize] || 12;
      return keepLargestLandComponents(layouts, landMask, componentLimit);
    }

    return landMask;
  }

  function applyWorldShapeWaterSeams(layouts, landMask, worldShape, mapSize, width, height) {
    if (worldShape !== 'continental' && worldShape !== 'islands') {
      return landMask;
    }

    const continentalSeams = { vertical: [{ position: 0.5, halfWidth: 0.034, wave: 0.022, ripple: 0.009, phase: 0.16, ripplePhase: 0.38 }], horizontal: [] };

    const islandSeams = {
      small: {
        vertical: [{ position: 0.5, halfWidth: 0.048 }],
        horizontal: [{ position: 0.5, halfWidth: 0.055 }]
      },
      medium: {
        vertical: [
          { position: 0.5, halfWidth: 0.026, wave: 0.035, ripple: 0.01, phase: 0.08, ripplePhase: 0.31 },
          { position: 0.74, halfWidth: 0.018, wave: 0.026, ripple: 0.008, phase: 0.42, ripplePhase: 0.17 }
        ],
        horizontal: [{ position: 0.58, halfWidth: 0.022, wave: 0.03, ripple: 0.008, phase: 0.27, ripplePhase: 0.11 }]
      },
      large: {
        vertical: [
          { position: 0.48, halfWidth: 0.023, wave: 0.035, ripple: 0.01, phase: 0.12, ripplePhase: 0.34 },
          { position: 0.76, halfWidth: 0.018, wave: 0.026, ripple: 0.008, phase: 0.39, ripplePhase: 0.19 }
        ],
        horizontal: [
          { position: 0.46, halfWidth: 0.02, wave: 0.03, ripple: 0.008, phase: 0.21, ripplePhase: 0.41 },
          { position: 0.72, halfWidth: 0.017, wave: 0.024, ripple: 0.007, phase: 0.48, ripplePhase: 0.23 }
        ]
      }
    };

    const seams = worldShape === 'continental' ? continentalSeams : islandSeams[mapSize] || islandSeams.small;

    return landMask.map((isLand, index) => {
      if (!isLand) return false;
      const layout = layouts[index];
      const xRatio = (layout.grid.x + 0.5) / width;
      const yRatio = (layout.grid.y + 0.5) / height;
      const touchesVerticalSeam = seams.vertical.some((seam) => {
        const wave = seam.wave ? Math.sin((yRatio + (seam.phase || 0)) * Math.PI * 2) * seam.wave : 0;
        const ripple = seam.ripple ? Math.sin((yRatio + (seam.ripplePhase || 0)) * Math.PI * 5.4) * seam.ripple : 0;
        return Math.abs(xRatio - (seam.position + wave + ripple)) < seam.halfWidth;
      });
            const touchesHorizontalSeam = seams.horizontal.some((seam) => {
        const wave = seam.wave ? Math.sin((xRatio + (seam.phase || 0)) * Math.PI * 2) * seam.wave : 0;
        const ripple = seam.ripple ? Math.sin((xRatio + (seam.ripplePhase || 0)) * Math.PI * 5.4) * seam.ripple : 0;
        return Math.abs(yRatio - (seam.position + wave + ripple)) < seam.halfWidth;
      });
      return !(touchesVerticalSeam || touchesHorizontalSeam);
    });
  }

  function gridKeyFor(layout) {
    return `${layout.grid.x},${layout.grid.y}`;
  }

  function hasLandGridNeighbor(layout, landMask, layoutsByGrid, allowedLandIndex = -1) {
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const neighbor = layoutsByGrid.get(`${layout.grid.x + dx},${layout.grid.y + dy}`);
      return neighbor && landMask[neighbor.index] && neighbor.index !== allowedLandIndex;
    });
  }

  function tinyIslandTarget(worldShape, mapSize) {
    if (worldShape === 'continental') {
      return { small: 4, medium: 6, large: 9 }[mapSize] || 5;
    }
    if (worldShape === 'islands') {
      return { small: 10, medium: 20, large: 34 }[mapSize] || 12;
    }
    return 0;
  }

  function addTinyIslandProvinces(layouts, landMask, worldShape, mapSize, seed) {
    const target = tinyIslandTarget(worldShape, mapSize);
    if (target <= 0) return landMask;

    const random = createRandom(`${seed}:${worldShape}:${mapSize}:tiny-island-provinces`);
    const nextMask = [...landMask];
    const layoutsByGrid = new Map(layouts.map((layout) => [gridKeyFor(layout), layout]));
    const candidates = layouts
      .filter((layout) => !layout.isMapEdge && !nextMask[layout.index])
      .map((layout) => ({ layout, roll: random() }))
      .sort((first, second) => first.roll - second.roll)
      .map((entry) => entry.layout);

    let added = 0;
    for (const layout of candidates) {
      if (added >= target) break;
      if (nextMask[layout.index]) continue;
      if (hasLandGridNeighbor(layout, nextMask, layoutsByGrid)) continue;

      nextMask[layout.index] = true;
      added += 1;

      if (added >= target || random() >= 0.35) continue;
      const neighborOptions = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .map(([dx, dy]) => layoutsByGrid.get(`${layout.grid.x + dx},${layout.grid.y + dy}`))
        .filter((neighbor) => neighbor && !neighbor.isMapEdge && !nextMask[neighbor.index])
        .filter((neighbor) => !hasLandGridNeighbor(neighbor, nextMask, layoutsByGrid, layout.index))
        .map((neighbor) => ({ value: neighbor.index, weight: 1 + random() }));

      if (!neighborOptions.length) continue;
      nextMask[weightedPick(neighborOptions, random)] = true;
      added += 1;
    }

    return nextMask;
  }
  function assignLandMask(layouts, width, height, seed, worldShape, mapSize) {
    const random = createRandom(`${seed}:${worldShape}:${mapSize}:land-mask`);
    const blobs = createWorldBlobs(worldShape, mapSize, random);
    const noiseStrength = { pangea: 0.2, continental: 0.035, islands: 0.035 }[worldShape] || 0.08;
    const rawMask = layouts.map((layout) => {
      if (layout.isMapEdge) {
        return false;
      }

      const score = blobs.reduce((maxScore, blob) => Math.max(maxScore, blobScore(layout, blob, width, height)), -Infinity);
      const noise = (random() - 0.5) * noiseStrength;
      return score + noise > 0;
    });

    const shapedMask = applyWorldShapeWaterSeams(layouts, rawMask, worldShape, mapSize, width, height);
    const islandSeededMask = addTinyIslandProvinces(layouts, shapedMask, worldShape, mapSize, seed);
    return refineLandMask(layouts, islandSeededMask, worldShape, mapSize);
  }

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
  function createTraitSets(layouts) {
    return layouts.map(() => new Set());
  }

  function addTrait(traitSets, index, traitId) {
    traitSets[index].add(traitId);
  }

  function hasTrait(traitSets, index, traitId) {
    return traitSets[index].has(traitId);
  }

  function countTrait(traitSets, traitId) {
    return traitSets.reduce((count, traitSet) => count + (traitSet.has(traitId) ? 1 : 0), 0);
  }

  function minimumTraitCountForMapSize(mapSize) {
    return { small: 1, medium: 2, large: 3 }[mapSize] || 1;
  }

  function layoutTouchesWater(layout, layoutsById, terrainAssignments) {
    return layout.neighbors.some((neighborId) => {
      const neighbor = layoutsById[neighborId];
      return neighbor && isWaterTerrain(terrainAssignments[neighbor.index]);
    });
  }

  function isTraitAllowedForLayout(traitId, layout, layoutsById, terrainAssignments, traitSets) {
    if (!layout || hasTrait(traitSets, layout.index, traitId)) return false;
    const terrain = terrainAssignments[layout.index];
    if (!isLandTerrain(terrain)) return false;

    switch (traitId) {
      case 'river':
        return isTerrainAllowedForRiver(terrain);
      case 'lake':
        return isTerrainAllowedForLake(terrain) && !hasTrait(traitSets, layout.index, 'coast');
      case 'coast':
        return layoutTouchesWater(layout, layoutsById, terrainAssignments);
      case 'oasis':
        return terrain === 'desert';
      case 'high-fertility':
        return (terrain === 'plains' || terrain === 'forests' || terrain === 'hills' || terrain === 'swamps')
          && (hasTrait(traitSets, layout.index, 'river') || hasTrait(traitSets, layout.index, 'lake'));
      case 'forest-density':
        return terrain === 'forests' || terrain === 'swamps' || terrain === 'hills' || terrain === 'plains' || terrain === 'mountains';
      case 'mineral-vein':
      case 'precious-vein':
        return terrain === 'mountains' || terrain === 'hills';
      case 'gem-vein':
        return terrain === 'mountains';
      case 'volcanic':
        return terrain === 'mountains';
      case 'god-bless':
        return true;
      default:
        return true;
    }
  }

  function traitPlacementWeight(traitId, layout, layoutsById, terrainAssignments, traitSets, random) {
    const terrain = terrainAssignments[layout.index];
    const nearRiver = layout.neighbors.some((neighborId) => {
      const neighbor = layoutsById[neighborId];
      return neighbor && hasTrait(traitSets, neighbor.index, 'river');
    });

    const baseWeights = {
      river: terrainPreferenceForRiver(terrain),
      lake: ({ plains: 2.1, forests: 1.8, swamps: 1.9, hills: 1, mountains: 0.25 }[terrain] || 0.6) + (nearRiver ? 1.4 : 0),
      coast: layoutTouchesWater(layout, layoutsById, terrainAssignments) ? 2 : 0,
      oasis: terrain === 'desert' ? 2 + (hasTrait(traitSets, layout.index, 'coast') ? 0 : 0.8) : 0,
      'high-fertility': ({ plains: 2.2, forests: 1.7, swamps: 1.5, hills: 0.9 }[terrain] || 0.5),
      'forest-density': ({ forests: 3, swamps: 1.6, hills: 1.1, plains: 0.8, mountains: 0.55 }[terrain] || 0),
      'mineral-vein': ({ mountains: 6, hills: 0.55 }[terrain] || 0),
      'precious-vein': ({ mountains: 6.4, hills: 0.38 }[terrain] || 0),
      'gem-vein': ({ mountains: 5.8 }[terrain] || 0),
      volcanic: ({ mountains: 2.4 }[terrain] || 0),
      'god-bless': godBlessWeight(layout, traitSets, terrainAssignments, random)
    };

    const neighborBonus = layout.neighbors.reduce((bonus, neighborId) => {
      const neighbor = layoutsById[neighborId];
      return bonus + (neighbor && hasTrait(traitSets, neighbor.index, traitId) ? 0.2 : 0);
    }, 0);

    return (baseWeights[traitId] || 1) + neighborBonus + random() * 0.35;
  }

  function ensureMinimumTraitCount(layouts, traitSets, terrainAssignments, mapSize, random, traitId) {
    const minimumCount = minimumTraitCountForMapSize(mapSize);
    const layoutsById = Object.fromEntries(layouts.map((layout) => [layout.id, layout]));

    while (countTrait(traitSets, traitId) < minimumCount) {
      const candidates = layouts
        .filter((layout) => isTraitAllowedForLayout(traitId, layout, layoutsById, terrainAssignments, traitSets))
        .map((layout) => ({
          value: layout.index,
          weight: traitPlacementWeight(traitId, layout, layoutsById, terrainAssignments, traitSets, random)
        }))
        .filter((candidate) => candidate.weight > 0);

      if (!candidates.length) break;
      addTrait(traitSets, weightedPick(candidates, random), traitId);
    }
  }

  function ensureMinimumNaturalTraitCounts(layouts, traitSets, terrainAssignments, mapSize, random) {
    const pathManagedTraits = new Set(['river']);
    namespace.resources.naturalTraits
      .map((trait) => trait.id)
      .filter((traitId) => !pathManagedTraits.has(traitId))
      .forEach((traitId) => ensureMinimumTraitCount(layouts, traitSets, terrainAssignments, mapSize, random, traitId));
  }
  function addCoastTraits(layouts, traitSets, terrainAssignments) {
    const layoutsById = Object.fromEntries(layouts.map((layout) => [layout.id, layout]));
    layouts.forEach((layout) => {
      if (!isLandTerrain(terrainAssignments[layout.index])) return;
      const touchesWater = layout.neighbors.some((neighborId) => {
        const neighbor = layoutsById[neighborId];
        return neighbor && isWaterTerrain(terrainAssignments[neighbor.index]);
      });
      if (touchesWater) {
        addTrait(traitSets, layout.index, 'coast');
      }
    });
  }

  function isTerrainAllowedForRiver(terrainId) {
    return isLandTerrain(terrainId);
  }

  function isTerrainAllowedForLake(terrainId) {
    return isLandTerrain(terrainId) && terrainId !== 'desert';
  }

  function terrainPreferenceForRiver(terrainId) {
    return { mountains: 0.45, hills: 1.05, plains: 1.7, forests: 1.45, desert: 0.42, swamps: 1.35 }[terrainId] || 0;
  }

  function terrainRoughnessForRiver(terrainId) {
    return { mountains: 3, hills: 2, plains: 1, forests: 1, desert: 2, swamps: 1 }[terrainId] || 1;
  }

  function terrainHeightForRiver(terrainId) {
    return { mountains: 4, hills: 3, desert: 2, plains: 1, forests: 1, swamps: 0 }[terrainId] ?? 1;
  }

  function riverSourceBaseWeight(terrainId) {
    return { mountains: 2.4, hills: 1.8, forests: 1.15, swamps: 1.05, plains: 0.95 }[terrainId] || 0;
  }

  function sourceWeightForRiver(layout, layoutsById, terrainAssignments) {
    const terrain = terrainAssignments[layout.index];
    const baseWeight = riverSourceBaseWeight(terrain);
    if (baseWeight <= 0) return 0;

    const currentHeight = terrainHeightForRiver(terrain);
    let flowNeighbors = 0;
    let downhillNeighbors = 0;
    let oceanNeighbors = 0;

    layout.neighbors.forEach((neighborId) => {
      const neighbor = layoutsById[neighborId];
      if (!neighbor) return;
      const neighborTerrain = terrainAssignments[neighbor.index];
      if (isWaterTerrain(neighborTerrain)) {
        oceanNeighbors += 1;
        return;
      }
      if (!isTerrainAllowedForRiver(neighborTerrain)) return;
      const neighborHeight = terrainHeightForRiver(neighborTerrain);
      if (neighborHeight <= currentHeight) {
        flowNeighbors += 1;
      }
      if (neighborHeight < currentHeight) {
        downhillNeighbors += 1;
      }
    });

    if (flowNeighbors === 0) return 0;
    return baseWeight + flowNeighbors * 0.32 + downhillNeighbors * 0.44 - oceanNeighbors * 0.18;
  }

  function riverSourceSpacingFor(mapSize, worldShape) {
    const sizeDistance = { small: 260, medium: 320, large: 380 }[mapSize] || 260;
    const shapeScale = { pangea: 1, continental: 0.92, islands: 0.78 }[worldShape] || 1;
    return sizeDistance * shapeScale;
  }

  function wrappedAxisDistance(first, second, span) {
    const direct = Math.abs(first - second);
    return Math.min(direct, Math.max(0, span - direct));
  }

  function wrappedDistanceBetween(a, b) {
    const dx = wrappedAxisDistance(a.center.x, b.center.x, mapViewBox.width);
    const dy = wrappedAxisDistance(a.center.y, b.center.y, mapViewBox.height);
    return Math.sqrt((dx * dx) + (dy * dy));
  }

  function wrappedDistanceFromPoint(layout, point) {
    const dx = wrappedAxisDistance(layout.center.x, point.x, mapViewBox.width);
    const dy = wrappedAxisDistance(layout.center.y, point.y, mapViewBox.height);
    return Math.sqrt((dx * dx) + (dy * dy));
  }

  function riverSourceAnchorsFor(count, random) {
    const total = Math.max(1, count);
    const offsetX = random();
    const offsetY = random();
    return Array.from({ length: total }, (_, index) => {
      const xRatio = (index + offsetX) / total;
      const yRatio = 0.18 + (((index * 0.61803398875) + offsetY) % 1) * 0.64;
      return {
        x: (xRatio % 1) * mapViewBox.width,
        y: yRatio * mapViewBox.height
      };
    });
  }

  function pickRiverSourceForAnchor(availableSources, layouts, sourceLayouts, anchor, minimumSourceDistance, random) {
    const scoredSources = availableSources.map((candidate) => {
      const layout = layouts[candidate.value];
      const anchorDistance = wrappedDistanceFromPoint(layout, anchor);
      const nearestSourceDistance = sourceLayouts.length
        ? Math.min(...sourceLayouts.map((sourceLayout) => wrappedDistanceBetween(layout, sourceLayout)))
        : minimumSourceDistance;
      const spreadScore = Math.min(2.4, nearestSourceDistance / Math.max(1, minimumSourceDistance)) * 95;
      const sourceQuality = candidate.weight * 70;
      const anchorPenalty = anchorDistance * 0.9;
      return {
        value: candidate.value,
        distance: nearestSourceDistance,
        weight: sourceQuality + spreadScore - anchorPenalty + random() * 18
      };
    });

    const spacedSources = scoredSources.filter((candidate) => candidate.distance >= minimumSourceDistance * 0.72);
    const pool = spacedSources.length ? spacedSources : scoredSources;
    return pool.reduce((best, candidate) => (candidate.weight > best.weight ? candidate : best), pool[0]).value;
  }

  function riverProximityPenalty(layout, layoutsById, traitSets) {
    const directPenalty = hasTrait(traitSets, layout.index, 'river') ? -3 : 0;
    const neighborPenalty = layout.neighbors.reduce((penalty, neighborId) => {
      const neighbor = layoutsById[neighborId];
      return penalty + (neighbor && hasTrait(traitSets, neighbor.index, 'river') ? -0.75 : 0);
    }, 0);
    return directPenalty + neighborPenalty;
  }

  function distanceBetween(a, b) {
    const dx = a.center.x - b.center.x;
    const dy = a.center.y - b.center.y;
    return Math.sqrt((dx * dx) + (dy * dy));
  }

  function riverCountFor(profile, landCount) {
    if (landCount <= 0) return 0;
    return Math.max(profile.minimumRivers, Math.round(landCount / profile.riverEveryLandRegions));
  }

  function riverLengthFor(profile, mapSize, worldShape, random, landCount) {
    const sizeScale = shapeSizeScale[mapSize] || 1;
    const shapeScale = riverShapeLengthScale[worldShape] || 1;
    const baseLength = profile.riverLength.min + random() * (profile.riverLength.max - profile.riverLength.min);
    return Math.max(3, Math.min(Math.round(baseLength * sizeScale * shapeScale), Math.max(3, Math.floor(landCount * 0.22))));
  }

  function buildRiverPath(source, layouts, layoutsById, terrainAssignments, traitSets, targetLength, random) {
    const path = [];
    const visited = new Set();
    let current = source;

    while (current && path.length < targetLength) {
      if (visited.has(current.index)) break;
      visited.add(current.index);
      path.push(current.index);

      if (path.length >= 3 && hasTrait(traitSets, current.index, 'coast')) break;
      if (path.length >= 4 && terrainAssignments[current.index] === 'swamps' && random() < 0.35) break;

      const currentTerrain = terrainAssignments[current.index];
      const currentHeight = terrainHeightForRiver(currentTerrain);
      const currentRoughness = terrainRoughnessForRiver(currentTerrain);
      const candidates = current.neighbors
        .map((neighborId) => layoutsById[neighborId])
        .filter((neighbor) => {
          if (!neighbor || visited.has(neighbor.index)) return false;
          const neighborTerrain = terrainAssignments[neighbor.index];
          if (!isTerrainAllowedForRiver(neighborTerrain)) return false;
          return terrainHeightForRiver(neighborTerrain) <= currentHeight;
        })
        .map((neighbor) => {
          const neighborTerrain = terrainAssignments[neighbor.index];
          const nextHeight = terrainHeightForRiver(neighborTerrain);
          const nextRoughness = terrainRoughnessForRiver(neighborTerrain);
          const downhill = Math.max(0, currentHeight - nextHeight) * 0.68;
          const flatFlow = currentHeight === nextHeight ? 0.42 : 0;
          const roughnessDrag = Math.max(0, nextRoughness - currentRoughness) * -0.15;
          const coastEnd = path.length >= 3 && hasTrait(traitSets, neighbor.index, 'coast') ? 2.2 : 0;
          const awayFromSource = Math.min(1.4, distanceBetween(source, neighbor) / 240);
          const existingRiverPenalty = riverProximityPenalty(neighbor, layoutsById, traitSets);
          return {
            value: neighbor.index,
            weight: terrainPreferenceForRiver(neighborTerrain) + downhill + flatFlow + roughnessDrag + coastEnd + awayFromSource + existingRiverPenalty + random() * 0.4
          };
        })
        .filter((candidate) => candidate.weight > 0);

      if (!candidates.length) break;
      current = layouts[weightedPick(candidates, random)];
    }

    return path.length >= 3 ? path : [];
  }

  function addRiverTraits(layouts, traitSets, terrainAssignments, profileId, mapSize, worldShape, seed) {
    const random = createRandom(`${seed}:${profileId}:${mapSize}:${worldShape}:rivers`);
    const profile = profileFor(profileId);
    const layoutsById = Object.fromEntries(layouts.map((layout) => [layout.id, layout]));
    const landCount = terrainAssignments.filter(isLandTerrain).length;
    const minimumRiverRegions = minimumTraitCountForMapSize(mapSize);
    const desiredCount = Math.max(riverCountFor(profile, landCount), minimumRiverRegions);
    const sourceCandidates = layouts
      .map((layout) => ({ value: layout.index, weight: sourceWeightForRiver(layout, layoutsById, terrainAssignments) }))
      .filter((candidate) => candidate.weight > 0);

    if (!sourceCandidates.length) return [];

    const riverPaths = [];
    const usedSources = new Set();
    const sourceLayouts = [];
    const minimumSourceDistance = riverSourceSpacingFor(mapSize, worldShape);
    const sourceAnchors = riverSourceAnchorsFor(desiredCount, random);
    let created = 0;
    let attempts = 0;
    const maxAttempts = Math.max(24, desiredCount * 12);

    while ((created < desiredCount || countTrait(traitSets, 'river') < minimumRiverRegions) && attempts < maxAttempts) {
      const anchor = sourceAnchors[attempts % sourceAnchors.length];
      attempts += 1;
      const availableSources = sourceCandidates.filter((candidate) => !usedSources.has(candidate.value));
      if (!availableSources.length) break;
      const sourceIndex = pickRiverSourceForAnchor(availableSources, layouts, sourceLayouts, anchor, minimumSourceDistance, random);
      usedSources.add(sourceIndex);
      const targetLength = riverLengthFor(profile, mapSize, worldShape, random, landCount);
      const path = buildRiverPath(layouts[sourceIndex], layouts, layoutsById, terrainAssignments, traitSets, targetLength, random);
      if (!path.length) continue;
      sourceLayouts.push(layouts[sourceIndex]);
      path.forEach((index) => addTrait(traitSets, index, 'river'));
      riverPaths.push(path);
      created += 1;
    }
    return riverPaths;
  }

  function addLakeTraits(layouts, traitSets, terrainAssignments, profileId, random) {
    const profile = profileFor(profileId);
    const landCount = terrainAssignments.filter(isLandTerrain).length;
    const lakeCount = Math.round(landCount * profile.lakeRatio);
    if (lakeCount <= 0) return;

    const layoutsById = Object.fromEntries(layouts.map((layout) => [layout.id, layout]));
    const candidates = layouts
      .filter((layout) => isTerrainAllowedForLake(terrainAssignments[layout.index]) && !hasTrait(traitSets, layout.index, 'coast'))
      .map((layout) => {
        const nearRiver = layout.neighbors.some((neighborId) => {
          const neighbor = layoutsById[neighborId];
          return neighbor && hasTrait(traitSets, neighbor.index, 'river');
        });
        const terrainWeight = { plains: 2.1, forests: 1.8, swamps: 1.9, hills: 1, mountains: 0.25 }[terrainAssignments[layout.index]] || 0.6;
        return { value: layout.index, weight: terrainWeight + (nearRiver ? 1.4 : 0) + random() * 0.35 };
      });

    const used = new Set();
    for (let index = 0; index < lakeCount && candidates.length; index += 1) {
      const available = candidates.filter((candidate) => !used.has(candidate.value));
      if (!available.length) break;
      const pick = weightedPick(available, random);
      used.add(pick);
      addTrait(traitSets, pick, 'lake');
    }
  }

  function addFertilityTraits(layouts, traitSets, terrainAssignments) {
    const excludedTerrain = new Set(['mountains', 'desert', waterTerrainId]);
    layouts.forEach((layout) => {
      const terrain = terrainAssignments[layout.index];
      const hasWater = hasTrait(traitSets, layout.index, 'river') || hasTrait(traitSets, layout.index, 'lake');
      if (hasWater && !excludedTerrain.has(terrain)) {
        addTrait(traitSets, layout.index, 'high-fertility');
      }
    });
  }

  function addOasisTraits(layouts, traitSets, terrainAssignments, profileId, random) {
    const profile = profileFor(profileId);
    layouts.forEach((layout) => {
      const terrain = terrainAssignments[layout.index];
      if (terrain === 'desert' && random() < profile.oasisChance) {
        addTrait(traitSets, layout.index, 'oasis');
      }
    });
  }

  function addRandomTraitByTerrain(layouts, traitSets, terrainAssignments, random, traitId, terrainChance) {
    layouts.forEach((layout) => {
      const terrain = terrainAssignments[layout.index];
      const chance = terrainChance[terrain] || 0;
      if (chance > 0 && random() < chance) {
        addTrait(traitSets, layout.index, traitId);
      }
    });
  }

  function addDepositTraits(layouts, traitSets, terrainAssignments, random) {
    addRandomTraitByTerrain(layouts, traitSets, terrainAssignments, random, 'mineral-vein', { mountains: 0.38, hills: 0.04, desert: 0, plains: 0, forests: 0, swamps: 0, ocean: 0 });
    addRandomTraitByTerrain(layouts, traitSets, terrainAssignments, random, 'precious-vein', { mountains: 0.14, hills: 0.012, desert: 0, plains: 0, forests: 0, swamps: 0, ocean: 0 });
    addRandomTraitByTerrain(layouts, traitSets, terrainAssignments, random, 'gem-vein', { mountains: 0.055, hills: 0, desert: 0, plains: 0, forests: 0, swamps: 0, ocean: 0 });
    addRandomTraitByTerrain(layouts, traitSets, terrainAssignments, random, 'volcanic', { mountains: 0.055, hills: 0, desert: 0, plains: 0, forests: 0, swamps: 0, ocean: 0 });
  }

  function godBlessLimitForMapSize(mapSize) {
    return minimumTraitCountForMapSize(mapSize);
  }

  function godBlessWeight(layout, traitSets, terrainAssignments, random) {
    const terrain = terrainAssignments[layout.index];
    const terrainWeight = { plains: 1.4, forests: 1.3, hills: 1.2, mountains: 1.1, swamps: 1.1, desert: 0.9 }[terrain] || 1;
    const traitWeight = traitSets[layout.index].size * 0.16;
    return terrainWeight + traitWeight + random() * 0.35;
  }

  function addGodBlessTraits(layouts, traitSets, terrainAssignments, random, mapSize) {
    const limit = godBlessLimitForMapSize(mapSize);
    const used = new Set();

    for (let count = 0; count < limit; count += 1) {
      const candidates = layouts
        .filter((layout) => isLandTerrain(terrainAssignments[layout.index]) && !used.has(layout.index))
        .map((layout) => ({ value: layout.index, weight: godBlessWeight(layout, traitSets, terrainAssignments, random) }));

      if (!candidates.length) return;
      const pick = weightedPick(candidates, random);
      used.add(pick);
      addTrait(traitSets, pick, 'god-bless');
    }
  }

  function addNaturalTraits(layouts, terrainAssignments, seed, profileId, mapSize, worldShape) {
    const random = createRandom(`${seed}:${profileId}:${mapSize}:${worldShape}:natural-layer`);
    const traitSets = createTraitSets(layouts);

    addCoastTraits(layouts, traitSets, terrainAssignments);
    const riverPaths = addRiverTraits(layouts, traitSets, terrainAssignments, profileId, mapSize, worldShape, seed);
    addLakeTraits(layouts, traitSets, terrainAssignments, profileId, random);
    addOasisTraits(layouts, traitSets, terrainAssignments, profileId, random);
    addRandomTraitByTerrain(layouts, traitSets, terrainAssignments, random, 'forest-density', { mountains: 0.02, forests: 0.3, swamps: 0.18, hills: 0.1, plains: 0.05, desert: 0, ocean: 0 });
    addFertilityTraits(layouts, traitSets, terrainAssignments);
    addDepositTraits(layouts, traitSets, terrainAssignments, random);
    addGodBlessTraits(layouts, traitSets, terrainAssignments, random, mapSize);
    ensureMinimumNaturalTraitCounts(layouts, traitSets, terrainAssignments, mapSize, random);
    addFertilityTraits(layouts, traitSets, terrainAssignments);
    ensureMinimumTraitCount(layouts, traitSets, terrainAssignments, mapSize, random, 'high-fertility');

    return {
      traitSets: traitSets.map((traitSet) => Array.from(traitSet)),
      riverPaths
    };
  }

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

  function lockedWaterSlots() {
    return namespace.models.createProductionSlots([
      { index: 1, status: 'locked' },
      { index: 2, status: 'locked' },
      { index: 3, status: 'locked' }
    ]);
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
        productionSlots: isWater ? lockedWaterSlots() : null,
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
      summary: summarizeMap(regions)
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
