/**
 * Local AI Mood Detector (Fixed & Optimized)
 * Analyzes last few messages for sentiment in English, Hinglish, Tenglish.
 */

const MOOD_KEYWORDS = {
    happy: [
        'happy', 'great', 'awesome', 'amazing', 'good', 'love', 'nice', 'wow', 'haha', 'lol', 'lmao',
        'mast', 'badhiya', 'sahi', 'super', 'bagundhi', 'kekka', 'adhirindhi', 'keka', 'manchi',
        'enjoy', 'party', 'fun', 'congrats', 'mubarak', 'subhakankshalu', 'cool', '😊', '😂', '🤣', '❤️', '💖'
    ],
    sad: [
        'sad', 'upset', 'bad', 'crying', 'cry', 'alone', 'hurt', 'pain', 'sorry', 'miss', 'broken',
        'dukhi', 'parishan', 'rondu', 'kastam', 'badhaga', 'baadha', 'dipper', 'tension', 'stress',
        'feeling low', 'disappointed', '😔', '😭', '😢', '💔', '😿'
    ],
    angry: [
        'angry', 'hate', 'shut up', 'stop', 'mad', 'stupid', 'idiot', 'annoyed', 'pissed',
        'gussa', 'dimag kharab', 'pagal', 'kopam', 'chi', 'enough', 'useless', 'fool',
        'why', 'wtf', 'hell', 'nonsense', 'seriously', '😡', '😠', '🤬', '👊', '😤',
        'dont want to talk', 'no more', 'leave me', 'go away', 'dont talk'
    ]
};

const MOOD_META = {
    happy: { emoji: '😊', text: 'Conversation feels positive.' },
    sad: { emoji: '😔', text: 'They seem upset. Try replying calmly.' },
    angry: { emoji: '😡', text: 'Mood is tense. Stay patient.' },
    neutral: { emoji: '😐', text: 'Analyze subtle hints...' }
};

export const detectMood = (messages) => {
    if (!messages || messages.length === 0) return null;

    // Capture last 5 text messages
    const textMessages = messages
        .filter(m => m.type === 'text' && m.text)
        .slice(-5);

    if (textMessages.length === 0) return null;

    let scores = { happy: 0, sad: 0, angry: 0 };

    /**
     * Recency Weighting:
     * We iterate through the last 5 messages.
     * The most recent message (last in array) gets the highest multiplier.
     */
    textMessages.forEach((msg, index) => {
        const text = msg.text.toLowerCase();
        // Weight multiplier: 1.0 for oldest, up to ~2.0 for newest in a slice of 5
        const weight = 1 + (index / textMessages.length);

        Object.keys(MOOD_KEYWORDS).forEach(mood => {
            MOOD_KEYWORDS[mood].forEach(keyword => {
                if (text.includes(keyword)) {
                    // Match found! Apply weighted score
                    scores[mood] += (1 * weight);
                }
            });
        });
    });


    let dominant = 'neutral';
    let maxScore = 0;

    Object.keys(scores).forEach(mood => {
        if (scores[mood] > maxScore) {
            maxScore = scores[mood];
            dominant = mood;
        }
    });

    // Threshold logic: must have at least some signal
    if (maxScore < 0.5) return MOOD_META.neutral;

    return MOOD_META[dominant];
};
