
import React, { useState, useEffect, useRef } from 'react';
import { getChatResponse } from '../services/geminiService';
import { ChatBubbleLeftRightIcon, PaperAirplaneIcon, XMarkIcon } from './icons';
import LoadingSpinner from './LoadingSpinner';

interface Message {
    sender: 'user' | 'bot';
    text: string;
}

const Chatbot: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        { sender: 'bot', text: 'مرحباً! أنا مساعدك الآلي في PDF Galaxy. كيف يمكنني مساعدتك اليوم؟' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(scrollToBottom, [messages]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (input.trim() === '' || isLoading) return;

        const userMessage: Message = { sender: 'user', text: input.trim() };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const responseText = await getChatResponse(userMessage.text);
            const botMessage: Message = { sender: 'bot', text: responseText };
            setMessages(prev => [...prev, botMessage]);
        } catch (error) {
            const errorMessage: Message = { sender: 'bot', text: 'عذراً، حدث خطأ أثناء الاتصال بالمساعد. يرجى المحاولة مرة أخرى.' };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed bottom-8 right-8 z-50">
            {isOpen && (
                <div className="animate-fade-in-up absolute bottom-20 right-0 w-96 h-[60vh] bg-slate-900/50 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl flex flex-col">
                    {/* Header */}
                    <div className="flex justify-between items-center p-4 border-b border-slate-800">
                        <h3 className="text-lg font-bold">المساعد الآلي</h3>
                        <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-slate-700 rounded-full">
                            <XMarkIcon className="w-6 h-6" />
                        </button>
                    </div>
                    {/* Messages */}
                    <div className="flex-1 p-4 overflow-y-auto space-y-4">
                        {messages.map((msg, index) => (
                            <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-start' : 'justify-end'}`}>
                                <div className={`max-w-[80%] p-3 rounded-2xl ${msg.sender === 'user' ? 'bg-blue-600 rounded-br-none' : 'bg-slate-700 rounded-bl-none'}`}>
                                    <p className="text-white whitespace-pre-wrap">{msg.text}</p>
                                </div>
                            </div>
                        ))}
                         {isLoading && (
                            <div className="flex justify-end">
                                <div className="bg-slate-700 p-3 rounded-2xl rounded-bl-none inline-flex items-center space-x-2">
                                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse"></div>
                                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse delay-200"></div>
                                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse delay-400"></div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                    {/* Input */}
                    <div className="p-4 border-t border-slate-800">
                        <form onSubmit={handleSend} className="flex items-center gap-2">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="اسأل أي شيء..."
                                className="flex-1 bg-slate-800 border border-slate-700 rounded-full py-2 px-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                disabled={isLoading}
                            />
                            <button
                                type="submit"
                                disabled={isLoading || input.trim() === ''}
                                className="bg-blue-600 p-3 rounded-full hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors"
                            >
                                <PaperAirplaneIcon className="w-5 h-5 text-white" />
                            </button>
                        </form>
                    </div>
                </div>
            )}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full shadow-lg hover:scale-110 transition-transform flex items-center justify-center"
            >
                <ChatBubbleLeftRightIcon className="w-8 h-8 text-white" />
            </button>
        </div>
    );
};

export default Chatbot;