export function drawRadar(canvas, game) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width, height = canvas.height;
  const rows = game.map.grid.length, columns = game.map.grid[0].length;
  const scale = Math.min(width / columns, height / rows);
  const ox = (width - columns * scale) / 2, oy = (height - rows * scale) / 2;
  ctx.fillStyle = "#101b20";
  ctx.fillRect(0, 0, width, height);
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    if (game.map.grid[y][x] === ".") continue;
    ctx.fillStyle = game.map.grid[y][x] === "C" ? "#817452" : "#465559";
    ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
  }
  for (const actor of game.actors) {
    if (!actor.alive) continue;
    ctx.fillStyle = actor.team === game.player.team ? "#a4cbd0" : "#c28a70";
    ctx.beginPath();
    ctx.arc(ox + actor.x * scale, oy + actor.y * scale, actor.id === game.player.id ? 3.3 : 2, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const vehicle of game.vehicles || []) {
    if (vehicle.health <= 0) continue;
    ctx.strokeStyle = "#c6b87f";
    ctx.strokeRect(ox + vehicle.x * scale - 2.5, oy + vehicle.y * scale - 2.5, 5, 5);
  }
  const player = game.player;
  ctx.strokeStyle = "#e8ece6";
  ctx.beginPath();
  ctx.moveTo(ox + player.x * scale, oy + player.y * scale);
  ctx.lineTo(ox + (player.x + Math.cos(player.angle) * 1.8) * scale, oy + (player.y + Math.sin(player.angle) * 1.8) * scale);
  ctx.stroke();
}
