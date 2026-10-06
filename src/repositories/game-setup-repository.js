import {
  CHARACTER_PROFILES,
  DEFAULT_CHARACTER_ID,
  DEFAULT_CONDITION_ID,
  GAME_MODES,
  LOADOUTS,
  MAPS,
  MATCH_CONDITIONS,
} from "../config.js";
import { LocalJsonRepository } from "./local-json-repository.js";

export const GAME_SETUP_STORAGE_KEY = "toon-strike.game-setup.v1";

export const DEFAULT_GAME_SETUP = Object.freeze({
  versionId: null,
  mapId: "city",
  modeId: "4v4",
  loadoutId: "recon",
  characterId: DEFAULT_CHARACTER_ID,
  conditionId: DEFAULT_CONDITION_ID,
  alias: "",
});

const VERSION_IDS = new Set(["solo", "network", "lan"]);
const ALIAS_PATTERN = /^[\p{L}\p{N}_\-\s]{2,16}$/u;

function knownId(collection, value, fallback) {
  return typeof value === "string" && Object.hasOwn(collection, value) ? value : fallback;
}

function normalizeAlias(value) {
  const alias = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return ALIAS_PATTERN.test(alias) ? alias : "";
}

export function normalizeGameSetup(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    versionId: VERSION_IDS.has(source.versionId) ? source.versionId : DEFAULT_GAME_SETUP.versionId,
    mapId: knownId(MAPS, source.mapId, DEFAULT_GAME_SETUP.mapId),
    modeId: knownId(GAME_MODES, source.modeId, DEFAULT_GAME_SETUP.modeId),
    loadoutId: knownId(LOADOUTS, source.loadoutId, DEFAULT_GAME_SETUP.loadoutId),
    characterId: knownId(CHARACTER_PROFILES, source.characterId, DEFAULT_GAME_SETUP.characterId),
    conditionId: knownId(MATCH_CONDITIONS, source.conditionId, DEFAULT_GAME_SETUP.conditionId),
    alias: normalizeAlias(source.alias),
  };
}

export class IGameSetupRepository {
  load() { throw new Error("IGameSetupRepository.load() is not implemented."); }
  save(_setup) { throw new Error("IGameSetupRepository.save() is not implemented."); }
  clear() { throw new Error("IGameSetupRepository.clear() is not implemented."); }
  subscribe(_listener) { throw new Error("IGameSetupRepository.subscribe() is not implemented."); }
}

export class LocalGameSetupRepository extends IGameSetupRepository {
  constructor(options = {}) {
    super();
    this.repository = new LocalJsonRepository({
      ...options,
      key: options.key || GAME_SETUP_STORAGE_KEY,
      normalize: normalizeGameSetup,
    });
  }

  load() { return this.repository.load(); }
  save(setup) { return this.repository.save(setup); }
  clear() { return this.repository.clear(); }
  subscribe(listener) { return this.repository.subscribe(listener); }
}
