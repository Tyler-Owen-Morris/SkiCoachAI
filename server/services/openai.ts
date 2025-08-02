import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY
}) : null;

export async function transcribeAudio(audioBuffer: Buffer): Promise<{ text: string }> {
  if (!openai) {
    throw new Error("OpenAI API key not configured. Please provide an API key to use transcription features.");
  }
  
  try {
    const transcription = await openai.audio.transcriptions.create({
      file: new File([audioBuffer], "audio.webm", { type: "audio/webm" }),
      model: "whisper-1",
    });

    return {
      text: transcription.text,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new Error("Failed to transcribe audio: " + errorMessage);
  }
}

export async function generateSummary(notes: string[]): Promise<{ summary: string }> {
  if (!openai) {
    throw new Error("OpenAI API key not configured. Please provide an API key to use AI summary features.");
  }
  
  try {
    const notesText = notes.join('\n\n');
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert ski instructor assistant. Generate a concise, professional summary of a skier's progress and areas for improvement based on the coaching notes provided. The summary should:
          1. Highlight key strengths and improvements
          2. Identify specific areas that need work
          3. Suggest next steps for training
          4. Be written in a clear, actionable format for coaches
          5. Be approximately 100-150 words`
        },
        {
          role: "user",
          content: `Please summarize these coaching notes into a coherent paragraph:\n\n${notesText}`
        }
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    return {
      summary: response.choices[0].message.content || "Unable to generate summary",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new Error("Failed to generate summary: " + errorMessage);
  }
}
