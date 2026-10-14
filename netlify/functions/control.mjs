// Panel de control de solicitudes: /control/?k=CLAVE
// Cada clave es un link privado. En el repo solo se guarda el SHA-256 de la clave, nunca la clave.
import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

const ACCESOS = {
  // panel completo (Gonzalo): todas las solicitudes con contacto
  "7c760de24ae296578c0adb64d3975d2a135c9226cf7cf1a74beea4b128a9a01d": { admin: true },
  // socios: solo ven a sus invitados (nombre y fecha)
  "033444939945ae0645cfbd6729b1fc980026148388ff2c6571f06ca47bf8e47c": { socio: "Socio-JuanFranciscoMotta", nombre: "Juan Francisco Motta" },
};

export const config = { path: ["/control", "/control/"] };

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fecha = (iso) => new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Mendoza", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
// Aporte de membresía según el nivel elegido ("No sé todavía" comienza por Degustación)
const APORTES = { "Degustación": 47000, "Varietal": 135000, "Reserva": 245000, "Gran Reserva": 340000, "Colección Privada": 410000 };
const aporte = (ritmo) => {
  const nivel = APORTES[ritmo] ? ritmo : "Degustación";
  return `${nivel} · AR$ ${APORTES[nivel].toLocaleString("es-AR")}${nivel === "Degustación" ? " al año" : " / mes"}`;
};
const nombreSocio = (origen) => origen.startsWith("Socio-") ? origen.slice(6).replace(/([a-z])([A-Z])/g, "$1 $2") : origen;

const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
};

async function leerTodo(store, prefix) {
  const { blobs } = await store.list(prefix ? { prefix } : {});
  const items = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
  return items.filter(Boolean).sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export default async (req) => {
  const url = new URL(req.url);
  const acceso = ACCESOS[sha256(url.searchParams.get("k") || "")];
  if (!acceso) return new Response(pagina("Acceso restringido", `<p class="vacio">Este link no es válido.</p>`), { status: 404, headers: HEADERS });

  const store = getStore({ name: "solicitudes", consistency: "strong" });

  // Carga manual de solicitudes anteriores (solo panel completo)
  if (req.method === "POST" && acceso.admin) {
    const lista = await req.json();
    for (const r of lista) {
      const origen = String(r.origen || "directo").replace(/[^A-Za-z0-9_-]/g, "");
      await store.setJSON(`${origen}/${r.id}`, { ...r, origen });
    }
    return Response.json({ cargadas: lista.length });
  }

  if (acceso.socio) {
    const items = await leerTodo(store, acceso.socio + "/");
    const filas = items.map((r, i) => `
      <li><span class="n">${items.length - i}</span><span class="nom">${esc(r.nombre)}</span><span class="f">${esc(fecha(r.fecha))}</span></li>`).join("");
    const cuerpo = `
      <div class="eyebrow">Socio anfitrión</div>
      <h1>${esc(acceso.nombre)}</h1>
      <p class="total"><b>${items.length}</b> ${items.length === 1 ? "invitado registrado" : "invitados registrados"}</p>
      ${items.length ? `<ol class="lista">${filas}</ol>` : `<p class="vacio">Todavía no hay solicitudes desde tu link.</p>`}
      <p class="nota">Se actualiza solo con cada solicitud nueva. Los datos de contacto quedan reservados al club.</p>`;
    return new Response(pagina(`Invitados de ${acceso.nombre}`, cuerpo), { headers: HEADERS });
  }

  // Panel completo
  const todos = await leerTodo(store);
  const filtro = url.searchParams.get("socio") || "";
  const items = filtro ? todos.filter((r) => r.origen === filtro) : todos;
  const conteo = {};
  for (const r of todos) conteo[r.origen] = (conteo[r.origen] || 0) + 1;
  const k = encodeURIComponent(url.searchParams.get("k"));
  const chips = [`<a class="chip${filtro ? "" : " on"}" href="?k=${k}">Todos <b>${todos.length}</b></a>`]
    .concat(Object.entries(conteo).sort((a, b) => b[1] - a[1]).map(([o, c]) =>
      `<a class="chip${filtro === o ? " on" : ""}" href="?k=${k}&socio=${encodeURIComponent(o)}">${esc(nombreSocio(o))} <b>${c}</b></a>`)).join("");
  const filas = items.map((r) => {
    const tel = String(r.telefono || "").replace(/\D/g, "");
    const wa = tel ? `https://wa.me/${tel.startsWith("54") ? tel : "549" + tel.replace(/^0/, "")}` : "";
    return `
      <li class="card">
        <div class="top"><span class="nom">${esc(r.nombre)}</span><span class="f">${esc(fecha(r.fecha))}</span></div>
        <div class="meta">${esc(r.edad)} años · Reprocann: ${esc(r.reprocann)} · ${esc(r.ritmo)}</div>
        <div class="meta">Aporte: <b>${esc(aporte(r.ritmo))}</b></div>
        <div class="meta">Vía <b>${esc(nombreSocio(r.origen))}</b></div>
        <div class="acc">${wa ? `<a href="${wa}" target="_blank" rel="noopener noreferrer">WhatsApp ${esc(r.telefono)}</a>` : ""}${r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : ""}</div>
      </li>`;
  }).join("");
  const cuerpo = `
    <div class="eyebrow">Panel del club</div>
    <h1>Solicitudes</h1>
    <div class="chips">${chips}</div>
    ${items.length ? `<ul class="cards">${filas}</ul>` : `<p class="vacio">Sin solicitudes.</p>`}`;
  return new Response(pagina("Solicitudes — Cepa Club", cuerpo), { headers: HEADERS });
};

function pagina(titulo, cuerpo) {
  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer">
<title>${esc(titulo)}</title>
<link rel="icon" type="image/png" href="/assets/favicon-64.png">
<link href="https://fonts.googleapis.com/css2?family=Italiana&family=Newsreader:opsz,wght@6..72,400;6..72,500&family=Archivo+Narrow:wght@500;600&display=swap" rel="stylesheet">
<style>
  :root { --ink:#1c1414; --stone:#e7e2d5; --paper:#f2eee2; --wine:#5c1220; --gold:#8c6e33; --moss:#4a5142; --line:rgba(28,20,20,.18); }
  @media (prefers-color-scheme: dark) { :root { --ink:#ece6d8; --stone:#16110f; --paper:#221a18; --wine:#d97285; --gold:#c9a054; --moss:#9aa38e; --line:rgba(236,230,216,.18); } }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--stone); color:var(--ink); font-family:'Newsreader',Georgia,serif; font-size:17px; line-height:1.5; }
  header { background:#171011; text-align:center; padding:26px 16px 22px; }
  header img { height:84px; }
  main { max-width:640px; margin:0 auto; padding:34px 16px 60px; }
  .eyebrow { font-family:'Archivo Narrow',sans-serif; font-weight:600; font-size:12px; letter-spacing:.14em; text-transform:uppercase; color:var(--gold); }
  h1 { font-family:'Italiana',serif; font-weight:400; font-size:34px; margin:6px 0 4px; line-height:1.15; }
  .total { color:var(--moss); margin:0 0 22px; } .total b { color:var(--wine); font-weight:500; font-size:22px; }
  .lista { list-style:none; padding:0; margin:0; border-top:1px solid var(--line); }
  .lista li { display:flex; gap:14px; align-items:baseline; padding:13px 2px; border-bottom:1px solid var(--line); }
  .lista .n { font-family:'Italiana',serif; color:var(--gold); width:26px; flex-shrink:0; }
  .nom { flex:1; font-weight:500; }
  .f { font-family:'Archivo Narrow',sans-serif; font-size:13px; color:var(--moss); white-space:nowrap; }
  .nota, .vacio { color:var(--moss); font-size:15px; margin-top:22px; font-style:italic; }
  .chips { display:flex; flex-wrap:wrap; gap:8px; margin:16px 0 22px; }
  .chip { font-family:'Archivo Narrow',sans-serif; font-size:13px; letter-spacing:.04em; text-decoration:none; color:var(--ink); border:1px solid var(--line); padding:6px 12px; background:var(--paper); }
  .chip.on { border-color:var(--wine); color:var(--wine); } .chip b { color:var(--gold); margin-left:4px; }
  .cards { list-style:none; padding:0; margin:0; display:grid; gap:10px; }
  .card { background:var(--paper); border:1px solid var(--line); padding:14px 16px; }
  .card .top { display:flex; gap:12px; align-items:baseline; }
  .meta { font-size:14.5px; color:var(--moss); margin-top:3px; } .meta b { font-weight:500; color:var(--ink); }
  .acc { display:flex; flex-wrap:wrap; gap:8px 16px; margin-top:8px; }
  .acc a { font-family:'Archivo Narrow',sans-serif; font-size:14px; color:var(--wine); text-decoration:none; border-bottom:1px solid currentColor; }
</style></head>
<body><header><img src="/assets/logo-cepa.png" alt="Cepa Club"></header><main>${cuerpo}</main></body></html>`;
}
