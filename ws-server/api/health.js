export default function health(_request, response) {
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.statusCode = 200;
  response.end(JSON.stringify({ ok: true, service: "toon-strike-ws" }));
}
