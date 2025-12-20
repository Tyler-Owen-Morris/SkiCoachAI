import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR 
});

export async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<{ text: string }> {
  try {
    // Create a file-like object from the buffer
    const file = new File([audioBuffer], "audio.webm", { type: mimeType });
    
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: "whisper-1",
    });

    return {
      text: transcription.text,
    };
  } catch (error) {
    console.error("Error transcribing audio:", error);
    throw new Error("Failed to transcribe audio: " + error.message);
  }
}

export async function generateSummary(notes: string[]): Promise<{ summary: string }> {
  try {
    if (notes.length === 0) {
      throw new Error("No notes provided for summarization");
    }

    const notesText = notes.join("\n\n");
    const prompt = `You are an expert ski instructor assistant. Please analyze these coaching notes for a skier and create a comprehensive, professional summary that highlights:

1. Overall progress and strengths
2. Areas that need improvement
3. Specific technical skills mentioned
4. Recommended focus areas for future sessions

Here are the coaching notes:

${notesText}

Please provide a concise summary in bullet point format that would be useful for both the coach and potentially the skier. Focus on consolidating the coaching notes so that they are most effective for the coach to recall their overall intent.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a professional ski instruction assistant. Provide clear, constructive, and actionable summaries of coaching notes."
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const summary = response.choices[0]?.message?.content;
    if (!summary) {
      throw new Error("No summary generated");
    }

    return { summary };
  } catch (error) {
    console.error("Error generating summary:", error);
    throw new Error("Failed to generate summary: " + error.message);
  }
}
