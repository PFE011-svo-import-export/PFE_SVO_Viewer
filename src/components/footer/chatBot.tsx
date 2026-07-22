import { useEffect, useRef, useState } from "react";
import { askQuestionStream } from "../../services/chat";

interface Message {
    role: "user" | "assistant";
    text: string;
}

/**
 * Assistant Q&R sur la legislation import-export.
 *
 * Chaque question est envoyee seule : l'historique affiche ci-dessous sert a
 * l'utilisateur, il n'est jamais renvoye au serveur. Il vit dans ce composant,
 * donc il disparait au rechargement de la page et reste propre a ce navigateur.
 */
function ChatBot() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Garde la derniere reponse visible sans que l'utilisateur ait a scroller.
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isLoading]);

    useEffect(() => {
        if (isOpen) inputRef.current?.focus();
    }, [isOpen]);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();

        const question = input.trim();
        if (!question || isLoading) return;

        // La bulle assistant est créée vide : les morceaux reçus viennent la
        // remplir au fur et à mesure.
        setMessages((previous) => [
            ...previous,
            { role: "user", text: question },
            { role: "assistant", text: "" },
        ]);
        setInput("");
        setError("");
        setIsLoading(true);

        try {
            await askQuestionStream(question, (chunk) => {
                setMessages((previous) => {
                    const next = [...previous];
                    const last = next[next.length - 1];
                    next[next.length - 1] = { ...last, text: last.text + chunk };
                    return next;
                });
            });
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Une erreur est survenue.");
            // Retire la bulle vide si rien n'a été reçu.
            setMessages((previous) => {
                const last = previous[previous.length - 1];
                return last?.role === "assistant" && last.text === ""
                    ? previous.slice(0, -1)
                    : previous;
            });
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) {
        return (
            <div id="chatBot">
                <button
                    type="button"
                    className="chatBotButton"
                    onClick={() => setIsOpen(true)}
                    aria-label="Ouvrir l'assistant"
                >
                    <div className="chatBotTextBox">
                        <div className="chatBotText">Tu as une question?</div>
                        <div className="chatBotTextBoxArrow"></div>
                    </div>
                </button>
            </div>
        );
    }

    return (
        <div id="chatBot">
            <div className="chatBotPanel">
                <div className="chatBotHeader">
                    <span className="chatBotTitle">Assistant legislation</span>
                    <button
                        type="button"
                        className="chatBotClose"
                        onClick={() => setIsOpen(false)}
                        aria-label="Fermer l'assistant"
                    >
                        &times;
                    </button>
                </div>

                <div className="chatBotMessages">
                    {messages.length === 0 && !isLoading && (
                        <div className="chatBotHint">
                            Posez une question sur les exigences d'import-export.
                        </div>
                    )}

                    {messages.map((message, index) => (
                        // La bulle assistant vide en attente du premier morceau
                        // affiche le message de chargement à la place.
                        <div
                            key={index}
                            className={`chatBotMessage chatBotMessage--${message.role}${
                                message.text === "" ? " chatBotPending" : ""
                            }`}
                        >
                            {message.text === "" ? "Recherche en cours…" : message.text}
                        </div>
                    ))}

                    {error && <div className="chatBotError">{error}</div>}

                    <div ref={messagesEndRef} />
                </div>

                <form className="chatBotForm" onSubmit={handleSubmit}>
                    <input
                        ref={inputRef}
                        type="text"
                        className="chatBotInput"
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        placeholder="Votre question…"
                        disabled={isLoading}
                    />
                    <button
                        type="submit"
                        className="chatBotSend"
                        disabled={isLoading || input.trim() === ""}
                    >
                        Envoyer
                    </button>
                </form>
            </div>
        </div>
    );
}

export default ChatBot;
