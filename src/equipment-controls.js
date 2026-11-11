export function bindEquipmentControls(input, root = document) {
  root.querySelectorAll("[data-weapon-slot]").forEach(button => button.addEventListener("click", () => {
    input.items.push(["weaponSlot", button.dataset.weaponSlot]);
    button.blur();
  }));
  root.querySelector("#backpack-toggle")?.addEventListener("click", event => { input.items.push(["backpack"]); event.currentTarget.blur(); });
  root.querySelectorAll("[data-climb]").forEach(button => {
    button.addEventListener("pointerdown", event => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      input.flightPointers.set(event.pointerId, Number(button.dataset.climb));
    });
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) button.addEventListener(event, e => input.flightPointers.delete(e.pointerId));
  });
}

export function updateEquipmentControls(game, translate, root = document) {
  const helicopter = game.currentVehicle?.type === "helicopter";
  root.querySelectorAll("[data-weapon-slot]").forEach(button => {
    const slot = button.dataset.weaponSlot;
    const selected = helicopter ? game.currentVehicle.weaponSlot || "primary" : game.player.weaponSlot;
    button.classList.toggle("selected", slot === selected);
    button.setAttribute("aria-pressed", String(slot === selected));
    button.disabled = !game.player.alive || Boolean(game.currentVehicle && (!helicopter || slot === "melee"));
    button.querySelector("span").textContent = helicopter && slot !== "melee" ? translate(slot === "primary" ? "weapon.heliMG.name" : "weapon.heliRocket.name") : translate(`hud.weapon.${slot}`);
  });
  root.querySelector("#backpack-toggle").disabled = Boolean(game.currentVehicle) || !game.player.alive;
  root.querySelector("#flight-controls").classList.toggle("is-hidden", !helicopter);
  if (helicopter) root.querySelector("#flight-altitude").textContent = `${Math.round((game.currentVehicle.z || 0) * 2.5)} m`;
}
