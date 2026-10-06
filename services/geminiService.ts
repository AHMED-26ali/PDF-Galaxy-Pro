/**
 * Client service for calling server-side Gemini API endpoints.
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
    try {
        const response = await fetch('/api/gemini/convert-text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `Server responded with status ${response.status}`);
        }

        const data = await response.json();
        const fullHtml = createWordHtmlTemplate(data.html || text);
        return fullHtml;
    } catch (error) {
        console.error("Error calling convert-text API:", error);
        if (error instanceof Error) {
            throw error;
        }
        throw new Error(`Failed to convert text to HTML using AI. Reason: ${String(error)}`);
    }
};

export const getChatResponse = async (message: string): Promise<string> => {
    try {
        const response = await fetch('/api/gemini/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message }),
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `Server responded with status ${response.status}`);
        }

        const data = await response.json();
        return data.text || '';
    } catch (error) {
        console.error("Error calling chat API:", error);
        if (error instanceof Error) {
            throw error;
        }
        throw new Error(`Failed to get a response from the AI assistant. Reason: ${String(error)}`);
    }
};
