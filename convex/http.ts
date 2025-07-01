import { httpRouter } from "convex/server";
import { WebhookEvent } from "@clerk/nextjs/server";
import { Webhook } from "svix";
import { api } from "./_generated/api";
import { httpAction } from "./_generated/server";

const http = httpRouter();

http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    console.log("🔔 Webhook received");
    
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error("Missing CLERK_WEBHOOK_SECRET environment variable");
    }

    const svix_id = request.headers.get("svix-id");
    const svix_signature = request.headers.get("svix-signature");
    const svix_timestamp = request.headers.get("svix-timestamp");

    if (!svix_id || !svix_signature || !svix_timestamp) {
      console.log("❌ Missing svix headers");
      return new Response("No svix headers found", {
        status: 400,
      });
    }

    const payload = await request.json();
    const body = JSON.stringify(payload);

    const wh = new Webhook(webhookSecret);
    let evt: WebhookEvent;

    try {
      evt = wh.verify(body, {
        "svix-id": svix_id,
        "svix-timestamp": svix_timestamp,
        "svix-signature": svix_signature,
      }) as WebhookEvent;
      console.log("✅ Webhook verified successfully");
    } catch (err) {
      console.error("❌ Error verifying webhook:", err);
      return new Response("Error occurred", { status: 400 });
    }

    const eventType = evt.type;
    console.log("📋 Event type:", eventType);

    if (eventType === "user.created") {
      console.log("👤 Processing user.created event");
      const { id, first_name, last_name, image_url, email_addresses } = evt.data;
      console.log("📊 Raw event data:", { id, first_name, last_name, image_url, email_addresses });

      const email = email_addresses[0].email_address;
      const name = `${first_name || ""} ${last_name || ""}`.trim();
      
      console.log("🔄 Processed data:", { email, name, image: image_url, clerkId: id });

      try {
        const result = await ctx.runMutation(api.users.syncUser, {
          email,
          name,
          image: image_url,
          clerkId: id,
        });
        console.log("✅ User created successfully:", result);
      } catch (error) {
        console.log("❌ Error creating user:", error);
        return new Response("Error creating user", { status: 500 });
      }
    }

    if (eventType === "user.updated") {
      console.log("👤 Processing user.updated event");
      const { id, email_addresses, first_name, last_name, image_url } = evt.data;

      const email = email_addresses[0].email_address;
      const name = `${first_name || ""} ${last_name || ""}`.trim();

      try {
        const result = await ctx.runMutation(api.users.updateUser, {
          clerkId: id,
          email,
          name,
          image: image_url,
        });
        console.log("✅ User updated successfully:", result);
      } catch (error) {
        console.log("❌ Error updating user:", error);
        return new Response("Error updating user", { status: 500 });
      }
    }

    console.log("🎉 Webhook processed successfully");
    return new Response("Webhooks processed successfully", { status: 200 });
  }),
});

export default http;