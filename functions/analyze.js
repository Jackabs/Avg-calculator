// functions/analyze.js
const fetch = require("node-fetch");
const OpenAI = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

exports.handler = async (event) => {
  try {
    const {
      oldAvg,
      oldQty,
      newPrice,
      mode,
      targetAvg,
      newQty,
      asset,
    } = JSON.parse(event.body);

    // 1) Calculator logic
    let suggestionCalc;
    if (mode === "target") {
      const x =
        (targetAvg * oldQty - oldAvg * oldQty) /
        (newPrice - targetAvg);
      suggestionCalc =
        x > 0
          ? `Buy ${Math.ceil(x)} units to hit ₹${targetAvg.toFixed(
              2
            )} avg.`
          : "Target avg already met or not reachable.";
    } else {
      const totalCost = oldAvg * oldQty + newPrice * newQty;
      const totalQty = oldQty + newQty;
      const newAvg = totalCost / totalQty;
      suggestionCalc = `New avg cost → ₹${newAvg.toFixed(
        2
      )} (Total Qty: ${totalQty})`;
    }

    // 2) Fetch real-time spot price from Alpha Vantage
    const symbol = asset === "gold" ? "XAU" : "XAG";
    const alphaRes = await fetch(
      `https://www.alphavantage.co/query?function=COMMODITY_EXCHANGE_RATE&from_symbol=${symbol}&to_symbol=INR&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`
    );
    const alphaData = await alphaRes.json();
    const spotPrice = parseFloat(
      alphaData["Realtime Commodity Exchange Rate"]["5. Exchange Rate"]
    );

    // 3) Build AI prompt
    const prompt = `
You are a financial analyst. Current ${asset.toUpperCase()} spot price in INR is ₹${spotPrice}.
The user wants to ${
      mode === "target"
        ? `achieve an overall avg of ₹${targetAvg.toFixed(2)} for their position.`
        : `calculate new avg after buying ${newQty} units at ₹${newPrice}.`
    }
Considering global market trends and geopolitical factors, advise if this is a good range to buy a ${asset.toUpperCase()} ETF now, and why.
`;

    // 4) Call OpenAI
    const chat = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful financial analyst." },
        { role: "user", content: prompt },
      ],
    });
    const rationale = chat.choices[0].message.content.trim();

    // 5) Return both suggestion and rationale
    return {
      statusCode: 200,
      body: JSON.stringify({ suggestion: suggestionCalc, rationale }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
