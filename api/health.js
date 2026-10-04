export default function health(_request, response) {
  response.setHeader("cache-control", "no-store");
  response.status(200).json({ ok: true, service: "toon-strike" });
}
