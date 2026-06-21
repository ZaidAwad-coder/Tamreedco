import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SMTP_HOST = "smtp.hostinger.com";
const SMTP_PORT = 465;
const SMTP_USER = "support@tamreedco.com";
const SMTP_PASS = Deno.env.get("SMTP_PASSWORD") || "";
const YOUR_EMAIL = "support@tamreedco.com";

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { name, email, subject, message } = await req.json();

    if (!name || !email || !message) {
      return new Response(JSON.stringify({ error: "Missing fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Use Resend as SMTP relay (works great with Supabase Edge Functions)
    // We'll use fetch to call our SMTP endpoint
    const emailPayload = {
      from: `TamreedCo <${SMTP_USER}>`,
      to: YOUR_EMAIL,
      subject: `📬 New Contact: ${subject || "General Inquiry"} — from ${name}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <div style="background:#0B1F3A;padding:20px;border-radius:12px 12px 0 0">
            <h2 style="color:#fff;margin:0;font-size:20px">New Contact Message — TamreedCo</h2>
          </div>
          <div style="background:#f8fafd;padding:24px;border-radius:0 0 12px 12px;border:1px solid #dde4ee">
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:8px 0;color:#5c7a96;font-size:13px;width:100px">Name</td><td style="padding:8px 0;font-weight:600;color:#111f2e">${name}</td></tr>
              <tr><td style="padding:8px 0;color:#5c7a96;font-size:13px">Email</td><td style="padding:8px 0;color:#1a6fdb"><a href="mailto:${email}">${email}</a></td></tr>
              <tr><td style="padding:8px 0;color:#5c7a96;font-size:13px">Subject</td><td style="padding:8px 0;color:#111f2e">${subject || "General"}</td></tr>
            </table>
            <div style="margin-top:16px;padding:16px;background:#fff;border-radius:8px;border:1px solid #dde4ee">
              <div style="color:#5c7a96;font-size:12px;margin-bottom:8px">MESSAGE</div>
              <div style="color:#111f2e;line-height:1.6">${message.replace(/\n/g, "<br>")}</div>
            </div>
            <div style="margin-top:20px">
              <a href="mailto:${email}?subject=Re: ${encodeURIComponent(subject || 'Your TamreedCo Inquiry')}" 
                 style="background:#1a6fdb;color:#fff;padding:10px 20px;border-radius:999px;text-decoration:none;font-size:14px;font-weight:600">
                Reply to ${name} →
              </a>
            </div>
          </div>
          <p style="color:#8fa3bb;font-size:12px;margin-top:16px;text-align:center">TamreedCo · support@tamreedco.com</p>
        </div>
      `
    };

    const autoReplyPayload = {
      from: `TamreedCo <${SMTP_USER}>`,
      to: email,
      subject: `We received your message — TamreedCo will reply within 24 hours`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <div style="background:#0B1F3A;padding:20px;border-radius:12px 12px 0 0;text-align:center">
            <h2 style="color:#fff;margin:0 0 4px 0;font-size:22px">TamreedCo <span style="color:#0FA995">✓</span></h2>
            <p style="color:rgba(255,255,255,0.5);margin:0;font-size:13px">tamreedco.com</p>
          </div>
          <div style="background:#f8fafd;padding:28px;border-radius:0 0 12px 12px;border:1px solid #dde4ee">
            <h3 style="color:#0B1F3A;margin:0 0 12px 0">Hi ${name}, we got your message! 👋</h3>
            <p style="color:#3a5570;line-height:1.7;margin:0 0 16px 0">
              Thank you for reaching out. Our team has received your message and will get back to you 
              <strong>within 24 hours</strong>.
            </p>
            <div style="background:#fff;border:1px solid #dde4ee;border-radius:8px;padding:16px;margin-bottom:20px">
              <div style="color:#8fa3bb;font-size:12px;margin-bottom:6px">YOUR MESSAGE</div>
              <div style="color:#1e3448;font-size:14px;line-height:1.6">${message.replace(/\n/g, "<br>")}</div>
            </div>
            <p style="color:#5c7a96;font-size:13px;margin:0">
              If you need urgent help, email us directly at 
              <a href="mailto:support@tamreedco.com" style="color:#1a6fdb">support@tamreedco.com</a>
            </p>
          </div>
          <p style="color:#8fa3bb;font-size:12px;margin-top:16px;text-align:center">
            © 2025 TamreedCo · Nursing Jobs Across the Middle East<br>
            <a href="https://tamreedco.com" style="color:#8fa3bb">tamreedco.com</a>
          </p>
        </div>
      `
    };

    // Send both emails via SMTP using smtp library
    const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");
    
    const client = new SMTPClient({
      connection: {
        hostname: SMTP_HOST,
        port: SMTP_PORT,
        tls: true,
        auth: {
          username: SMTP_USER,
          password: SMTP_PASS,
        },
      },
    });

    // Send notification to you
    await client.send({
      from: emailPayload.from,
      to: emailPayload.to,
      subject: emailPayload.subject,
      html: emailPayload.html,
    });

    // Send auto-reply to sender
    await client.send({
      from: autoReplyPayload.from,
      to: autoReplyPayload.to,
      subject: autoReplyPayload.subject,
      html: autoReplyPayload.html,
    });

    await client.close();

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });

  } catch (err) {
    console.error("Email error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
