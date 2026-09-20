import { NextRequest, NextResponse } from "next/server";
import {
  saveCampaignRAGContext,
  getCampaignRAGContext,
  chunkText,
  retrieveRelevantContext,
} from "@/lib/ai/rag";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("campaignId") || searchParams.get("postId");
    if (!campaignId) {
      return NextResponse.json({ success: false, error: "Missing campaignId or postId" }, { status: 400 });
    }

    const context = getCampaignRAGContext(campaignId);
    return NextResponse.json({
      success: true,
      data: context || null,
    });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    // Handle File Upload (FormData: PDF, Markdown, TXT)
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const campaignId = (formData.get("campaignId") as string) || "draft";
      const postId = formData.get("postId") as string | null;

      if (!file) {
        return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
      }

      const fileName = file.name;
      const buffer = Buffer.from(await file.arrayBuffer());
      let extractedText = "";

      if (fileName.endsWith(".pdf")) {
        // PDF text stream extraction (handles uncompressed and standard text blocks)
        const raw = buffer.toString("binary");
        // Match standard PDF text chunks in BT ... ET blocks or string objects
        const textMatches = raw.match(/\(([^)]+)\)\s*Tj/g) || raw.match(/\[([^\]]+)\]\s*TJ/g);
        if (textMatches && textMatches.length > 0) {
          extractedText = textMatches
            .map((m) => m.replace(/^[([\\s]+|[)\\]\s*T[jJ]]+$/g, ""))
            .join(" ");
        } else {
          // Fallback extraction by stripping non-printable binary characters
          extractedText = raw
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\xFF]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        }
      } else {
        // Markdown or plain text
        extractedText = buffer.toString("utf-8");
      }

      // Clean and normalize text
      extractedText = extractedText.replace(/\r\n/g, "\n").trim();
      const chunks = chunkText(extractedText, 400, 50);

      const saved = saveCampaignRAGContext(campaignId, {
        documentName: fileName,
        rawText: extractedText,
        postId: postId || undefined,
        aiModeEnabled: true,
      });

      return NextResponse.json({
        success: true,
        data: {
          documentName: fileName,
          extractedLength: extractedText.length,
          chunksCount: chunks.length,
          previewSnippet: extractedText.slice(0, 300),
          context: saved,
        },
      });
    }

    // Handle JSON updates or retrieval tests
    const body = await req.json();
    const { action } = body;

    if (action === "save_context") {
      const { campaignId, context } = body;
      if (!campaignId) {
        return NextResponse.json({ success: false, error: "Missing campaignId" }, { status: 400 });
      }
      const saved = saveCampaignRAGContext(campaignId, context);
      return NextResponse.json({ success: true, data: saved });
    }

    if (action === "test_retrieval") {
      const { campaignId, query } = body;
      const context = getCampaignRAGContext(campaignId);
      if (!context) {
        return NextResponse.json({ success: false, error: "No RAG context found for this campaign" }, { status: 404 });
      }
      const topContext = retrieveRelevantContext(context, query || "what is the price?");
      return NextResponse.json({ success: true, data: { query, topContext } });
    }

    return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}
