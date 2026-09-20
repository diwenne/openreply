import { NextRequest, NextResponse } from "next/server";
import {
  getWorkspaceAISettings,
  updateWorkspaceAISettings,
  generateAICompletion,
} from "@/lib/ai/gateway";
import { SUPPORTED_AI_PROVIDERS, type AIProviderId } from "@/lib/ai/types";

export async function GET() {
  try {
    const settings = getWorkspaceAISettings();
    // Mask sensitive keys for frontend display
    const masked = {
      ...settings,
      groqApiKey: settings.groqApiKey ? `${settings.groqApiKey.slice(0, 4)}...${settings.groqApiKey.slice(-4)}` : "",
      openrouterApiKey: settings.openrouterApiKey ? `${settings.openrouterApiKey.slice(0, 6)}...${settings.openrouterApiKey.slice(-4)}` : "",
      nvidiaApiKey: settings.nvidiaApiKey ? `${settings.nvidiaApiKey.slice(0, 6)}...${settings.nvidiaApiKey.slice(-4)}` : "",
      geminiApiKey: settings.geminiApiKey ? `${settings.geminiApiKey.slice(0, 4)}...${settings.geminiApiKey.slice(-4)}` : "",
    };

    return NextResponse.json({
      success: true,
      data: {
        settings: masked,
        providers: SUPPORTED_AI_PROVIDERS,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "test_connection") {
      const { provider, apiKey, model } = body;
      const testSettings = {
        ...getWorkspaceAISettings(),
        provider: provider as AIProviderId,
        model: model || SUPPORTED_AI_PROVIDERS[provider as AIProviderId]?.defaultModel,
        ...(provider === "groq" ? { groqApiKey: apiKey } : {}),
        ...(provider === "openrouter" ? { openrouterApiKey: apiKey } : {}),
        ...(provider === "nvidia" ? { nvidiaApiKey: apiKey } : {}),
        ...(provider === "gemini" ? { geminiApiKey: apiKey } : {}),
      };

      const result = await generateAICompletion({
        settings: testSettings,
        systemPrompt: "You are an AI diagnostic assistant for Instagram automation.",
        userPrompt: "Respond with exactly: 'OpenReply AI Connected successfully.'",
        maxTokens: 50,
      });

      return NextResponse.json({
        success: true,
        data: {
          reply: result.text,
          provider: result.provider,
          model: result.model,
          isMockFallback: result.isMockFallback,
        },
      });
    }

    if (action === "update_settings") {
      const { updates } = body;
      // Preserve existing keys if incoming value is masked or omitted
      const current = getWorkspaceAISettings();
      const sanitizedUpdates = { ...updates };

      if (sanitizedUpdates.groqApiKey && sanitizedUpdates.groqApiKey.includes("...")) {
        sanitizedUpdates.groqApiKey = current.groqApiKey;
      }
      if (sanitizedUpdates.openrouterApiKey && sanitizedUpdates.openrouterApiKey.includes("...")) {
        sanitizedUpdates.openrouterApiKey = current.openrouterApiKey;
      }
      if (sanitizedUpdates.nvidiaApiKey && sanitizedUpdates.nvidiaApiKey.includes("...")) {
        sanitizedUpdates.nvidiaApiKey = current.nvidiaApiKey;
      }
      if (sanitizedUpdates.geminiApiKey && sanitizedUpdates.geminiApiKey.includes("...")) {
        sanitizedUpdates.geminiApiKey = current.geminiApiKey;
      }

      const updated = updateWorkspaceAISettings("default", sanitizedUpdates);
      return NextResponse.json({
        success: true,
        data: updated,
      });
    }

    return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
