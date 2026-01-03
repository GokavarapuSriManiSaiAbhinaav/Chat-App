/**
 * Local AI Mood Detector (Enhanced)
 * Supports expanded mood categories, confidence scoring, and sliding window context.
 * Analyzes last 5-10 messages for Sentiment Analysis in English, Hinglish, Tenglish.
 */

const MOOD_KEYWORDS = {
    happy: [
        'happy', 'great', 'awesome', 'amazing', 'good', 'love', 'nice', 'wow', 'haha', 'lol', 'lmao',
        'mast', 'badhiya', 'sahi', 'super', 'bagundhi', 'kekka', 'adhirindhi', 'keka', 'manchi',
        'enjoy', 'party', 'fun', 'congrats', 'mubarak', 'subhakankshalu', 'cool', '😊', '😂', '🤣', '💖',
        'glad', 'cheerful', 'delighted', 'pleased', 'yaay', 'yippee',
        // Telugu/Tenglish
        'kirrak', 'thop', 'arachakam', 'santhosham', 'navvu', 'super ra', 'kummesavu', 'chinchavu', 'baga',
        'santhoshamga'
    ],
    sad: [
        'sad', 'upset', 'bad', 'crying', 'cry', 'alone', 'hurt', 'pain', 'sorry', 'miss', 'broken',
        'dukhi', 'parishan', 'rondu', 'kastam', 'badhaga', 'baadha', 'dipper', 'tension', 'stress',
        'feeling low', 'disappointed', '😔', '😭', '😢', '💔', '😿', 'gloomy', 'depressed', 'unhappy',
        'grief', 'tragic', 'loss',
        // Telugu/Tenglish
        'ayyo', 'shit', 'edupu', 'noddu', 'vaddhu', 'karim', 'mood ledu', 'poyi', 'ontari'
    ],
    angry: [
        'angry', 'hate', 'shut up', 'stop', 'mad', 'stupid', 'idiot', 'annoyed', 'pissed',
        'gussa', 'dimag kharab', 'pagal', 'kopam', 'chi', 'enough', 'useless', 'fool',
        'why', 'wtf', 'hell', 'nonsense', 'seriously', '😡', '😠', '🤬', '👊', '😤',
        'dont want to talk', 'no more', 'leave me', 'go away', 'irritating', 'nonsense', 'rubbish',
        // Telugu/Tenglish
        'musuko', 'chi', 'dengey', 'waste', 'yedava', 'donga', 'pichi', 'thikka', 'mental', 'burra'
    ],
    excited: [
        'excited', 'cant wait', 'omg', 'eager', 'pumped', 'hyped', 'thrilled', 'woah', 'yesss',
        'hurray', 'boom', 'crazy', 'fantastic', 'fabulous', '🤩', '🥳', '🎉', '🔥', '⚡',
        'waiting', 'dying to see', 'lets go', 'bring it on',
        // Telugu/Tenglish
        'vammo', 'abbo', 'suprrrr', 'wait chestunna', 'mass', 'racha'
    ],
    romantic: [
        'love you', 'miss you', 'darling', 'honey', 'baby', 'babe', 'sweetheart', 'jaan', 'dear',
        'kiss', 'heart', 'romance', 'passionate', 'cute', 'beautiful', 'handsome', 'sexy', 'hot',
        '😍', '😘', '🥰', '💕', '💞', '💘', 'marry', 'date', 'forever',
        // Telugu/Tenglish
        'prema', 'priyatama', 'bangaram', 'bujji', 'chitti', 'kanna', 'pranam', 'muddu', 'miss autunna', 'naa pranam'
    ],
    calm: [
        'calm', 'relax', 'chill', 'peace', 'peaceful', 'serene', 'quiet', 'meditate', 'zen',
        'okay', 'fine', 'no problem', 'all good', 'cool', 'steady', 'balanced', '😌', '🕊️',
        'relaxed', 'easy', 'smooth',
        // Telugu/Tenglish
        'prashantham', 'cool', 'haayi', 'nemmadhi', 'shanthi', 'taggindi'
    ],
    confused: [
        'confused', 'what', 'huh', 'why', 'how', 'weird', 'strange', '?', '??', 'idk', 'dunno',
        'baffled', 'lost', 'clear', 'uncertain', 'not sure', 'doubt', 'puzzled', '🤔', '😕', '🧐',
        // Telugu/Tenglish
        'enti', 'yenti', 'ardham kaale', 'confusion', 'emto', 'emi', 'enduku'
    ],
    serious: [
        'serious', 'listen', 'important', 'urgent', 'matter', 'discuss', 'focus', 'attention',
        'strictly', 'crucial', 'critical', 'no joke', 'deadly', 'severe', 'truth', 'fact', '😐', '🤐',
        // Telugu/Tenglish
        'nijam', 'tappadu', 'avsaram', 'matter undi', 'serious ga'
    ],
    sarcastic: [
        'yeah right', 'sure', 'whatever', 'slow clap', 'great job', 'nice one', 'genius',
        'obviously', 'clearly', 'wow', 'thanks a lot', 'big deal', '🙄', '😒', 'fuck off', 'clap',
        // Telugu/Tenglish
        'avuna', 'nijama', 'great le', 'pedda', 'chal', 'lite'
    ],
    supportive: [
        'there for you', 'dont worry', 'it will be ok', 'im here', 'help', 'support', 'got your back',
        'care', 'protect', 'understand', 'listening', 'proud', 'brave', 'strong', 'you can do it',
        '👍', '🤝', '🤗', '💪',
        // Telugu/Tenglish
        'nenunna', 'nenu unna', 'bhayam vaddu', 'dhairyam', 'thodu', 'parledu'
    ],
    neutral: [
        'ok', 'okay', 'hmm', 'k', 'yeah', 'yes', 'no', 'see', 'check', 'done', 'will do',
        'maybe', 'fine', 'alright', 'correct', 'right',
        // Telugu/Tenglish
        'sare', 'hamm', 'sari', 'aithe', 'chuddam'
    ]
};

const MOOD_META = {
    happy: { emoji: '😊', text: 'Positive Vibes' },
    sad: { emoji: '😔', text: 'Feeling Down' },
    angry: { emoji: '😡', text: 'Heated Moment' },
    excited: { emoji: '🤩', text: 'High Energy!' },
    romantic: { emoji: '🥰', text: 'Love is in the air' },
    calm: { emoji: '😌', text: 'Peaceful Flow' },
    confused: { emoji: '🤔', text: 'Confusion detected' },
    serious: { emoji: '😐', text: 'Serious Talk' },
    sarcastic: { emoji: '🙄', text: 'Sarcasm detected' },
    supportive: { emoji: '🤗', text: 'Supportive Tone' },
    neutral: { emoji: '😶', text: 'Neutral' }
};

/**
 * Detects mood with Sliding Window, Recency Weighting, and Confidence Scoring.
 * @param {Array} messages - Full message history
 * @returns {Object|null} - { ...moodMeta, score: number, id: string }
 */
export const detectMood = (messages) => {
    if (!messages || messages.length === 0) return null;

    // Sliding Window: Last 3 Text Messages (Hyper-focused on present)
    const textMessages = messages
        .filter(m => m.type === 'text' && m.text)
        .slice(-3);

    if (textMessages.length === 0) return MOOD_META.neutral;

    let scores = {};
    Object.keys(MOOD_KEYWORDS).forEach(k => scores[k] = 0);

    textMessages.forEach((msg, index) => {
        const text = msg.text.toLowerCase();

        // HYPER Recency Weighting: 
        // Last message gets massive bonus (5x) to ensure immediate switching.
        // Previous messages only provide slight context.
        const isLatest = index === textMessages.length - 1;
        const weight = isLatest ? 5.0 : 1.0;

        Object.keys(MOOD_KEYWORDS).forEach(mood => {
            MOOD_KEYWORDS[mood].forEach(keyword => {
                if (text.includes(keyword)) {
                    // Exact match bonus
                    let matchScore = 1;
                    if (text === keyword) matchScore = 2; // Strict message match

                    scores[mood] += (matchScore * weight);
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

    // Low Threshold for Instant Reaction
    if (maxScore < 0.1 && dominant !== 'neutral') {
        return { ...MOOD_META.neutral, score: 0.1, id: 'neutral' };
    }

    return {
        ...MOOD_META[dominant],
        score: maxScore,
        id: dominant
    };
};
