import { describe, expect, it } from "vitest";
import { buildWhatsAppCloudApiPayload, isWhatsAppCloudApiConfigured } from "./whatsapp";

describe("whatsapp broadcast service", () => {
  it("builds a WhatsApp Cloud API payload for a text message", () => {
    const payload = buildWhatsAppCloudApiPayload({
      to: "923001234567",
      text: "Assalamu Alaikum Ahmed",
    });

    expect(payload.to).toBe("923001234567");
    expect(payload.text.body).toContain("Assalamu Alaikum Ahmed");
  });

  it("reports when the WhatsApp Cloud API configuration is missing", () => {
    expect(isWhatsAppCloudApiConfigured()).toBe(false);
  });
});
