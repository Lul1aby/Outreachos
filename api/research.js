import Anthropic from "@anthropic-ai/sdk";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, company, title, industry } = req.body || {};
  if (!company) {
    return res.status(400).json({ error: "Company name is required" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured in environment variables" });
  }

  try {
    const client = new Anthropic({ apiKey });

    const who = name ? `${name}${title ? `, ${title}` : ""}` : "a prospect";
    const ind = industry ? ` (${industry} industry)` : "";

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
      messages: [{
        role: "user",
        content: `I'm preparing for a cold outreach call with ${who} at ${company}${ind}. Research this company for me and give me a concise intelligence brief.

Structure your response with exactly these sections:

**Company Overview**
What they do, size, funding stage, key products/services, approximate revenue if known.

**Recent News & Activity**
Funding rounds, product launches, leadership hires, expansions, awards, press coverage from the last 6-12 months. Be specific with dates and amounts where available.

**Likely Pain Points**
Based on their stage, industry, and recent activity — what challenges are they probably facing right now that I could address?

**Cold Call Hooks**
Give me 2-3 specific, concrete conversation openers I can use. Reference actual recent events or facts about the company — not generic lines.

**Best Approach Angle**
Recommended timing, tone, and angle based on the company's current context.

Be specific, factual, and actionable. Bullets where appropriate. Under 450 words total.`,
      }],
    });

    // Extract all text blocks (Claude writes final response after tool use)
    const brief = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    return res.status(200).json({ brief });
  } catch (err) {
    console.error("[research] error:", err?.message || err);
    return res.status(500).json({ error: err?.message || "Research failed" });
  }
}
