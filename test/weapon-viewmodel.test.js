import assert from "node:assert/strict";
import test from "node:test";

import { WeaponViewmodel, advanceWeaponEffects, getViewmodelProfile } from "../src/weapon-viewmodel.js";

test("firearm shots start recoil and a short muzzle flash", () => {
  const viewmodel = new WeaponViewmodel();
  viewmodel.triggerShot({ weaponId: "barrett", profile: "sniper" });

  assert.equal(viewmodel.firing, true);
  assert.equal(viewmodel.state.weaponId, "barrett");
  assert.ok(viewmodel.state.kick > 0);
  viewmodel.advance(.05);
  assert.ok(viewmodel.state.muzzle > 0);
  viewmodel.advance(.05);
  assert.equal(viewmodel.firing, false);
});

test("melee attacks swing without creating a muzzle flash", () => {
  const viewmodel = new WeaponViewmodel();
  viewmodel.triggerShot({ weaponId: "axe", profile: "axe" });

  assert.equal(viewmodel.firing, false);
  assert.equal(viewmodel.state.melee, 1);
  assert.equal(getViewmodelProfile("axe").kind, "axe");
});

test("paused frames do not advance weapon presentation state", () => {
  const state = { kick: .7, muzzle: .04, melee: .5, time: 3, weaponId: "ak47" };
  assert.strictEqual(advanceWeaponEffects(state, 0), state);
});
