export type AIProviderId = "groq" | "openrouter" | "nvidia" | "gemini";

export interface AIProviderConfig {
  id: AIProviderId;
  name: string;
  defaultModel: string;
  availableModels: { id: string; name: string; description?: string }[];
  baseUrl: string;
  docsUrl: string;
  apiKeyEnvName: string;
  freeTierNote: string;
}

export const SUPPORTED_AI_PROVIDERS: Record<AIProviderId, AIProviderConfig> = {
  groq: {
    id: "groq",
    name: "Groq Cloud (Free/Open)",
    defaultModel: "llama-3.3-70b-versatile",
    baseUrl: "https://api.groq.com/openai/v1",
    docsUrl: "https://console.groq.com/keys",
    apiKeyEnvName: "GROQ_API_KEY",
    freeTierNote: "Extremely fast inference, generous free tier for Llama 3.3 and 3.1 models.",
    availableModels: [
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B Versatile", description: "Top quality open weights, high intelligence" },
      { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B Instant", description: "Ultra-fast response for instant spam & intent checks" },
      { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B", description: "Long context multi-turn understanding" },
    ],
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter (Free Tier & Multi-Model)",
    defaultModel: "meta-llama/llama-3.2-3b-instruct:free",
    baseUrl: "https://openrouter.ai/api/v1",
    docsUrl: "https://openrouter.ai/keys",
    apiKeyEnvName: "OPENROUTER_API_KEY",
    freeTierNote: "Access 100% free models (:free suffix) including Llama, DeepSeek, and Mistral.",
    availableModels: [
      { id: "meta-llama/llama-3.2-3b-instruct:free", name: "Llama 3.2 3B (Free)", description: "100% free rate limit tier for auto-replying" },
      { id: "mistralai/mistral-small-24b-instruct-2501:free", name: "Mistral Small 24B (Free)", description: "Capable European open model with free tier" },
      { id: "deepseek/deepseek-r1:free", name: "DeepSeek R1 (Free)", description: "High-reasoning model for complex queries" },
      { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct", description: "Standard pay-as-you-go or free promo" },
    ],
  },
  nvidia: {
    id: "nvidia",
    name: "NVIDIA NIM (Free Credits / Open)",
    defaultModel: "meta/llama-3.1-70b-instruct",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    docsUrl: "https://build.nvidia.com/explore/discover",
    apiKeyEnvName: "NVIDIA_API_KEY",
    freeTierNote: "1,000 free API credits on signup for enterprise-hosted open models.",
    availableModels: [
      { id: "meta/llama-3.1-70b-instruct", name: "Llama 3.1 70B Instruct", description: "NVIDIA TensorRT optimized performance" },
      { id: "meta/llama-3.1-8b-instruct", name: "Llama 3.1 8B Instruct", description: "Fast lightweight execution" },
      { id: "nvidia/nemotron-4-340b-instruct", name: "Nemotron 4 340B", description: "Deep context comprehension" },
    ],
  },
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    defaultModel: "gemini-2.5-flash",
    baseUrl: "https://generativelanguage.googleapis.com",
    docsUrl: "https://aistudio.google.com/app/apikey",
    apiKeyEnvName: "GEMINI_API_KEY",
    freeTierNote: "Built-in server key support with fast multi-modal context.",
    availableModels: [
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", description: "Recommended: low-latency, multi-lingual, high accuracy" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", description: "Maximum reasoning depth for RAG synthesis" },
    ],
  },
};

export interface WorkspaceAISettings {
  provider: AIProviderId;
  model: string;
  apiKey?: string; // Optional if configured via env
  groqApiKey?: string;
  openrouterApiKey?: string;
  nvidiaApiKey?: string;
  geminiApiKey?: string;
  defaultBrandTone: string;
  enableSpamFilter: boolean;
  enableHumanizedDelay: boolean;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  autoEscalateUnsure: boolean;
  escalationNotice: string;
}

export const DEFAULT_AI_SETTINGS: WorkspaceAISettings = {
  provider: "groq",
  model: "llama-3.3-70b-versatile",
  defaultBrandTone: "Friendly, direct, genuine, concise, and helpful creator tone. No robotic spam phrases.",
  enableSpamFilter: true,
  enableHumanizedDelay: true,
  minDelaySeconds: 8,
  maxDelaySeconds: 25,
  autoEscalateUnsure: true,
  escalationNotice: "I've passed your question over to our team! A member will review this and message you directly here shortly.",
};
