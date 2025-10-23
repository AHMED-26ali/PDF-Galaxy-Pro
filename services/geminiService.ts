
import { GoogleGenAI, Modality } from "@google/genai";

// Ensure API_KEY is available in the environment
const apiKey = process.env.API_KEY;
if (!apiKey) {
    console.error("API_KEY environment variable not set.");
}
const ai = new GoogleGenAI({ apiKey: apiKey! });

const fileToBase64 = (file: File): Promise<string> => {
    return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
    });
};

/**
 * Converts a File object to a GoogleGenAI.Part object for multimodal prompting.
 * @param file The file to convert.
 * @returns A promise that resolves to a Part object.
 */
const fileToGenerativePart = async (file: File) => {
    const base64EncodedData = await fileToBase64(file);
    return {
        inlineData: {
            data: base64EncodedData,
            mimeType: file.type,
        },
    };
};


/**
 * Creates a Word-compatible HTML document string.
 * This structure includes specific XML namespaces and CSS that Microsoft Word
 * recognizes, ensuring proper rendering of RTL text and document structure.
 * @param content The HTML content for the body of the document.
 * @returns A full HTML string formatted for Microsoft Word.
 */
const createWordHtmlTemplate = (content: string): string => `
<html xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8">
<meta name=ProgId content=Word.Document>
<meta name=Generator content="PDF Galaxy Pro">
<title>Converted Document</title>
<style>
<!--
@page WordSection1 {
    size: 8.5in 11.0in;
    margin: 1.0in 1.0in 1.0in 1.0in;
}
div.WordSection1 {
    page: WordSection1;
}
body {
    direction: rtl;
    font-family: "Arial", sans-serif;
    font-size: 12pt;
}
p {
    margin: 0 0 10pt 0;
}
h1, h2, h3, h4, h5, h6 {
    font-family: "Arial", sans-serif;
    font-weight: bold;
}
-->
</style>
</head>
<body lang="AR-SA">
<div class="WordSection1">
${content}
</div>
</body>
</html>
`;


export const convertTextToHtml = async (text: string): Promise<string> => {
    if (!apiKey) {
        throw new Error("API Key for Gemini is not configured.");
    }
    
    try {
        const prompt = `
        قم بتنسيق النص التالي إلى HTML أساسي. استخدم علامات دلالية مثل <h1> و <h2> و <p> و <strong> لتنظيم المحتوى.
        لا تقم بتضمين علامات <html> أو <head> أو <body>. يجب أن يكون الإخراج فقط هو المحتوى الذي يوضع داخل وسم <body>.
        النص باللغة العربية، لذا حافظ على بنيته.
        النص المراد تنسيقه هو:
        \n\n${text}`;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                // Set temperature to 0.2 for more deterministic and structured output
                temperature: 0.2,
            }
        });

        let bodyContent = response.text.trim();
        
        // Clean up potential markdown code block fences from the response
        bodyContent = bodyContent.replace(/^```html\n?/, '').replace(/\n?```$/, '');
        
        // Inject the formatted content into our Word-compatible template
        const fullHtml = createWordHtmlTemplate(bodyContent);
        
        return fullHtml;

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        throw new Error("Failed to convert text to HTML using Gemini API.");
    }
};

export const getChatResponse = async (message: string): Promise<string> => {
    if (!apiKey) {
        throw new Error("API Key for Gemini is not configured.");
    }

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ parts: [{ text: message }] }],
        });

        return response.text.trim();
    } catch (error) {
        console.error("Error calling Gemini API for chat:", error);
        throw new Error("Failed to get a response from the AI assistant.");
    }
};

export const analyzeImage = async (prompt: string, imageFile: File): Promise<string> => {
    if (!apiKey) throw new Error("API Key for Gemini is not configured.");
    
    const imagePart = await fileToGenerativePart(imageFile);
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [{ text: prompt }, imagePart] },
    });
    return response.text;
};

export const generateImage = async (prompt: string): Promise<string> => {
    if (!apiKey) throw new Error("API Key for Gemini is not configured.");
    
    const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: prompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
        },
    });

    const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
    return `data:image/jpeg;base64,${base64ImageBytes}`;
};

export const editImage = async (prompt: string, imageFile: File): Promise<string> => {
    if (!apiKey) throw new Error("API Key for Gemini is not configured.");
    
    const imagePart = await fileToGenerativePart(imageFile);
    const textPart = { text: prompt };

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [imagePart, textPart] },
        config: {
            responseModalities: [Modality.IMAGE],
        },
    });

    for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
            const base64ImageBytes: string = part.inlineData.data;
            return `data:${part.inlineData.mimeType};base64,${base64ImageBytes}`;
        }
    }
    throw new Error("No image was generated by the model.");
};

export const generateVideo = async (prompt: string, imageFile: File | null, aspectRatio: '16:9' | '9:16') => {
    // Veo requires a new instance to get the latest user-selected key
    const localAi = new GoogleGenAI({ apiKey: process.env.API_KEY! });

    try {
        const payload: any = {
            model: 'veo-3.1-fast-generate-preview',
            prompt,
            config: {
                numberOfVideos: 1,
                resolution: '720p',
                aspectRatio: aspectRatio
            }
        };

        if (imageFile) {
            payload.image = {
                imageBytes: await fileToBase64(imageFile),
                mimeType: imageFile.type,
            };
        }
        
        return await localAi.models.generateVideos(payload);

    } catch (error: any) {
        console.error("Error calling Veo API:", error);
        if (error.message.includes('Requested entity was not found')) {
            throw new Error("API key/project error: Please select a valid API key for a project with billing enabled.");
        }
        throw new Error("Failed to start video generation.");
    }
};

export const pollVideoOperation = async (operation: any) => {
    // Veo requires a new instance to get the latest user-selected key
    const localAi = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    try {
        return await localAi.operations.getVideosOperation({ operation: operation });
    } catch (error: any) {
        console.error("Error polling Veo operation:", error);
        if (error.message.includes('Requested entity was not found')) {
            throw new Error("API key/project error: Please select a valid API key for a project with billing enabled.");
        }
        throw new Error("Failed to get video generation status.");
    }
};