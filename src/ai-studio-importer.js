/**
 * Google AI Studio Project Importer & Normalizer
 * Imports prompts, system instructions, generation configs, tools, and code exports
 * from Google AI Studio into Antigravity.
 */

export class AIStudioImporter {
  /**
   * Auto-detect format and parse input (JSON, code snippet, or raw text)
   * @param {string|object} rawInput
   * @returns {object} Normalized AI Studio project structure
   */
  static parse(rawInput) {
    if (!rawInput) {
      throw new Error("Empty input provided to AI Studio importer");
    }

    let parsed = null;
    let format = "unknown";

    // If already object
    if (typeof rawInput === "object") {
      parsed = rawInput;
      format = "json";
    } else {
      const trimmed = rawInput.trim();

      // Check if JSON
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          parsed = JSON.parse(trimmed);
          format = "json";
        } catch (e) {
          // Fall through to code/text extraction
        }
      }

      // Check if Python / JS code
      if (!parsed) {
        if (trimmed.includes("google.generativeai") || trimmed.includes("from google import genai") || trimmed.includes("GoogleGenAI")) {
          parsed = this.extractFromCode(trimmed);
          format = "code";
        } else if (trimmed.includes("curl ") || trimmed.includes("generativelanguage.googleapis.com")) {
          parsed = this.extractFromCurl(trimmed);
          format = "curl";
        } else {
          // Treat as raw system prompt / instructions
          parsed = {
            systemInstruction: trimmed,
            contents: [],
            generationConfig: {
              temperature: 0.7,
              topP: 0.95,
              topK: 40,
              maxOutputTokens: 8192
            },
            model: "gemini-2.5-flash"
          };
          format = "text-prompt";
        }
      }
    }

    return this.normalizeProject(parsed, format);
  }

  /**
   * Extract configuration and prompts from Python or JS code snippets
   */
  static extractFromCode(code) {
    const result = {
      systemInstruction: "",
      contents: [],
      generationConfig: {},
      model: "gemini-2.5-flash"
    };

    // Extract model name
    const modelMatch = code.match(/model\s*=\s*['"]([^'"]+)['"]/i) || code.match(/models\/([^'"]+)/i);
    if (modelMatch) {
      result.model = modelMatch[1];
    }

    // Extract system instruction
    const sysMatch = code.match(/system_instruction\s*=\s*(?:f?['"]{3}([\s\S]*?)['"]{3}|['"]([^'"]+)['"])/i) ||
                     code.match(/systemInstruction:\s*(?:['"`]([\s\S]*?)['"`])/i);
    if (sysMatch) {
      result.systemInstruction = (sysMatch[1] || sysMatch[2] || "").trim();
    }

    // Extract temperature
    const tempMatch = code.match(/temperature\s*[:=]\s*([0-9.]+)/i);
    if (tempMatch) {
      result.generationConfig.temperature = parseFloat(tempMatch[1]);
    }

    // Extract top_p
    const topPMatch = code.match(/top_p\s*[:=]\s*([0-9.]+)/i);
    if (topPMatch) {
      result.generationConfig.topP = parseFloat(topPMatch[1]);
    }

    // Extract prompt contents
    const promptMatch = code.match(/prompt\s*=\s*(?:f?['"]{3}([\s\S]*?)['"]{3}|['"]([^'"]+)['"])/i) ||
                        code.match(/generate_content\((?:['"`]([\s\S]*?)['"`])\)/i);
    if (promptMatch) {
      const userPrompt = (promptMatch[1] || promptMatch[2] || "").trim();
      if (userPrompt) {
        result.contents.push({
          role: "user",
          parts: [{ text: userPrompt }]
        });
      }
    }

    return result;
  }

  /**
   * Extract configuration from cURL command
   */
  static extractFromCurl(curlCmd) {
    const modelMatch = curlCmd.match(/models\/([^:/?]+)/);
    const model = modelMatch ? modelMatch[1] : "gemini-2.5-flash";

    const jsonMatch = curlCmd.match(/-d\s*'(.*?)'\s*(?:\\|$)/s) || curlCmd.match(/-d\s*"(.*?)"\s*(?:\\|$)/s);
    if (jsonMatch) {
      try {
        const body = JSON.parse(jsonMatch[1]);
        body.model = model;
        return body;
      } catch (e) {
        // Ignored
      }
    }

    return {
      model,
      systemInstruction: "Imported from cURL request",
      contents: [],
      generationConfig: { temperature: 0.7 }
    };
  }

  /**
   * Normalize an AI Studio project into unified Antigravity representation
   */
  static normalizeProject(raw, detectedFormat = "json") {
    // 1. Normalize system instruction
    let systemInstruction = "";
    if (typeof raw.systemInstruction === "string") {
      systemInstruction = raw.systemInstruction;
    } else if (raw.systemInstruction && Array.isArray(raw.systemInstruction.parts)) {
      systemInstruction = raw.systemInstruction.parts.map(p => p.text || "").join("\n");
    } else if (raw.system_instruction) {
      if (typeof raw.system_instruction === "string") {
        systemInstruction = raw.system_instruction;
      } else if (raw.system_instruction.parts) {
        systemInstruction = raw.system_instruction.parts.map(p => p.text || "").join("\n");
      }
    }

    // 2. Normalize contents / messages
    let contents = [];
    const sourceContents = raw.contents || raw.messages || [];
    if (Array.isArray(sourceContents)) {
      contents = sourceContents.map(item => {
        let role = item.role || "user";
        if (role === "assistant") role = "model";
        let parts = item.parts;
        if (!parts && item.content) {
          parts = [{ text: item.content }];
        } else if (!parts && item.text) {
          parts = [{ text: item.text }];
        }
        return { role, parts: parts || [{ text: "" }] };
      });
    }

    // 3. Normalize generation config
    const gen = raw.generationConfig || raw.generation_config || {};
    const generationConfig = {
      temperature: typeof gen.temperature === "number" ? gen.temperature : 0.7,
      topP: typeof gen.topP === "number" ? gen.topP : (typeof gen.top_p === "number" ? gen.top_p : 0.95),
      topK: typeof gen.topK === "number" ? gen.topK : (typeof gen.top_k === "number" ? gen.top_k : 40),
      maxOutputTokens: gen.maxOutputTokens || gen.max_output_tokens || 8192,
      responseMimeType: gen.responseMimeType || gen.response_mime_type || "text/plain",
      responseSchema: gen.responseSchema || gen.response_schema || null
    };

    // 4. Normalize model name (updating legacy models to recommended Gemini models)
    let model = raw.model || "gemini-2.5-flash";
    if (model.startsWith("models/")) {
      model = model.replace("models/", "");
    }
    // Auto-upgrade deprecated versions
    if (model.includes("gemini-1.0") || model.includes("text-bison") || model.includes("chat-bison")) {
      model = "gemini-2.5-flash";
    }

    // 5. Tools & Function Declarations
    let tools = raw.tools || [];
    if (!Array.isArray(tools)) {
      tools = [tools];
    }

    // 6. Safety Settings
    let safetySettings = raw.safetySettings || raw.safety_settings || [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
    ];

    return {
      id: raw.id || `proj_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: raw.name || raw.title || "Imported AI Studio Project",
      detectedFormat,
      importedAt: new Date().toISOString(),
      model,
      systemInstruction: systemInstruction.trim(),
      contents,
      generationConfig,
      tools,
      safetySettings,
      metadata: {
        totalTurns: contents.length,
        hasSystemInstruction: Boolean(systemInstruction.trim()),
        hasTools: tools.length > 0,
        hasSchema: Boolean(generationConfig.responseSchema)
      }
    };
  }

  /**
   * Export normalized project to executable Node.js / Google GenAI SDK code
   */
  static toNodeCode(project) {
    return `import { GoogleGenAI } from '@google/genai';

// Initialize the Google Gen AI client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

export async function runModel(userPrompt, dynamicContext = {}) {
  const response = await ai.models.generateContent({
    model: ${JSON.stringify(project.model)},
    contents: [
      { role: 'user', parts: [{ text: userPrompt }] }
    ],
    config: {
      systemInstruction: ${JSON.stringify(project.systemInstruction || 'You are an intelligent assistant.')},
      temperature: ${project.generationConfig.temperature},
      topP: ${project.generationConfig.topP},
      topK: ${project.generationConfig.topK},
      maxOutputTokens: ${project.generationConfig.maxOutputTokens},
      ${project.generationConfig.responseMimeType !== 'text/plain' ? `responseMimeType: ${JSON.stringify(project.generationConfig.responseMimeType)},` : ''}
    }
  });

  return response.text;
}
`;
  }

  /**
   * Export normalized project to executable Python / Google GenAI SDK code
   */
  static toPythonCode(project) {
    return `import os
from google import genai
from google.genai import types

client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

def run_model(user_prompt: str, dynamic_context: dict = None) -> str:
    config = types.GenerateContentConfig(
        system_instruction=${JSON.stringify(project.systemInstruction || "You are an intelligent assistant.")},
        temperature=${project.generationConfig.temperature},
        top_p=${project.generationConfig.topP},
        top_k=${project.generationConfig.topK},
        max_output_tokens=${project.generationConfig.maxOutputTokens},
    )

    response = client.models.generate_content(
        model=${JSON.stringify(project.model)},
        contents=user_prompt,
        config=config,
    )
    return response.text

if __name__ == "__main__":
    result = run_model("Test prompt")
    print(result)
`;
  }
}
