import Anthropic from "@anthropic-ai/sdk";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { name, company, title, industry, email, linkedin } = req.body || {};
  if (!name && !company) {
    return res.status(400).json({ error: "Name or company is required" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured" });

  try {
    const client = new Anthropic({ apiKey });

    const who = name || "Unknown";
    const comp = company || "Unknown company";
    const extra = [
      title ? `Title: ${title}` : null,
      industry ? `Industry: ${industry}` : null,
      email ? `Email: ${email}` : null,
      linkedin ? `LinkedIn: ${linkedin}` : null,
    ].filter(Boolean).join(", ");

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 8 }],
      messages: [{
        role: "user",
        content: `I need to enrich this prospect's data for sales outreach. Search the web and find as much information as possible.

Prospect: ${who} at ${comp}
${extra ? `Known info: ${extra}` : ""}

Return a JSON object with ONLY the fields you can confidently find. Do not guess or make up data. Use this exact JSON format:

\`\`\`json
{
  "title": "Their current job title",
  "email": "Their work email if publicly available",
  "phone": "Their work phone if publicly available",
  "linkedin": "Their LinkedIn profile URL",
  "companySize": "e.g. 50-200, 1000+",
  "companyRevenue": "e.g. $10M-50M",
  "companyFunding": "e.g. Series B, $50M raised",
  "companyWebsite": "e.g. https://example.com",
  "technologies": ["tech1", "tech2"],
  "recentNews": "One sentence about most relevant recent news",
  "personalNote": "One sentence about something personal/professional you found (university, interests, recent post)"
}
\`\`\`

IMPORTANT: Only include fields where you found real data. Omit fields you cannot verify. Return ONLY the JSON block, no other text.`,
      }],
    });

    // Extract text from response
    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    // Parse JSON from the response
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
    let enriched = {};
    if (jsonMatch) {
      try {
        enriched = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      } catch {
        // If JSON parsing fails, return the raw text as a brief
        return res.status(200).json({ enriched: {}, brief: text });
      }
    }

    return res.status(200).json({ enriched });
  } catch (err) {
    console.error("[enrich] error:", err?.message || err);
    return res.status(500).json({ error: err?.message || "Enrichment failed" });
  }
}
