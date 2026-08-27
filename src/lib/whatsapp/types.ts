import { Role } from "@/types/auth";
import { ChatMessage } from "../ai/types";

export interface WhatsAppResolvedContext {
  userId: string;
  businessId: string;
  businessName: string;
  currency: string;
  role: Role;
  phoneNumber: string;
}

export interface WhatsAppSession {
  phoneNumber: string;
  conversationHistory: ChatMessage[];
  activeActionToken?: string;
  lastActivity: number;
}

// ─── Meta WhatsApp Cloud API Inbound Webhook Payload ─────────────────────────

export interface WhatsAppWebhookPayload {
  object: string;
  entry: {
    id: string;
    changes: {
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: {
          profile: {
            name: string;
          };
          wa_id: string;
        }[];
        messages?: WhatsAppInboundMessage[];
        statuses?: {
          id: string;
          status: "sent" | "delivered" | "read" | "failed";
          timestamp: string;
          recipient_id: string;
        }[];
      };
      field: string;
    }[];
  }[];
}

export interface WhatsAppInboundMessage {
  id: string;
  from: string; // e.g. "2348012345678"
  timestamp: string;
  type: "text" | "interactive" | "button" | "location" | "image" | "document" | "unknown";
  text?: {
    body: string;
  };
  interactive?: {
    type: "button_reply" | "list_reply";
    button_reply?: {
      id: string;
      title: string;
    };
    list_reply?: {
      id: string;
      title: string;
      description?: string;
    };
  };
  button?: {
    text: string;
    payload?: string;
  };
}

export interface WhatsAppOutboundResponse {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "text" | "interactive";
  text?: {
    preview_url?: boolean;
    body: string;
  };
  interactive?: {
    type: "button";
    body: {
      text: string;
    };
    action: {
      buttons: {
        type: "reply";
        reply: {
          id: string;
          title: string;
        };
      }[];
    };
  };
}
