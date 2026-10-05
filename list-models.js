const key = process.env.GEMINI_API_KEY;
console.log("Current key format:", key?.slice(0, 10) + "...");
console.log("Expected format: AIzaSy...");
console.log("\nValid Gemini models for v1beta:");
console.log("- gemini-1.5-flash");
console.log("- gemini-1.5-pro");
console.log("- gemini-2.0-flash-exp (experimental)");
