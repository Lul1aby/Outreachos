import Anthropic from "@anthropic-ai/sdk";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { company, industry } = req.body || {};
  if (!company) {
    return res.status(400).json({ error: "Company name is required" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured" });
  }

  try {
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
      messages: [{
        role: "user",
        content: `Search for open job postings at ${company}${industry ? ` (${industry})` : ""}. Check their careers page, LinkedIn Jobs, Indeed, and any job boards.

Return a hiring intelligence brief structured as:

**Currently Hiring** (list all open roles you find, grouped by department)
For each role include: job title, department/team, and any key requirements mentioned.

**Engineering & Tech Roles**
List specifically any engineering, product, data, or technical roles open right now.

**Hiring Signals**
What does their hiring activity tell us? Are they scaling a specific team? Building new products? Expanding into new markets? Replacing churn?

**Sales Conversation Angle**
Based on what they're hiring for, what pain points or initiatives can I reference in my cold outreach? Give me 1-2 specific openers.

If you can't find current open roles, note that and provide any recent hiring news instead (layoffs, expansions, leadership hires).

Be specific. Include actual job titles, not generalities.`,
      }],
    });

    const brief = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    return res.status(200).json({ brief });
  } catch (err) {
    console.error("[hiring] error:", err?.message || err);
    return res.status(500).json({ error: err?.message || "Hiring lookup failed" });
  }
}
