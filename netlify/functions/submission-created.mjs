// Se ejecuta en cada envío verificado de un formulario de Netlify (evento "submission-created")
// y guarda la solicitud en el almacén privado "solicitudes" para el panel de control.
import { getStore } from "@netlify/blobs";

const clean = (v, max = 120) => String(v ?? "").trim().slice(0, max);

export default async (req) => {
  const { payload } = await req.json();
  if (!payload || payload.form_name !== "solicitud") return new Response("ignorado");

  const d = payload.data || {};
  const origen = clean(d.origen_qr, 40).replace(/[^A-Za-z0-9_-]/g, "") || "directo";
  const registro = {
    id: String(payload.id),
    fecha: payload.created_at || new Date().toISOString(),
    nombre: clean(d.nombre),
    edad: clean(d.edad, 3),
    telefono: clean(d.telefono, 30),
    email: clean(d.email),
    reprocann: clean(d.reprocann, 40),
    ritmo: clean(d.ritmo, 40),
    origen,
  };

  const store = getStore({ name: "solicitudes", consistency: "strong" });
  await store.setJSON(`${origen}/${registro.id}`, registro);
  return new Response("ok");
};
