/**
 * The challenging world's labyrinth: ONE long winding route from the start to the exit (the room
 * with the light), plus a handful of short, straight dead ends branching off it (1-2 cells: you
 * see the end wall almost at once). Every other cell is solid wall. Seeded and deterministic,
 * always solvable; pure data, unit-tested in tests/maze.test.ts.
 *
 * Grid: `cols` x `rows` cells of `cell` metres. Row 0 is where Alex starts (toward +z);
 * rows go away from her (toward -z). The exit opens in the far wall of the last row.
 */
import { mulberry32 } from "../../lib/random";

export interface WallSeg {
  /** Centre of the wall on the ground. */
  x: number;
  z: number;
  /** Length along its axis. */
  len: number;
  /** true = runs along x (between rows); false = runs along z (between columns). */
  alongX: boolean;
  height: number;
}

export interface FaceSpot {
  x: number;
  y: number;
  z: number;
  /** Unit normal of the wall side the face pushes out of (x/z only). */
  nx: number;
  nz: number;
  size: number;
}

export interface MazeLayout {
  cols: number;
  rows: number;
  cell: number;
  wall: number;
  start: [number, number];
  exit: [number, number];
  /** Cells from start to exit, inclusive. */
  solution: [number, number][];
  walls: WallSeg[];
  faces: FaceSpot[];
  /** Dead-end cells (only one opening) for kaleidoscope panels. */
  deadEnds: { c: number; r: number; nx: number; nz: number }[];
  /** The short side passages off the route (cells from the route outward). */
  spurs: [number, number][][];
  /** Every walkable cell (route + side passages). */
  cells: [number, number][];
  /** z of the far wall line (the exit opens here). */
  exitZ: number;
  /** x/z centre of a cell. */
  center: (c: number, r: number) => [number, number];
  /** Is there an opening between two orthogonally adjacent cells? */
  open: (a: [number, number], b: [number, number]) => boolean;
}

const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export interface MazeOptions {
  /** Route length (cells, start and exit included) to search for. */
  route?: [number, number];
  /** Number of short dead ends off the route. */
  spurs?: number;
}

export function buildMaze(
  cols = 9,
  rows = 11,
  cell = 3.6,
  seed = 2026,
  opts: MazeOptions = {},
): MazeLayout {
  const [minRoute, maxRoute] = opts.route ?? [52, 60];
  const spurCount = opts.spurs ?? 6;
  const id = (c: number, r: number) => r * cols + c;
  const inside = (c: number, r: number) =>
    c >= 0 && c < cols && r >= 0 && r < rows;
  const key = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  const start: [number, number] = [Math.floor(cols / 2), 0];

  // 1) a winding route: carve a random perfect maze and take its path from the start to the
  //    farthest cell of the last row; try successive seeds until that path has the wanted length
  let rand = mulberry32(seed);
  let route: [number, number][] = [];
  for (let s = seed; s < seed + 5000; s++) {
    rand = mulberry32(s);
    const links = new Set<string>();
    const seen = new Uint8Array(cols * rows);
    const stack: [number, number][] = [start];
    seen[id(...start)] = 1;
    while (stack.length) {
      const [c, r] = stack[stack.length - 1];
      const options = DIRS.map(
        ([dc, dr]) => [c + dc, r + dr] as [number, number],
      ).filter(([nc, nr]) => inside(nc, nr) && !seen[id(nc, nr)]);
      if (!options.length) {
        stack.pop();
        continue;
      }
      const next = options[Math.floor(rand() * options.length)];
      links.add(key(id(c, r), id(...next)));
      seen[id(...next)] = 1;
      stack.push(next);
    }
    const dist = new Int32Array(cols * rows).fill(-1);
    const prev = new Int32Array(cols * rows).fill(-1);
    dist[id(...start)] = 0;
    const queue: [number, number][] = [start];
    while (queue.length) {
      const [c, r] = queue.shift()!;
      for (const [dc, dr] of DIRS) {
        const n: [number, number] = [c + dc, r + dr];
        if (
          !inside(...n) ||
          dist[id(...n)] >= 0 ||
          !links.has(key(id(c, r), id(...n)))
        )
          continue;
        dist[id(...n)] = dist[id(c, r)] + 1;
        prev[id(...n)] = id(c, r);
        queue.push(n);
      }
    }
    let far: [number, number] = [0, rows - 1];
    for (let c = 0; c < cols; c++)
      if (dist[id(c, rows - 1)] > dist[id(...far)]) far = [c, rows - 1];
    const path: [number, number][] = [];
    for (let k = id(...far); k !== -1; k = prev[k])
      path.unshift([k % cols, Math.floor(k / cols)]);
    if (path.length >= minRoute && path.length <= maxRoute) {
      route = path;
      break;
    }
    if (path.length > route.length) route = path;
  }
  const exit = route[route.length - 1];

  // 2) keep only the route, then add short straight dead ends, one in each stretch of it
  const links = new Set<string>();
  const used = new Uint8Array(cols * rows);
  route.forEach((p, i) => {
    used[id(...p)] = 1;
    if (i > 0) links.add(key(id(...route[i - 1]), id(...p)));
  });
  const spurs: [number, number][][] = [];
  const lo = 3;
  const hi = route.length - 4;
  for (let k = 0; k < spurCount; k++) {
    const a = Math.floor(lo + ((hi - lo) * k) / spurCount);
    const b = Math.floor(lo + ((hi - lo) * (k + 1)) / spurCount);
    // look in the middle of this stretch first, so neighbouring dead ends never bunch up
    const q = Math.floor((b - a) / 4);
    const options: [number, number][][] = [];
    for (const [i0, i1] of [
      [a + q, b - q],
      [a, b],
    ]) {
      if (options.length) break;
      for (let i = i0; i < i1; i++) {
        const [c, r] = route[i];
        for (const [dc, dr] of DIRS) {
          const one: [number, number] = [c + dc, r + dr];
          if (!inside(...one) || used[id(...one)]) continue;
          const two: [number, number] = [c + 2 * dc, r + 2 * dr];
          const long = inside(...two) && !used[id(...two)];
          options.push(long ? [[c, r], one, two] : [[c, r], one]);
        }
      }
    }
    if (!options.length) continue;
    // prefer 2-cell passages every other time so they are not all the same
    const pick = options.filter((o) => o.length === (k % 2 ? 2 : 3));
    const spur = (pick.length ? pick : options)[
      Math.floor(rand() * (pick.length ? pick.length : options.length))
    ];
    for (let j = 1; j < spur.length; j++) {
      used[id(...spur[j])] = 1;
      links.add(key(id(...spur[j - 1]), id(...spur[j])));
    }
    spurs.push(spur.slice(1));
  }
  const open = (a: [number, number], b: [number, number]) =>
    links.has(key(id(...a), id(...b)));
  const solution = route;
  const cells: [number, number][] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) if (used[id(c, r)]) cells.push([c, r]);

  const center = (c: number, r: number): [number, number] => [
    (c - (cols - 1) / 2) * cell,
    -r * cell,
  ];
  const wallH = () => 13 + Math.floor(rand() * 4) * 3; // 13, 16, 19 or 22 m: brutal, uneven skyline

  const walls: WallSeg[] = [];
  // walls between rows (and the front/back boundary), running along x
  for (let r = -1; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const boundary = r === -1 || r === rows - 1;
      const isExit = r === rows - 1 && c === exit[0];
      if (isExit) continue;
      if (!boundary && open([c, r], [c, r + 1])) continue;
      const [x] = center(c, 0);
      walls.push({
        x,
        z: -(r + 0.5) * cell,
        len: cell,
        alongX: true,
        height: wallH(),
      });
    }
  }
  // walls between columns (and the side boundaries), running along z
  for (let c = -1; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const boundary = c === -1 || c === cols - 1;
      if (!boundary && open([c, r], [c + 1, r])) continue;
      walls.push({
        x: (c + 0.5 - (cols - 1) / 2) * cell,
        z: -r * cell,
        len: cell,
        alongX: false,
        height: wallH(),
      });
    }
  }

  // faces: every few steps along the route, on a wall of that cell, plus a few in side passages
  const faces: FaceSpot[] = [];
  const wallSides = (c: number, r: number) =>
    DIRS.filter(([dc, dr]) => {
      const n: [number, number] = [c + dc, r + dr];
      if (r + dr === rows && c === exit[0] && dr === 1) return false;
      return !inside(...n) || !open([c, r], n);
    });
  const addFace = (c: number, r: number, big: boolean) => {
    const sides = wallSides(c, r);
    if (!sides.length) return;
    const [dc, dr] = sides[Math.floor(rand() * sides.length)];
    const [cx, cz] = center(c, r);
    // wall plane sits half a cell away, minus half the wall thickness; normal points back into the cell
    const off = cell / 2 - 0.42;
    const nx = -dc;
    const nz = dr; // +r is -z, so a wall toward +r has its inner normal toward +z
    const size = big ? 3.2 + rand() * 0.8 : 1.5 + rand() * 0.5;
    faces.push({
      x: cx + dc * off,
      y: big ? 4.6 : 2.0 + rand() * 0.6,
      z: cz - dr * off,
      nx,
      nz,
      size,
    });
  };
  solution.forEach(([c, r], i) => {
    if (i > 0 && i % 2 === 0) addFace(c, r, i % 6 === 0);
  });
  // a big face waits at the end of every dead end
  for (const spur of spurs) addFace(...spur[spur.length - 1], true);

  const deadEnds: MazeLayout["deadEnds"] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const openings = DIRS.filter(
        ([dc, dr]) => inside(c + dc, r + dr) && open([c, r], [c + dc, r + dr]),
      );
      // (the exit cell is not one: its far wall is the doorway to the light, never covered)
      if (
        openings.length === 1 &&
        !(c === start[0] && r === start[1]) &&
        !(c === exit[0] && r === exit[1])
      ) {
        const [dc, dr] = openings[0];
        deadEnds.push({ c, r, nx: dc, nz: -dr });
      }
    }

  return {
    cols,
    rows,
    cell,
    wall: 0.8,
    start,
    exit,
    solution,
    walls,
    faces,
    deadEnds,
    spurs,
    cells,
    exitZ: -(rows - 0.5) * cell,
    center,
    open,
  };
}
