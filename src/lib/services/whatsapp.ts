import { env } from "../env";
import { logServerError } from "../logger";

export function isWhatsAppCloudApiConfigured() {
  return Boolean(env.WHATSAPP_API_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
}

export function buildWhatsAppCloudApiPayload({ to, text }: { to: string; text: string }) {
  return {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: {
      body: text,
    },
  } as const;
}

export async function sendWhatsAppTextMessage({ to, text }: { to: string; text: string }) {
  if (!isWhatsAppCloudApiConfigured()) {
    throw new Error("WhatsApp Cloud API is not configured. Set WHATSAPP_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID in the environment.");
  }

  const response = await fetch(`https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildWhatsAppCloudApiPayload({ to, text })),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data?.error?.message ?? JSON.stringify(data);
    throw new Error(`WhatsApp Cloud API request failed: ${detail}`);
  }

  return data;
}

export async function sendWhatsAppBroadcast({ entity, recipients }: { entity: "vendors" | "customers"; recipients: Array<{ id: string; name: string; phone: string; message: string }> }) {
  const report = {
    total: recipients.length,
    successful: 0,
    failed: 0,
    failureReasons: [] as string[],
  };

  if (recipients.length === 0) {
    return report;
  }

  for (const [index, recipient] of recipients.entries()) {
    try {
      if (!recipient.phone) {
        throw new Error("Recipient is missing a valid WhatsApp or phone number.");
      }

      await sendWhatsAppTextMessage({ to: recipient.phone, text: recipient.message });
      report.successful += 1;
      console.log(`[whatsapp-broadcast] ${entity} ${index + 1}/${recipients.length}: ${recipient.name} sent`);
    } catch (error) {
      report.failed += 1;
      const reason = error instanceof Error ? error.message : String(error);
      report.failureReasons.push(`${recipient.name}: ${reason}`);
      logServerError("whatsapp-broadcast-send-failed", error, { entity, recipientId: recipient.id, recipientName: recipient.name });
    }
  }

  return report;
}
