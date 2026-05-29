import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

/**
 * Sends an SMS message using Twilio.
 * If mock credentials are used, logs to console instead.
 * 
 * @param {string} to - The recipient's phone number
 * @param {string} body - The message content
 */
export const sendSMS = async (to, body) => {
  if (!to) {
    console.warn("⚠️ Twilio: No phone number provided, skipping SMS.");
    return;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID || "ACmock_account_sid";
  const authToken = process.env.TWILIO_AUTH_TOKEN || "mock_auth_token";
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER || "+1234567890";

  if (accountSid === "ACmock_account_sid") {
    console.log(`[MOCK TWILIO SMS] To: ${to} | Message: ${body}`);
    return;
  }

  try {
    const client = twilio(accountSid, authToken);
    const message = await client.messages.create({
      body,
      from: twilioPhone,
      to,
    });
    console.log(`✅ Twilio SMS sent to ${to}. Message SID: ${message.sid}`);
    return message;
  } catch (error) {
    console.error(`❌ Twilio SMS Failed to ${to}:`, error.message);
  }
};
