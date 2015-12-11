import {Map, List, Range, fromJS} from "immutable";
import actionTypes from "../actions/actionTypes";
import {DIRECTIONS, VECTORS, INITIAL} from "../constants";
import {randomNumber, isLucky} from "../utils/math";
import store from "store2";
import _ from "lodash";

/**
 * Generate a list of the available empty cells.
 *
 * @param {Number} height
 * @param {Number} width
 * @returns {Object}
 */
function generateCells(height, width) {
  let cells = List();

  _.times(height, x => {
    _.times(width, y => {
      cells = cells.push(Map({x, y}));
    });
  });

  return cells;
}

/**
 * Generate a grid for of empty cells to be filled with tiles.
 *
 * @param {Number} height
 * @param {Number} width
 * @returns {Object}
 */
function generateGrid(height, width) {
  let cells = List();

  _.times(height, x => {
    cells = cells.set(x, List());
    _.times(width, y => {
      cells = cells.setIn([x, y], List());
    });
  });

  return cells;
}

/**
 * New Random Tile
 *
 * newTile.js util/reducer ?
 */
let id = 0;
let initialState;
let savedState;
let defaultState;

if (store.get("game")) {
  const tiles = _.flatten(store.get("game").grid, true);
  const ids = _.pluck(tiles, "id");
  if (ids.length) {
    id = _.max(ids) + 1;
  }

  const game = store.get("game");
  game.fromSaved = true;
  savedState = fromJS(game);
}

defaultState = Map({
  win: null,
  score: 0,
  dimensions: List.of(4, 4),
  cells: generateCells(4, 4),
  grid: generateGrid(4, 4),
  isActual: true,
  fromSaved: false
});

initialState = savedState || defaultState;

/**
 * Get a random cell from the list of empty cells.
 *
 * @param {Object} state
 * @returns {Object}
 */
function randomCell(state) {
  const max = state.get("cells").size - 1;
  return randomNumber(0, max);
}

/**
 * Push a new tile into the chosen cell.
 *
 * @param {Object} state
 * @param {Object} tile
 * @returns {Object}
 */
function addTile(state, tile, value) {
  return state.updateIn(["grid", tile.get("x"), tile.get("y")], cell => {
    return cell.push(tile.merge({
      id: id++,
      value: value || INITIAL,
      merged: false
    }));
  });
}


/**
 * Creates a new random tile in the grid by taking it from the list of
 * available empty tiles.
 *
 * @param {Object} state
 * @returns {Object}
 */
function newTile(state) {
  if (!state.get("cells").size) return state;

  const cell = randomCell(state);
  const tile = state.getIn(["cells", cell]);

  // TODO - Fix
  if (id === 0 || id === 1) {
    state = addTile(state, tile);
  } else {
    if (isLucky()) {
      state = addTile(state, tile, "x");
    } else {
      state = addTile(state, tile);
    }
  }

  state = state.removeIn(["cells", cell]);

  return state;
}

/**
 * Get a certain direction vectors.
 *
 * @param {Number} n
 * @returns {Object}
 */
function getVector(direction) {
  return VECTORS[direction];
}

/**
 * Get the current direction axis and value.
 *
 * @param {Object} direction
 * @returns {Object}
 */
function getCurrent(direction) {
  let axis;
  const directions = getVector(direction);

  for (const i in directions) {
    if ({}.hasOwnProperty.call(directions, i)) {
      if (directions[i] !== 0) {
        axis = i;
      }
    }
  }

  return {
    axis,
    value: directions[axis]
  };
}

/**
 * Check if the tile is suitable to be moved to the provided cell.
 *
 * @param {Object} cell
 * @param {Object} tile
 * @returns {Boolean}
 */
function isSuitable(cell, tile) {
  const t1 = cell.getIn([0, "value"]);
  const t2 = tile.get("value");

  if (cell.size > 1) return false;
  if (cell.size) {
    if (t1 === "x" || t2 === "x") return true;
    if (t1 !== t2) return false;
  }

  return true;
}

/**
 * Find an available cell for the tile to be moved in.
 *
 * @param {Object} state
 * @param {Object} tile
 * @param {Number} direction
 * @returns {Object}
 */
function findAvailableCell(state, tile, direction) {
  let available;
  const {axis, value} = getCurrent(direction);
  const from = tile.get(axis);
  const to = value < 0 ? 3 : 0;

  Range(to, from).forEach(index => {
    const path = (
      axis === "x" ?
      ["grid", index, tile.get("y")] :
      ["grid", tile.get("x"), index]
    );

    const cell = state.getIn(path);

    if (tile.get("value") === "x") {
      if (!isSuitable(cell, tile)) {
        available = null;
      } else {
        if (cell.size === 1) available = path;
        if (!cell.size && !available) {
          available = path;
        }
      }
      return;
    }

    if (!isSuitable(cell, tile)) {
      available = null;
    } else {
      available = available || path;
    }
  });

  return available;
}

/**
 * Move the current tile to an available cell by following its path.
 *
 * @param {Object} state
 * @param {Object} tile
 * @param {Number} direction
 * @returns {Object}
 */
function moveTile(state, tile, direction) {
  const available = findAvailableCell(state, tile, direction);

  if (available) {
    state = state.set("isActual", false);
    state = state.updateIn(available, cell => cell.push(tile));
    state = state.updateIn(["grid", tile.get("x"), tile.get("y")], arr => {
      return arr.pop();
    });
  }

  return state;
}

/**
 * Sort the tiles by axis and its value. Reverse the list on negative value.
 *
 * @param {Object} tiles
 * @param {Number} direction
 * @returns {Object}
 */
function sortTiles(tiles, direction) {
  const {axis, value} = getCurrent(direction);
  tiles = tiles.sortBy(tile => tile.get(axis));
  if (value < 0) tiles = tiles.reverse();
  return tiles;
}

/**
 * Move the tile objects to their new cells positions, without changing
 * their canvas position yet.
 *
 * @param {Object} state
 * @param {Object] direction
 * @returns {Object}
 */
function moveTiles(state, direction) {
  const initial = state;
  let tiles = state.get("grid").flatten(2);
  tiles = sortTiles(tiles, direction);

  tiles.forEach((tile) => {
    state = moveTile(state, tile, direction);
  });

  if (initial === state) {
    let over = true;

    _.each(_.without(_.values(DIRECTIONS), direction), (d) => {
      tiles = sortTiles(tiles, d);
      tiles.forEach((tile) => {
        state = moveTile(state, tile, d);
      });

      if (initial !== state) over = false;
    });

    if (over) {
      state = state.set("win", false);
    } else {
      state = initial;
    }
  }

  return state;
}

/**
 * ACTUALIZE
 */
function actualize(state) {
  let grid = state.get("grid");

  grid.forEach((row, x) => {
    row.forEach((cell, y) => {
      if (cell.size) {
        cell.forEach((tile, index) => {
          if (tile.get("x") !== x || tile.get("y") !== y) {
            grid = grid.updateIn([x, y, index], t => {
              return t.merge({x, y});
            });
          }
        });
      }
    });
  });

  state = state.set("isActual", true);

  return state.set("grid", grid);
}

/**
 * TODO - Separate
 * Merge tiles and update the empty cells list.
 *
 * @param {Object} state
 * @returns {Object}
 */
function mergeTiles(state) {
  let cells = List();
  let grid = state.get("grid");

  grid.forEach((row, x) => {
    row.forEach((cell, y) => {
      if (!cell.size) {
        cells = cells.push(Map({x, y}));
      }

      if (cell.size > 1) {
        const newValue = cell.reduce((t1, t2) => {
          if (t1.get("value") === "x") {
            return t2.get("value") + t2.get("value");
          }

          if (t2.get("value") === "x") {
            return t1.get("value") + t1.get("value");
          }

          return t1.get("value") + t2.get("value");
        });

        const tile = cell.first().merge({
          value: newValue,
          id: id++,
          merged: true
        });

        if (newValue === 2048) {
          state = state.set("win", true);
        }

        state = state.set("score", state.get("score") + newValue);

        grid = grid.setIn([x, y], List.of(tile));
      }
    });
  });

  state = state.set("grid", grid);
  return state.set("cells", cells);
}

function setMerged(state, idd) {
  const tiles = state.get("grid").flatten(2);
  const t = tiles.find(tile => {
    return tile.get("id") === idd;
  });

  state = state.setIn(["grid", t.get("x"), t.get("y"), 0, "merged"], false);
  return state;
}

function saveGame(state) {
  store("game", state.toJS());
}

export default (state = initialState, action) => {
  switch (action.type) {
    case actionTypes.NEW_TILE:
      return newTile(state);

    case actionTypes.MOVE_TILES:
      return moveTiles(state, action.direction);

    case actionTypes.ACTUALIZE:
      return actualize(state);

    case actionTypes.MERGE_TILES:
      return mergeTiles(state);

    case actionTypes.RESTART_GAME:
      store(false);
      state = defaultState;
      state = newTile(state);
      state = newTile(state);
      return state;

    case actionTypes.GAME_OVER:
      state = state.set("win", false);
      return state;

    case actionTypes.SAVE_GAME:
      saveGame(state);
      return state;

    case actionTypes.MERGED:
      return setMerged(state, action.id);

    default:
      return state;
  }
};
