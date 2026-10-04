import assert from "node:assert/strict";
import test from "node:test";

import {
  WeaponViewmodel, advanceWeaponEffects, getViewmodelPose, getViewmodelProfile,
} from "../src/weapon-viewmodel.js";

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

test("the archery loadout has distinct bow, sidearm, and dual-blade viewmodels", () => {
  assert.equal(getViewmodelProfile("powerBow").kind, "bow");
  assert.equal(getViewmodelProfile("desertEagle").kind, "pistol");
  assert.equal(getViewmodelProfile("dualBlades").kind, "dual-blades");

  const bow = new WeaponViewmodel();
  bow.triggerShot({ weaponId: "powerBow", profile: "bow" });
  assert.equal(bow.firing, false);
  assert.equal(bow.state.melee, 1);

  const blades = new WeaponViewmodel();
  blades.triggerShot({ weaponId: "dualBlades", profile: "knife" });
  assert.equal(blades.firing, false);
  assert.equal(blades.state.melee, 1);
});

test("paused frames do not advance weapon presentation state", () => {
  const state = { kick: .7, muzzle: .04, melee: .5, time: 3, weaponId: "ak47" };
  assert.strictEqual(advanceWeaponEffects(state, 0), state);
});

test("first-person firearms point from the lower right into the scene", () => {
  const width = 1920;
  const height = 1080;
  for (const weaponId of ["barrett", "ak47", "policeMG", "whitePistol", "baike", "dualPistols"]) {
    const pose = getViewmodelPose(weaponId, width, height);
    assert.ok(pose.origin.x > width * .8, `${weaponId} starts at the lower right`);
    assert.ok(pose.origin.y > height * .95, `${weaponId} starts below the sight line`);
    assert.ok(pose.muzzle.x < pose.origin.x, `${weaponId} muzzle advances toward center`);
    assert.ok(pose.muzzle.x > width * .45, `${weaponId} muzzle does not point off the left edge`);
    assert.ok(pose.muzzle.y < pose.origin.y - height * .2, `${weaponId} is foreshortened into the scene`);
  }
});

test("walking bob and recoil preserve the forward-facing muzzle orientation", () => {
  const pose = getViewmodelPose(
    "ak47",
    1280,
    720,
    { activity: 1, phase: Math.PI / 2 },
    { kick: .7, time: 2, shotSequence: 3 },
  );
  assert.ok(pose.muzzle.x < pose.origin.x);
  assert.ok(pose.muzzle.y < pose.origin.y);
  assert.ok(pose.angle > .7 && pose.angle < 1);
});

test("accepted shots add deterministic recoil vibration without reversing the barrel", () => {
  const base = getViewmodelPose("barrett", 1280, 720, {}, { kick: .8, time: 1, shotSequence: 2 });
  const next = getViewmodelPose("barrett", 1280, 720, {}, { kick: .8, time: 1.01, shotSequence: 2 });
  assert.notDeepEqual(base.origin, next.origin);
  assert.ok(base.muzzle.x < base.origin.x && base.muzzle.y < base.origin.y);
  assert.ok(next.muzzle.x < next.origin.x && next.muzzle.y < next.origin.y);
});

test("portrait viewports keep long firearm muzzles inside the visible scene", () => {
  const width = 390;
  const height = 844;
  for (const weaponId of ["barrett", "ak47", "policeMG"]) {
    const pose = getViewmodelPose(weaponId, width, height);
    assert.ok(pose.size < height, `${weaponId} scales from the narrow viewport edge`);
    assert.ok(pose.muzzle.x > 0, `${weaponId} muzzle remains on screen`);
    assert.ok(pose.muzzle.x < width, `${weaponId} muzzle remains right of the far edge`);
    assert.ok(pose.muzzle.y > 0 && pose.muzzle.y < height, `${weaponId} muzzle remains vertically visible`);
  }
});
