import type { MensajeEmail } from "./tipos";

/**
 * Plantillas de los correos transaccionales.
 *
 * HTML a mano y sin framework: son cuatro mails, y el cliente de correo más
 * usado sigue sin soportar CSS moderno. Tablas y estilos inline es lo que
 * llega igual a Gmail, a Outlook y al iPhone.
 *
 * Cada mail va en texto plano además de HTML. Un mail sólo-HTML puntúa peor en
 * los filtros, y un mail de verificación en spam es una cuenta que no se activa.
 */

/** Se escapa todo lo que venga de la base antes de meterlo en el HTML. */
function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function envoltorio(titulo: string, cuerpo: string): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapar(titulo)}</title></head>
<body style="margin:0;padding:0;background:#faf8f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1c1917">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f5;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:32px">
<tr><td>
<p style="margin:0 0 24px;font-size:20px;font-weight:600;letter-spacing:-0.01em">Anima</p>
${cuerpo}
<p style="margin:32px 0 0;padding-top:24px;border-top:1px solid #e7e5e4;font-size:12px;color:#78716c">
Anima · Jugos orgánicos prensados en frío · Montevideo
</p>
</td></tr></table>
</td></tr></table>
</body></html>`;
}

function boton(url: string, etiqueta: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0">
<tr><td style="background:#1c1917;border-radius:999px">
<a href="${escapar(url)}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500">${escapar(etiqueta)}</a>
</td></tr></table>`;
}

const P = 'style="margin:0 0 16px;font-size:15px;line-height:1.6"';
const CHICO = 'style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#78716c"';

/* ------------------------------------------------------- verificación */

export function plantillaVerificacion(
  para: string,
  nombre: string | null,
  url: string,
): MensajeEmail {
  const saludo = nombre ? `Hola ${nombre},` : "Hola,";

  return {
    para,
    asunto: "Confirmá tu correo — Anima",
    html: envoltorio(
      "Confirmá tu correo",
      `<p ${P}>${escapar(saludo)}</p>
<p ${P}>Tocá el botón para confirmar tu correo y activar la cuenta.</p>
${boton(url, "Confirmar mi correo")}
<p ${CHICO}>El link vence en 24 horas y sirve una sola vez.</p>
<p ${CHICO}>Si no creaste ninguna cuenta en Anima, ignorá este mensaje: sin confirmar, la cuenta no se activa.</p>`,
    ),
    texto: `${saludo}

Confirmá tu correo para activar tu cuenta en Anima:

${url}

El link vence en 24 horas y sirve una sola vez.

Si no creaste ninguna cuenta, ignorá este mensaje: sin confirmar, la cuenta no se activa.

— Anima`,
  };
}

/* ------------------------------------------- intento de registro repetido */

/**
 * Va al dueño de una cuenta que ya existe cuando alguien intenta registrarse
 * con su correo.
 *
 * En pantalla, el que intentó registrarse ve exactamente lo mismo que vería si
 * el correo fuera nuevo: si dijéramos "ese correo ya está registrado", le
 * confirmaríamos a cualquiera qué direcciones son clientes nuestros. Este mail
 * es la forma de avisarle al que sí importa.
 */
export function plantillaRegistroRepetido(
  para: string,
  nombre: string | null,
  urlRecuperar: string,
): MensajeEmail {
  const saludo = nombre ? `Hola ${nombre},` : "Hola,";

  return {
    para,
    asunto: "Alguien intentó crear una cuenta con tu correo — Anima",
    html: envoltorio(
      "Intento de registro",
      `<p ${P}>${escapar(saludo)}</p>
<p ${P}>Alguien intentó crear una cuenta en Anima con esta dirección. Ya tenés una, así que no creamos ninguna nueva y <strong>tu cuenta no cambió</strong>.</p>
<p ${P}>Si fuiste vos y no te acordás la contraseña, la podés cambiar acá:</p>
${boton(urlRecuperar, "Cambiar mi contraseña")}
<p ${CHICO}>Si no fuiste vos, no hay nada que hacer: sin tu contraseña nadie entra. Igual, si querés quedarte tranquilo, cambiala.</p>`,
    ),
    texto: `${saludo}

Alguien intentó crear una cuenta en Anima con esta dirección. Ya tenés una, así que no creamos ninguna nueva y tu cuenta no cambió.

Si fuiste vos y no te acordás la contraseña:

${urlRecuperar}

Si no fuiste vos, no hay nada que hacer: sin tu contraseña nadie entra.

— Anima`,
  };
}

/* ------------------------------------------------------------- reset */

export function plantillaReset(
  para: string,
  nombre: string | null,
  url: string,
): MensajeEmail {
  const saludo = nombre ? `Hola ${nombre},` : "Hola,";

  return {
    para,
    asunto: "Cambiá tu contraseña — Anima",
    html: envoltorio(
      "Cambiá tu contraseña",
      `<p ${P}>${escapar(saludo)}</p>
<p ${P}>Pediste cambiar tu contraseña. Tocá el botón para elegir una nueva.</p>
${boton(url, "Elegir contraseña nueva")}
<p ${CHICO}>El link vence en 30 minutos y sirve una sola vez.</p>
<p ${CHICO}>Si no lo pediste, ignorá este mensaje: tu contraseña sigue igual. Nadie puede cambiarla sin abrir este link.</p>`,
    ),
    texto: `${saludo}

Pediste cambiar tu contraseña en Anima. Elegí una nueva acá:

${url}

El link vence en 30 minutos y sirve una sola vez.

Si no lo pediste, ignorá este mensaje: tu contraseña sigue igual.

— Anima`,
  };
}

/* ------------------------------------------- aviso de cambio consumado */

/**
 * Se manda DESPUÉS de cambiar la contraseña, y no es opcional.
 *
 * Es la única señal que recibe el dueño si alguien le tomó la cuenta: sin este
 * mail, un cambio de contraseña ajeno es silencioso.
 */
export function plantillaPasswordCambiada(
  para: string,
  nombre: string | null,
  cuando: Date,
): MensajeEmail {
  const saludo = nombre ? `Hola ${nombre},` : "Hola,";
  const fecha = new Intl.DateTimeFormat("es-UY", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Montevideo",
  }).format(cuando);

  return {
    para,
    asunto: "Tu contraseña cambió — Anima",
    html: envoltorio(
      "Tu contraseña cambió",
      `<p ${P}>${escapar(saludo)}</p>
<p ${P}>Tu contraseña de Anima se cambió el ${escapar(fecha)}.</p>
<p ${P}>Por seguridad cerramos todas las sesiones abiertas: vas a tener que entrar de nuevo en cada dispositivo.</p>
<p ${CHICO}><strong>Si no fuiste vos</strong>, escribinos respondiendo este mensaje. Alguien tiene acceso a este correo.</p>`,
    ),
    texto: `${saludo}

Tu contraseña de Anima se cambió el ${fecha}.

Por seguridad cerramos todas las sesiones abiertas: vas a tener que entrar de nuevo en cada dispositivo.

Si no fuiste vos, respondé este mensaje. Alguien tiene acceso a este correo.

— Anima`,
  };
}
