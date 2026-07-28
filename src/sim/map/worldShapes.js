(function initializeWorldShapes(namespace) {
  const { createRandom, weightedPick } = namespace.mapCore;
  const { clamp } = namespace.mapGeometry;
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
        minor: { rx: [0.2, 0.25], ry: [0.29, 0.36] },
        largeLobes: 3,
        minorLobes: 2
      },
      medium: {
        large: { rx: [0.305, 0.36], ry: [0.41, 0.49] },
        minor: { rx: [0.19, 0.245], ry: [0.28, 0.355] },
        largeLobes: 4,
        minorLobes: 2
      },
      large: {
        large: { rx: [0.3, 0.365], ry: [0.4, 0.49] },
        minor: { rx: [0.19, 0.25], ry: [0.28, 0.36] },
        largeLobes: 5,
        minorLobes: 3
      }
    }[mapSize] || {
      large: { rx: [0.305, 0.36], ry: [0.4, 0.49] },
      minor: { rx: [0.19, 0.245], ry: [0.28, 0.355] },
      largeLobes: 4,
        minorLobes: 2
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

    const continentalSeams = { vertical: [{ position: 0.5, halfWidth: 0.05, wave: 0.018, ripple: 0.007, phase: 0.16, ripplePhase: 0.38 }], horizontal: [] };

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
    const gridWidth = Math.max(...layouts.map((layout) => layout.grid.x)) + 1;
    const isContinentalCorridor = (layout) => worldShape === 'continental'
      && Math.abs(((layout.grid.x + 0.5) / gridWidth) - 0.5) < 0.1;
    const candidates = layouts
      .filter((layout) => !layout.isMapEdge && !nextMask[layout.index])
      .filter((layout) => !isContinentalCorridor(layout))
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
        .filter((neighbor) => !isContinentalCorridor(neighbor))
        .filter((neighbor) => !hasLandGridNeighbor(neighbor, nextMask, layoutsByGrid, layout.index))
        .map((neighbor) => ({ value: neighbor.index, weight: 1 + random() }));

      if (!neighborOptions.length) continue;
      nextMask[weightedPick(neighborOptions, random)] = true;
      added += 1;
    }

    return nextMask;
  }
  function ensureInlandLandProvinces(layouts, landMask, worldShape, mapSize, seed) {
    if (worldShape !== 'islands') return landMask;
    const target = { small: 3, medium: 6, large: 9 }[mapSize] || 3;
    const nextMask = [...landMask];
    const layoutsById = Object.fromEntries(layouts.map((layout) => [layout.id, layout]));
    const random = createRandom(`${seed}:${mapSize}:inland-provinces`);

    const isInland = (layout) => nextMask[layout.index]
      && layout.neighbors.every((neighborId) => {
        const neighbor = layoutsById[neighborId];
        return neighbor && nextMask[neighbor.index];
      });

    let attempts = 0;
    while (layouts.filter(isInland).length < target && attempts < target * 4) {
      attempts += 1;
      const componentSizes = new Map();
      connectedLandComponents(layouts, nextMask).forEach((component) => {
        component.forEach((index) => componentSizes.set(index, component.length));
      });

      const candidates = layouts
        .filter((layout) => nextMask[layout.index] && !layout.isMapEdge && !isInland(layout))
        .filter((layout) => (componentSizes.get(layout.index) || 0) >= 4)
        .filter((layout) => layout.neighbors.every((neighborId) => {
          const neighbor = layoutsById[neighborId];
          return neighbor && !neighbor.isMapEdge;
        }))
        .map((layout) => {
          const missingNeighbors = layout.neighbors.filter((neighborId) => {
            const neighbor = layoutsById[neighborId];
            return neighbor && !nextMask[neighbor.index];
          }).length;
          return {
            layout,
            score: missingNeighbors * 100 - (componentSizes.get(layout.index) || 0) + random()
          };
        })
        .sort((first, second) => first.score - second.score);

      if (!candidates.length) break;
      candidates[0].layout.neighbors.forEach((neighborId) => {
        const neighbor = layoutsById[neighborId];
        if (neighbor && !neighbor.isMapEdge) nextMask[neighbor.index] = true;
      });
    }

    return nextMask;
  }
  function enforceContinentalOceanCorridor(layouts, landMask, worldShape, width) {
    if (worldShape !== 'continental') return landMask;
    return landMask.map((isLand, index) => {
      if (!isLand) return false;
      const xRatio = (layouts[index].grid.x + 0.5) / width;
      return Math.abs(xRatio - 0.5) >= 0.1;
    });
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
    const inlandMask = ensureInlandLandProvinces(layouts, shapedMask, worldShape, mapSize, seed);
    const islandSeededMask = addTinyIslandProvinces(layouts, inlandMask, worldShape, mapSize, seed);
    const separatedMask = enforceContinentalOceanCorridor(layouts, islandSeededMask, worldShape, width);
    return refineLandMask(layouts, separatedMask, worldShape, mapSize);
  }

  namespace.mapWorldShapes = Object.freeze({
    blobScore,
    randomBetween,
    varyBlob,
    createIslandBlobs,
    createContinentalIslandBlobs,
    createContinentLobes,
    createContinentalMainBlobs,
    createWorldBlobs,
    connectedLandComponents,
    keepLargestLandComponents,
    refineLandMask,
    applyWorldShapeWaterSeams,
    gridKeyFor,
    hasLandGridNeighbor,
    tinyIslandTarget,
    addTinyIslandProvinces,
    ensureInlandLandProvinces,
    enforceContinentalOceanCorridor,
    assignLandMask
  });
})(window.EcoRuler = window.EcoRuler || {});
